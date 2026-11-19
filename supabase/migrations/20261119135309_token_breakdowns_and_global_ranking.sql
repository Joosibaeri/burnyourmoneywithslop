-- Extend controlled aggregates without exposing events, invoices or group membership.
-- Text counters survive JSON/JavaScript decoding even above 2^53 - 1. The original
-- columns remain in place for older clients during the frontend deployment.
create function private.read_monthly_usage_with_tokens()
returns table (
  user_id uuid, month timestamptz, tool text, total_tokens numeric,
  total_estimated_cost numeric, event_count bigint, real_cost_usd numeric, unknown_cost_events bigint,
  input_tokens text, output_tokens text, reasoning_tokens text,
  cache_read_tokens text, cache_write_tokens text, total_tokens_exact text
) language sql stable security definer set search_path = '' as $$
  select ue.user_id,
    date_trunc('month', ue.occurred_at at time zone 'UTC') at time zone 'UTC',
    ue.tool,
    sum(ue.input_tokens::numeric + ue.output_tokens + ue.reasoning_tokens + ue.cache_read_tokens + ue.cache_write_tokens),
    sum(ue.estimated_cost_usd), count(*),
    public.calculate_monthly_real_cost(ue.user_id, date_trunc('month', ue.occurred_at at time zone 'UTC')::date),
    count(*) filter (where ue.cost_source = 'unavailable'),
    sum(ue.input_tokens)::text, sum(ue.output_tokens)::text, sum(ue.reasoning_tokens)::text,
    sum(ue.cache_read_tokens)::text, sum(ue.cache_write_tokens)::text,
    sum(ue.input_tokens::numeric + ue.output_tokens + ue.reasoning_tokens + ue.cache_read_tokens + ue.cache_write_tokens)::text
  from public.usage_events ue join public.profiles p on p.id = ue.user_id
  where p.stats_public or ue.user_id = (select auth.uid()) or exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = ue.user_id
  )
  group by ue.user_id, date_trunc('month', ue.occurred_at at time zone 'UTC'), ue.tool;
$$;
revoke all on function private.read_monthly_usage_with_tokens() from public, anon, authenticated;
grant execute on function private.read_monthly_usage_with_tokens() to anon, authenticated;

create or replace view public.monthly_usage_summary with (security_invoker = true) as
  select * from private.read_monthly_usage_with_tokens();
grant select on public.monthly_usage_summary to anon, authenticated;

-- Global ranking is deliberately PUBLIC-ONLY, including for signed-in owners
-- and friends. Ordinary invoker permissions apply; the only privileged read
-- remains the visibility-checked monthly aggregate above. Rank before paging.
create function public.get_global_ranking(
  p_month date default (now() at time zone 'UTC')::date,
  p_metric text default 'total', p_limit integer default 50, p_offset integer default 0
)
returns table (
  user_id uuid, github_login text, display_name text, avatar_url text,
  real_cost_usd numeric, total_estimated_cost numeric, unknown_cost_events bigint,
  input_tokens text, output_tokens text, reasoning_tokens text,
  cache_read_tokens text, cache_write_tokens text, total_tokens_exact text,
  rank bigint, total_members bigint
) language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_metric is null or p_metric not in ('spent', 'estimated', 'input', 'output', 'input_output', 'total', 'cached', 'cache_read', 'cache_write', 'reasoning') then
    raise exception 'Invalid ranking metric' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Invalid ranking page' using errcode = '22023';
  end if;

  return query
  with visible_usage as (
    select s.* from public.monthly_usage_summary s
    join public.profiles p on p.id = s.user_id and p.stats_public
    where p_month is null or s.month = date_trunc('month', p_month::timestamp) at time zone 'UTC'
  ), monthly_costs as (
    -- Monthly real costs repeat per tool. Count them once per user/month.
    select s.user_id, s.month, max(s.real_cost_usd) as spent
    from visible_usage s group by s.user_id, s.month
  ), costs as (
    select c.user_id, sum(c.spent) as spent from monthly_costs c group by c.user_id
  ), tokens as (
    select s.user_id,
      sum(s.input_tokens::numeric) as input, sum(s.output_tokens::numeric) as output,
      sum(s.reasoning_tokens::numeric) as reasoning,
      sum(s.cache_read_tokens::numeric) as cache_read, sum(s.cache_write_tokens::numeric) as cache_write,
      sum(s.total_estimated_cost) as estimated, sum(s.unknown_cost_events)::bigint as unknown_costs
    from visible_usage s group by s.user_id
  ), totals as (
    select p.id, p.github_login, p.display_name, p.avatar_url, c.spent, t.*,
      case p_metric
        when 'spent' then c.spent
        when 'estimated' then t.estimated
        when 'input' then t.input
        when 'output' then t.output + t.reasoning
        when 'input_output' then t.input + t.output + t.reasoning
        when 'cached' then t.cache_read + t.cache_write
        when 'cache_read' then t.cache_read
        when 'cache_write' then t.cache_write
        when 'reasoning' then t.reasoning
        else t.input + t.output + t.reasoning + t.cache_read + t.cache_write
      end as metric_value
    from tokens t join costs c on c.user_id = t.user_id
    join public.profiles p on p.id = t.user_id and p.stats_public
  ), ranked as (
    select t.*, rank() over (order by t.metric_value desc) as position,
      count(*) over () as member_count from totals t
  )
  select r.id, r.github_login, r.display_name, r.avatar_url, r.spent, r.estimated, r.unknown_costs,
    r.input::text, r.output::text, r.reasoning::text, r.cache_read::text, r.cache_write::text,
    (r.input + r.output + r.reasoning + r.cache_read + r.cache_write)::text,
    r.position, r.member_count
  from ranked r order by r.position, r.github_login nulls last, r.id
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.get_global_ranking(date, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_global_ranking(date, text, integer, integer) to anon, authenticated;

comment on function public.get_global_ranking(date, text, integer, integer) is
  'Public-statistics users with recorded usage only. Null month means all time. Out includes reasoning; Cached includes reads and writes. No raw events or billing records.';
