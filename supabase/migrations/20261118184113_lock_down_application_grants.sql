-- Hosted projects may inherit permissive default table grants. A later GRANT
-- does not remove them, and table-wide UPDATE defeats column-only restrictions.
-- Restrict only this application's objects, not project-wide default privileges.
revoke all privileges on table
  public.profiles, public.groups, public.group_members,
  public.user_subscriptions, public.usage_events, public.monthly_usage_summary
from public, anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url, stats_public) on public.profiles to authenticated;

grant select, delete on public.groups to authenticated;
grant insert (name, description, owner_id) on public.groups to authenticated;
grant update (name, description, invite_code) on public.groups to authenticated;

-- New membership can only be inserted by the consent-based invite RPC.
-- Owners may change roles, never reassign a membership to another user/group.
grant select, delete on public.group_members to authenticated;
grant update (role) on public.group_members to authenticated;

-- The caller-scoped billing RPC is security-invoker and needs these operations.
grant select, insert, update, delete on public.user_subscriptions to authenticated;

grant select on public.usage_events to authenticated;
grant insert (
  user_id, tool, event_type, event_id, input_tokens, output_tokens,
  reasoning_tokens, cache_read_tokens, cache_write_tokens,
  estimated_cost_usd, cost_source, model, session_id, occurred_at
) on public.usage_events to authenticated;

grant select on public.monthly_usage_summary to anon, authenticated;
