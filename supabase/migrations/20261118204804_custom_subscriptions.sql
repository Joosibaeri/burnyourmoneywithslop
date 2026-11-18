-- Each custom subscription has a stable logical ID and retained price periods.
-- Multiple subscriptions may have the same name; names are not billing identities.
create table public.custom_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  monthly_price_usd numeric(10,2) not null check (monthly_price_usd between 0 and 99999999.99),
  tools text[] not null check (cardinality(tools) > 0 and tools <@ array['claude-code', 'cursor', 'codex', 'opencode']::text[]),
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  unique (user_id, subscription_id, started_at)
);
create unique index idx_one_active_custom_subscription
  on public.custom_subscriptions (user_id, subscription_id) where active;

alter table public.custom_subscriptions enable row level security;
create policy "Users can manage own custom subscriptions"
  on public.custom_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Remove inherited hosted ALL grants, including anonymous reads and truncation.
revoke all on public.custom_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.custom_subscriptions to authenticated;
create trigger custom_subscriptions_updated_at before update on public.custom_subscriptions
  for each row execute function public.update_updated_at();

create function public.set_custom_subscription(
  p_subscription_id uuid, p_name text, p_monthly_price numeric,
  p_tools text[], p_active boolean
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_subscription_id uuid := coalesce(p_subscription_id, gen_random_uuid());
  v_previous public.custom_subscriptions%rowtype;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to manage custom subscriptions' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'Specify whether the subscription is active' using errcode = '22023';
  end if;
  if p_subscription_id is not null and not exists (
    select 1 from public.custom_subscriptions
      where user_id = v_user_id and subscription_id = p_subscription_id
  ) then
    raise exception 'Custom subscription not found' using errcode = '42501';
  end if;
  if not p_active and p_subscription_id is null then
    raise exception 'Choose a custom subscription to stop tracking' using errcode = '22023';
  end if;
  if p_active then
    if p_name is null or length(trim(p_name)) not between 1 and 100 then
      raise exception 'Enter a subscription name (1-100 characters)' using errcode = '22023';
    end if;
    if p_monthly_price is null or p_monthly_price < 0 or p_monthly_price > 99999999.99
      or round(p_monthly_price, 2) <> p_monthly_price then
      raise exception 'Enter a non-negative monthly USD price with at most two decimals' using errcode = '22023';
    end if;
    if p_tools is null or cardinality(p_tools) = 0
      or not (p_tools <@ array['claude-code', 'cursor', 'codex', 'opencode']::text[]) then
      raise exception 'Choose at least one supported tool' using errcode = '22023';
    end if;
  end if;

  -- Serialize edits/reactivation of one logical subscription, including periods
  -- that have no active row to lock. The transaction contains no network work.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || v_subscription_id::text, 0));
  select * into v_previous from public.custom_subscriptions
    where user_id = v_user_id and subscription_id = v_subscription_id and active for update;
  if not p_active then
    update public.custom_subscriptions
      set active = false, ended_at = greatest(now(), started_at + interval '1 microsecond')
      where id = v_previous.id;
    return v_subscription_id;
  end if;
  if v_previous.id is not null and v_previous.started_at < v_month then
    update public.custom_subscriptions set active = false, ended_at = v_month where id = v_previous.id;
  end if;
  select id into v_id from public.custom_subscriptions
    where user_id = v_user_id and subscription_id = v_subscription_id and started_at >= v_month
    order by started_at desc, id limit 1 for update;
  if v_id is not null then
    update public.custom_subscriptions set name = trim(p_name), monthly_price_usd = p_monthly_price,
      tools = p_tools, active = true, ended_at = null where id = v_id;
  else
    insert into public.custom_subscriptions (subscription_id, user_id, name, monthly_price_usd, tools, started_at)
      values (v_subscription_id, v_user_id, trim(p_name), p_monthly_price, p_tools, v_month);
  end if;
  return v_subscription_id;
end;
$$;
revoke all on function public.set_custom_subscription(uuid, text, numeric, text[], boolean) from public, anon, authenticated;
grant execute on function public.set_custom_subscription(uuid, text, numeric, text[], boolean) to authenticated;

-- Existing catalogue pricing is unchanged. Add each used custom subscription
-- once per logical ID/user/UTC month, even when several tools are covered.
create or replace function public.calculate_monthly_real_cost(p_user_id uuid, p_month date)
returns numeric(10,2) language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select date_trunc('month', p_month::timestamp) at time zone 'UTC' as month_start,
      (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'UTC' as month_end
  ), used_subscriptions as (
    select distinct on (us.catalog) us.*
    from public.user_subscriptions us cross join bounds b
    where us.user_id = p_user_id and us.started_at < b.month_end
      and (us.ended_at is null or us.ended_at > b.month_start)
      and (us.active or us.ended_at is not null)
      and exists (
        select 1 from public.usage_events ue
        where ue.user_id = us.user_id
          and ue.occurred_at >= greatest(b.month_start, us.started_at)
          and ue.occurred_at < least(b.month_end, coalesce(us.ended_at, b.month_end))
          and ue.tool = any(case when cardinality(us.tools) > 0 then us.tools else
            case us.catalog when 'claude-pro' then array['claude-code', 'opencode']
              when 'cursor' then array['cursor'] when 'chatgpt' then array['codex', 'opencode']
              else array['opencode', 'claude-code', 'codex'] end end)
      )
    order by us.catalog, us.started_at desc, us.id
  ), used_custom as (
    select distinct on (cs.subscription_id) cs.*
    from public.custom_subscriptions cs cross join bounds b
    where cs.user_id = p_user_id and cs.started_at < b.month_end
      and (cs.ended_at is null or cs.ended_at > b.month_start)
      and (cs.active or cs.ended_at is not null)
      and exists (
        select 1 from public.usage_events ue where ue.user_id = cs.user_id
          and ue.occurred_at >= greatest(b.month_start, cs.started_at)
          and ue.occurred_at < least(b.month_end, coalesce(cs.ended_at, b.month_end))
          and ue.tool = any(cs.tools)
      )
    order by cs.subscription_id, cs.started_at desc, cs.id
  ), catalogue_cost as (
    select coalesce(sum(coalesce(us.custom_price_usd,
      case us.catalog
        when 'claude-pro' then case us.tier when 'pro' then 20 when 'max' then 100 when 'ultra' then 200 else 0 end
        when 'cursor' then case us.tier when 'plus' then 8 when 'premium' then 30 when 'super' then 100 when 'ultra' then 200
          when 'pro' then 20 when 'pro-plus' then 60 when 'teams-standard' then 40 when 'teams-premium' then 120 else 0 end
        when 'chatgpt' then case us.tier when 'plus' then 20 when 'pro-100' then 100 when 'pro-200' then 200 when 'pro-500' then 500 else 0 end
        when 'opencode' then case us.tier when 'go' then 10 when 'go-plus' then 40 when 'go-teams' then 20 else 0 end
        else 0 end)), 0) as cost from used_subscriptions us
  )
  select catalogue_cost.cost + coalesce((select sum(monthly_price_usd) from used_custom), 0) from catalogue_cost;
$$;
