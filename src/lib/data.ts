import type { SupabaseClient } from '@supabase/supabase-js'
import { SUBSCRIPTION_CATALOG, getMockGroups, getMockMonthlyData, getMockStats } from './utils'

export interface UsageSummary {
  user_id: string
  month: string
  tool: string
  total_tokens: number | string
  total_estimated_cost: number | string
  real_cost_usd: number | string
  unknown_cost_events?: number | string
}

export interface SubscriptionRecord {
  id: string
  catalog: string
  tier: string
  custom_price_usd: number | string | null
  tools: string[]
  active: boolean
  started_at: string
  ended_at: string | null
}

export interface SubscriptionSelection {
  catalogId: string
  tierId: string
  customPrice?: number
  tools: string[]
}

export interface ProfileRecord {
  id: string
  github_login: string | null
  display_name: string | null
  avatar_url: string | null
  stats_public: boolean
  created_at: string | null
}

export type GroupData = ReturnType<typeof getMockGroups>[number] & {
  ownerId?: string
  inviteCode?: string
  trend?: Array<{ month: string; values: Record<string, number> }>
}

export type DashboardStats = Omit<ReturnType<typeof getMockStats>, 'spentChange' | 'tokensChange'> & {
  totalEstimated: number
  unknownCostEvents?: number
  spentChange: { value: number; positive: boolean } | null
  tokensChange: { value: number; positive: boolean } | null
}

export const TOOLS: Record<string, { name: string; color: string }> = {
  'claude-code': { name: 'Claude Code', color: '#60a5fa' },
  cursor: { name: 'Cursor', color: '#c084fc' },
  opencode: { name: 'OpenCode', color: '#f97316' },
  codex: { name: 'Codex', color: '#22c55e' },
}

export function githubLogin(user: { user_metadata?: Record<string, unknown> } | null): string {
  const metadata = user?.user_metadata ?? {}
  return String(metadata.user_name ?? metadata.preferred_username ?? metadata.login ?? '')
}

export function aggregateUsage(rows: UsageSummary[]) {
  const months = new Map<string, { month: string; spent: number; tokens: number; estimated: number }>()
  const userMonthlyCosts = new Map<string, number>()
  for (const row of rows) {
    const key = row.month.slice(0, 7)
    const month = months.get(key) ?? { month: key, spent: 0, tokens: 0, estimated: 0 }
    // The view repeats costs per tool. Count once per user/month, not once per
    // tool or once for an entire group of different users.
    const userMonth = `${row.user_id}:${key}`
    const previousCost = userMonthlyCosts.get(userMonth) ?? 0
    const cost = Math.max(previousCost, Number(row.real_cost_usd))
    month.spent += cost - previousCost
    userMonthlyCosts.set(userMonth, cost)
    month.tokens += Number(row.total_tokens)
    month.estimated += Number(row.total_estimated_cost)
    months.set(key, month)
  }
  const monthlyData = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  const breakdown = new Map<string, { name: string; tokens: number; cost: number; color: string; unknownCostEvents: number }>()
  for (const row of rows) {
    const tool = breakdown.get(row.tool) ?? { ...(TOOLS[row.tool] ?? { name: row.tool, color: '#60a5fa' }), tokens: 0, cost: 0, unknownCostEvents: 0 }
    tool.tokens += Number(row.total_tokens)
    tool.cost += Number(row.total_estimated_cost)
    tool.unknownCostEvents += Number(row.unknown_cost_events ?? 0)
    breakdown.set(row.tool, tool)
  }
  return {
    totalSpent: monthlyData.reduce((sum, month) => sum + month.spent, 0),
    totalTokens: monthlyData.reduce((sum, month) => sum + month.tokens, 0),
    totalEstimated: monthlyData.reduce((sum, month) => sum + month.estimated, 0),
    unknownCostEvents: rows.reduce((sum, row) => sum + Number(row.unknown_cost_events ?? 0), 0),
    toolBreakdown: [...breakdown.values()],
    monthlyData,
  }
}

export function emptyStats(): DashboardStats {
  return { totalSpent: 0, totalEstimated: 0, unknownCostEvents: 0, totalTokens: 0, activeTools: 0, groupCount: 0, spentChange: null, tokensChange: null, toolBreakdown: [], subscriptions: [] }
}

