-- Burn Your Money With Slop - Initial Schema
-- Run with: supabase db push --remote --yes

-- Privileged helpers are not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- Custom types
create type subscription_catalog as enum (
  'claude-pro', 'cursor', 'chatgpt', 'opencode'
);

create type subscription_tier as enum (
  'free', 'plus', 'pro', 'pro-100', 'pro-200', 'pro-500',
  'max', 'ultra', 'premium', 'super', 'go', 'go-plus', 'go-teams',
  'pro-plus', 'teams-standard', 'teams-premium'
);

-- Profiles table (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  github_login text unique,
  github_id bigint unique,
  avatar_url text,
  display_name text,
  stats_public boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Profiles policies
create policy "Public GitHub profiles"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Groups table
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text unique not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.groups enable row level security;

-- Group members table
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- Enable RLS
alter table public.group_members enable row level security;

-- These bounded, caller-scoped lookups avoid self-recursive membership RLS.
create function private.is_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid())
  );
$$;

create function private.is_group_owner(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_group_member(uuid), private.is_group_owner(uuid) from public, anon;
grant execute on function private.is_group_member(uuid), private.is_group_owner(uuid) to authenticated;

-- Create policies only after both groups and group_members exist.
create policy "Members can view group"
  on public.groups for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_group_member(id));

create policy "Owner can update group"
  on public.groups for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owner can delete group"
  on public.groups for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Authenticated users can create groups"
  on public.groups for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Members can view group members"
  on public.group_members for select
  to authenticated
  using (private.is_group_member(group_id) or private.is_group_owner(group_id));

create policy "Owner can update member roles"
  on public.group_members for update
  to authenticated
  using (private.is_group_owner(group_id) and role <> 'owner')
  with check (private.is_group_owner(group_id) and role <> 'owner');

create policy "Owner can remove members or members can leave"
  on public.group_members for delete to authenticated
  using (role <> 'owner' and (private.is_group_owner(group_id) or user_id = (select auth.uid())));

create function private.add_group_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'Cannot create a group for another user' using errcode = '42501';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
revoke all on function private.add_group_owner() from public, anon, authenticated;
create trigger group_owner_created after insert on public.groups
  for each row execute function private.add_group_owner();

-- Only possession of an unguessable invite code permits self-joining.
create function private.join_group(p_invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to join a group' using errcode = '42501';
  end if;
  select id into v_group_id from public.groups where invite_code = p_invite_code;
  if v_group_id is null then
    raise exception 'Invalid invite code' using errcode = '22023';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'member') on conflict do nothing;
  return v_group_id;
end;
$$;
revoke all on function private.join_group(text) from public, anon;
grant execute on function private.join_group(text) to authenticated;

create function public.join_group(p_invite_code text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.join_group(p_invite_code);
$$;
revoke all on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- User subscriptions table (actual paid subscriptions)
create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  catalog subscription_catalog not null,
  tier subscription_tier not null,
  custom_price_usd numeric(10,2) check (custom_price_usd >= 0),
  tools text[] not null default '{}',
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (ended_at is null or ended_at > started_at),
  check (tools <@ array['claude-code', 'cursor', 'codex', 'opencode']::text[]),
  check (
    (catalog = 'claude-pro' and tier in ('pro', 'max', 'ultra')) or
    (catalog = 'cursor' and tier in ('free', 'plus', 'premium', 'super', 'ultra', 'pro', 'pro-plus', 'teams-standard', 'teams-premium')) or
    (catalog = 'chatgpt' and tier in ('plus', 'pro-100', 'pro-200', 'pro-500')) or
    (catalog = 'opencode' and tier in ('free', 'go', 'go-plus', 'go-teams'))
  )
);
create unique index idx_one_active_subscription_per_catalog
  on public.user_subscriptions (user_id, catalog) where active;

-- Enable RLS
alter table public.user_subscriptions enable row level security;

-- User subscriptions policies
create policy "Users can manage own subscriptions"
  on public.user_subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Atomically save an invoice/plan for the current UTC calendar month, retaining older months.
