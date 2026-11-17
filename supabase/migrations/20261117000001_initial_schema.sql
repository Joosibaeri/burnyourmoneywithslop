-- Burn Your Money With Slop - Initial Schema
-- Run with: supabase db push --remote --yes

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Custom types
create type subscription_catalog as enum (
  'claude-pro', 'cursor', 'chatgpt', 'opencode'
);

create type subscription_tier as enum (
  'free', 'plus', 'pro', 'pro-100', 'pro-200', 'pro-500',
  'max', 'ultra', 'premium', 'super'
);

-- Profiles table (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  github_login text unique,
  github_id bigint unique,
  avatar_url text,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- Groups table
create table public.groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.groups enable row level security;

-- Groups policies
create policy "Members can view group"
  on public.groups for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members
      where group_id = groups.id
      and user_id = (select auth.uid())
    )
  );

create policy "Owner can update group"
  on public.groups for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owner can delete group"
  on public.groups for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Authenticated users can create groups"
  on public.groups for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

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

-- Group members policies
create policy "Members can view group members"
  on public.group_members for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id
      and gm.user_id = (select auth.uid())
    )
  );

create policy "Owner can manage members"
  on public.group_members for all
  to authenticated
  using (
    exists (
      select 1 from public.groups
      where id = group_members.group_id
      and owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.groups
      where id = group_members.group_id
      and owner_id = (select auth.uid())
    )
  );

create policy "Users can join via invite"
  on public.group_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.groups
      where id = group_members.group_id
      and invite_code = (select invite_code from public.groups where id = group_members.group_id)
    )
    and user_id = (select auth.uid())
  );

-- User subscriptions table (actual paid subscriptions)
create table public.user_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  catalog subscription_catalog not null,
  tier subscription_tier not null,
  custom_price_usd numeric(10,2),
  tools text[] not null default '{}',
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.user_subscriptions enable row level security;

-- User subscriptions policies
create policy "Users can view own subscriptions"
  on public.user_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can manage own subscriptions"
  on public.user_subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Usage events table (from plugins)
create table public.usage_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool text not null check (tool in ('opencode', 'claude-code', 'cursor', 'codex')),
  event_type text not null check (event_type in ('session_end', 'model_request', 'usage_update')),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  model text,
  session_id text,
  metadata jsonb not null default '{}',
  received_at timestamptz not null default now(),
  occurred_at timestamptz not null
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
create index idx_user_subscriptions_user_active on public.user_subscriptions (user_id, active) where active = true;
create index idx_group_members_user on public.group_members (user_id);

-- Monthly aggregation view (for charts)
create view public.monthly_usage_summary as
select
  ue.user_id,
  date_trunc('month', ue.occurred_at) as month,
  ue.tool,
  sum(ue.input_tokens + ue.output_tokens + ue.reasoning_tokens + ue.cache_read_tokens + ue.cache_write_tokens) as total_tokens,
  sum(ue.estimated_cost_usd) as total_estimated_cost,
  count(*) as event_count
from public.usage_events ue
group by ue.user_id, date_trunc('month', ue.occurred_at), ue.tool;

-- Grant access to views
grant select on public.monthly_usage_summary to authenticated;

-- Function to calculate monthly real cost (subscriptions used in that month)
create or replace function public.calculate_monthly_real_cost(p_user_id uuid, p_month date)
returns numeric(10,2) language sql stable as $$
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
          when 'opencode' then 0
          else 0
        end
    end
  ), 0)
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.active = true
    and us.started_at <= (p_month + interval '1 month - 1 day')
    and (us.ended_at is null or us.ended_at >= p_month)
    -- Only count once per catalog per month (shared subscription across tools)
    and not exists (
      select 1 from public.user_subscriptions us2
      where us2.user_id = us.user_id
        and us2.catalog = us.catalog
        and us2.active = true
        and us2.started_at <= us.started_at
        and (us2.ended_at is null or us2.ended_at >= p_month)
        and us2.id < us.id
    );
$$;

-- Trigger to update updated_at
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger groups_updated_at
  before update on public.groups
  for each row execute function public.update_updated_at();

create trigger user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute function public.update_updated_at();

-- Grant explicit access to anon and authenticated roles (Supabase v3+ requirement)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.user_subscriptions to authenticated;
grant select, insert on public.usage_events to authenticated;
grant select on public.monthly_usage_summary to authenticated;