export async function loadUsage(supabase: SupabaseClient, userIds: string[]): Promise<UsageSummary[]> {
  if (!userIds.length) return []
  const rows: UsageSummary[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('monthly_usage_summary').select('*')
      .in('user_id', userIds).order('month').order('user_id').order('tool').range(offset, offset + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

export async function loadGroups(supabase: SupabaseClient, userId: string, groupId?: string): Promise<GroupData[]> {
  let query = supabase.from('groups')
    .select('id, name, description, owner_id, invite_code, group_members(user_id, role, profiles(id, github_login, display_name, avatar_url))')
    .order('created_at', { ascending: false })
  if (groupId) query = query.eq('id', groupId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const groups = data ?? []
  const userIds = [...new Set(groups.flatMap(group => group.group_members.map(member => member.user_id as string)))]
  const usage = await loadUsage(supabase, userIds)
  const currentMonth = new Date().toISOString().slice(0, 7)
  return groups.map(group => {
    const members = [...group.group_members].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner')).map(member => {
      const profile = (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles) as { github_login?: string; display_name?: string; avatar_url?: string } | null
      const stats = aggregateUsage(usage.filter(row => row.user_id === member.user_id && row.month.startsWith(currentMonth)))
      return { id: String(member.user_id), name: profile?.display_name || profile?.github_login || 'Member', login: profile?.github_login || '', avatar: profile?.avatar_url || '', spent: stats.totalSpent, tokens: stats.totalTokens, tools: stats.toolBreakdown.map(tool => tool.name) }
    })
    const sorted = [...members].sort((a, b) => b.spent - a.spent)
    const monthKeys = [...new Set(usage.filter(row => members.some(member => member.id === row.user_id)).map(row => row.month.slice(0, 7)))].sort().slice(-12)
    return {
      id: String(group.id), name: String(group.name), description: group.description || '', ownerId: String(group.owner_id), inviteCode: String(group.invite_code),
      members, memberCount: members.length, totalSpent: members.reduce((sum, member) => sum + member.spent, 0), totalTokens: members.reduce((sum, member) => sum + member.tokens, 0),
      yourRank: sorted.findIndex(member => member.id === userId) + 1,
      trend: monthKeys.map(month => ({ month, values: Object.fromEntries(members.map(member => [member.id, aggregateUsage(usage.filter(row => row.user_id === member.id && row.month.startsWith(month))).totalSpent])) })),
    }
  })
}

export function subscriptionPrice(sub: { catalog: string; tier: string; custom_price_usd: number | string | null }): number {
  return sub.custom_price_usd != null ? Number(sub.custom_price_usd) : SUBSCRIPTION_CATALOG.find(catalog => catalog.id === sub.catalog)?.tiers.find(tier => tier.id === sub.tier)?.price ?? 0
}

export function subscriptionTools(catalog: string): string[] {
  return catalog === 'claude-pro' ? ['claude-code', 'opencode'] : catalog === 'chatgpt' ? ['codex', 'opencode'] : catalog === 'opencode' ? ['opencode', 'claude-code', 'codex'] : ['cursor']
}

export function recentUsageMonths(rows: Array<{ month: string; spent: number; tokens: number; estimated: number }>, count: number, now = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + index + 1, 1)).toISOString().slice(0, 7)
    return rows.find(row => row.month === month) ?? { month, spent: 0, tokens: 0, estimated: 0 }
  })
}

export async function loadSubscriptions(supabase: SupabaseClient, userId: string): Promise<SubscriptionRecord[]> {
  const { data, error } = await supabase.from('user_subscriptions').select('*').eq('user_id', userId).order('started_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function saveSubscription(supabase: SupabaseClient, sub: SubscriptionSelection, active = true): Promise<void> {
  const { error } = await supabase.rpc('set_subscription', {
    p_catalog: sub.catalogId, p_tier: sub.tierId, p_custom_price: sub.customPrice ?? null,
    p_tools: sub.tools, p_active: active,
  })
  if (error) throw new Error(error.message)
}

export function dashboardStats(rows: UsageSummary[], subscriptions: SubscriptionRecord[], groupCount: number, now = new Date()): DashboardStats {
  const month = now.toISOString().slice(0, 7)
  const summary = aggregateUsage(rows.filter(row => row.month.startsWith(month)))
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
  const previous = aggregateUsage(rows.filter(row => row.month.startsWith(previousMonth)))
  const change = (current: number, old: number) => old > 0 ? { value: (current - old) / old * 100, positive: current >= old } : null
  return {
    ...emptyStats(), ...summary, activeTools: summary.toolBreakdown.length, groupCount,
    spentChange: change(summary.totalSpent, previous.totalSpent), tokensChange: change(summary.totalTokens, previous.totalTokens),
    subscriptions: subscriptions.filter(sub => sub.active).map(sub => ({
      name: SUBSCRIPTION_CATALOG.find(catalog => catalog.id === sub.catalog)?.name ?? sub.catalog,
      tier: SUBSCRIPTION_CATALOG.find(catalog => catalog.id === sub.catalog)?.tiers.find(tier => tier.id === sub.tier)?.name ?? sub.tier,
      cost: subscriptionPrice(sub), tools: (sub.tools.length ? sub.tools : subscriptionTools(sub.catalog)).map(tool => TOOLS[tool]?.name ?? tool), active: true,
    })),
  }
}

let demoGroups: GroupData[] | null = null

export function getDemoGroups(): GroupData[] {
  demoGroups ??= getMockGroups().map(group => ({
    ...group, ownerId: group.members[0].id, inviteCode: `demo-invite-${group.id}`,
    trend: getMockMonthlyData().map(month => ({ month: month.month, values: Object.fromEntries(group.members.map(member => [member.id, member.spent * month.spent / 247])) })),
  }))
  return demoGroups
}

export function setDemoGroups(groups: GroupData[]) {
  demoGroups = groups
}

export function inviteCodeFromInput(input: string): string {
  const value = input.trim()
  if (/^https?:\/\//i.test(value)) {
    try {
      return decodeURIComponent(new URL(value).pathname.match(/^\/invite\/([^/]+)\/?$/)?.[1] ?? '')
    } catch { return '' }
  }
  return /^[\w-]{8,128}$/.test(value) ? value : ''
}