-- This runs as the caller: ordinary ownership RLS applies to every statement.
create function public.set_subscription(
  p_catalog public.subscription_catalog, p_tier public.subscription_tier,
  p_custom_price numeric, p_tools text[], p_active boolean
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_previous public.user_subscriptions%rowtype;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to manage subscriptions' using errcode = '42501';
  end if;
  select * into v_previous from public.user_subscriptions
    where user_id = v_user_id and catalog = p_catalog and active for update;
  if not p_active then
    update public.user_subscriptions set active = false, ended_at = now()
      where id = v_previous.id;
    return v_previous.id;
  end if;
  if v_previous.id is not null and v_previous.started_at < v_month then
    update public.user_subscriptions set active = false, ended_at = v_month where id = v_previous.id;
  end if;
  select id into v_id from public.user_subscriptions
    where user_id = v_user_id and catalog = p_catalog and started_at >= v_month
    order by started_at desc, id limit 1 for update;
  if v_id is not null then
    update public.user_subscriptions
      set tier = p_tier, custom_price_usd = p_custom_price, tools = p_tools, active = true, ended_at = null
      where id = v_id;
  else
    insert into public.user_subscriptions (user_id, catalog, tier, custom_price_usd, tools, started_at)
      values (v_user_id, p_catalog, p_tier, p_custom_price, p_tools, v_month) returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.set_subscription(public.subscription_catalog, public.subscription_tier, numeric, text[], boolean) from public, anon;
grant execute on function public.set_subscription(public.subscription_catalog, public.subscription_tier, numeric, text[], boolean) to authenticated;

-- Usage events table (from plugins)
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool text not null check (tool in ('opencode', 'claude-code', 'cursor', 'codex')),
  event_type text not null check (event_type = 'model_request'),
  event_id text not null check (event_id ~ '^[a-f0-9]{64}$'),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  estimated_cost_usd numeric(16,10) not null default 0 check (estimated_cost_usd >= 0 and estimated_cost_usd < 1000000),
  cost_source text not null default 'unavailable' check (cost_source in ('reported', 'list_price', 'unavailable')),
  model text check (length(model) <= 200),
  session_id text check (session_id ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  unique (user_id, tool, event_id)
);

-- Enable RLS
alter table public.usage_events enable row level security;

-- Usage events policies
create policy "Users can view own usage events"
  on public.usage_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own usage events"
  on public.usage_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Service role can insert usage events"
  on public.usage_events for insert
  to service_role
  with check (true);

-- Indexes for performance
create index idx_usage_events_user_occurred on public.usage_events (user_id, occurred_at desc);
create index idx_usage_events_tool_occurred on public.usage_events (tool, occurred_at desc);
create index idx_user_subscriptions_user_started on public.user_subscriptions (user_id, started_at desc);
create index idx_group_members_user on public.group_members (user_id);
create index idx_groups_owner on public.groups (owner_id);

-- Function to calculate monthly real cost (subscriptions used in that month)
create or replace function public.calculate_monthly_real_cost(p_user_id uuid, p_month date)
returns numeric(10,2) language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select date_trunc('month', p_month::timestamp) at time zone 'UTC' as month_start,
      (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'UTC' as month_end
  ), used_subscriptions as (
    select distinct on (us.catalog) us.*
    from public.user_subscriptions us cross join bounds b
    where us.user_id = p_user_id
      and us.started_at < b.month_end
      and (us.ended_at is null or us.ended_at > b.month_start)
      and (us.active or us.ended_at is not null)
      and exists (
        select 1 from public.usage_events ue
        where ue.user_id = us.user_id
          and ue.occurred_at >= greatest(b.month_start, us.started_at)
          and ue.occurred_at < least(b.month_end, coalesce(us.ended_at, b.month_end))
          and ue.tool = any(case when cardinality(us.tools) > 0 then us.tools else
            case us.catalog
              when 'claude-pro' then array['claude-code', 'opencode']
              when 'cursor' then array['cursor']
              when 'chatgpt' then array['codex', 'opencode']
               else array['opencode', 'claude-code', 'codex']
            end end)
      )
    order by us.catalog, us.started_at desc, us.id
  )
  select coalesce(sum(
    case
      when us.custom_price_usd is not null then us.custom_price_usd
      else
        case us.catalog
          when 'claude-pro' then
            case us.tier
              when 'pro' then 20
              when 'max' then 100
              when 'ultra' then 200
              else 0
            end
          when 'cursor' then
            case us.tier
              when 'plus' then 8
              when 'premium' then 30
              when 'super' then 100
              when 'ultra' then 200
              when 'pro' then 20
              when 'pro-plus' then 60
              when 'teams-standard' then 40
              when 'teams-premium' then 120
              else 0
            end
          when 'chatgpt' then
            case us.tier
              when 'plus' then 20
              when 'pro-100' then 100
              when 'pro-200' then 200
              when 'pro-500' then 500
              else 0
            end
          when 'opencode' then
            case us.tier when 'go' then 10 when 'go-plus' then 40 when 'go-teams' then 20 else 0 end
          else 0
        end
    end
  ), 0)
  from used_subscriptions us;
$$;
revoke all on function public.calculate_monthly_real_cost(uuid, date) from public, anon;
grant execute on function public.calculate_monthly_real_cost(uuid, date) to authenticated;

-- The only intentional cross-user read is an aggregate, never raw events or invoices.
-- Explicit visibility checks live here because the underlying events remain owner-only.
create function private.read_monthly_usage()
returns table (
  user_id uuid, month timestamptz, tool text, total_tokens numeric,
  total_estimated_cost numeric, event_count bigint, real_cost_usd numeric, unknown_cost_events bigint
) language sql stable security definer set search_path = '' as $$
  select ue.user_id,
    date_trunc('month', ue.occurred_at at time zone 'UTC') at time zone 'UTC',
    ue.tool,
    sum(ue.input_tokens::numeric + ue.output_tokens + ue.reasoning_tokens + ue.cache_read_tokens + ue.cache_write_tokens),
    sum(ue.estimated_cost_usd), count(*),
    public.calculate_monthly_real_cost(ue.user_id, date_trunc('month', ue.occurred_at at time zone 'UTC')::date),
    count(*) filter (where ue.cost_source = 'unavailable')
  from public.usage_events ue join public.profiles p on p.id = ue.user_id
  where p.stats_public or ue.user_id = (select auth.uid()) or exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = ue.user_id
  )
  group by ue.user_id, date_trunc('month', ue.occurred_at at time zone 'UTC'), ue.tool;
$$;
revoke all on function private.read_monthly_usage() from public;
grant execute on function private.read_monthly_usage() to anon, authenticated;

create view public.monthly_usage_summary with (security_invoker = true) as
  select * from private.read_monthly_usage();
grant select on public.monthly_usage_summary to anon, authenticated;

-- Create the GitHub profile on sign-up; metadata is used only for display, not authorization.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.id <> (select auth.uid()) then
    raise exception 'Cannot provision another user' using errcode = '42501';
  end if;
  insert into public.profiles (id, github_login, github_id, avatar_url, display_name)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'user_name', new.raw_user_meta_data->>'preferred_username', new.raw_user_meta_data->>'login')),
    case when new.raw_user_meta_data->>'provider_id' ~ '^[0-9]{1,18}$'
      then (new.raw_user_meta_data->>'provider_id')::bigint else null end,
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Trigger to update updated_at
create or replace function public.update_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
revoke all on function public.update_updated_at() from public, anon, authenticated;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger groups_updated_at
  before update on public.groups
  for each row execute function public.update_updated_at();

create trigger user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute function public.update_updated_at();

-- Explicit, least-privilege Data API grants (independent of the CLI version).
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, stats_public) on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
-- Membership is consent-based: only the invite RPC may insert a new member.
-- A group owner cannot add arbitrary users or rewrite membership identities to read private stats.
grant select, delete on public.group_members to authenticated;
grant update (role) on public.group_members to authenticated;
grant select, insert, update, delete on public.user_subscriptions to authenticated;
grant select, insert on public.usage_events to authenticated;
grant select on public.monthly_usage_summary to authenticated;

-- Receipts stay private, independently of public aggregate statistics.
insert into storage.buckets (id, name, public)
values ('usage-data', 'usage-data', false) on conflict (id) do nothing;

create policy "Users can read own receipts" on storage.objects for select to authenticated
  using (bucket_id = 'usage-data' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload own receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'usage-data' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can update own receipts" on storage.objects for update to authenticated
  using (bucket_id = 'usage-data' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'usage-data' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete own receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'usage-data' and (storage.foldername(name))[1] = (select auth.uid())::text);
