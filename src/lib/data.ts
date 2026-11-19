import type { SupabaseClient } from '@supabase/supabase-js'
import { SUBSCRIPTION_CATALOG, addRecordedUsd, getMockGroups, getMockMonthlyData } from './utils'
import { addTokenTotals, demoTokenTotals, emptyTokenTotals, tokenTotalsFromRecord, tokenValue, type TokenCounterRecord, type TokenTotals } from './tokens'
import { rankMembers, type ComparisonMember, type ComparisonMetric, type ComparisonStats, type RankedMember } from './comparison'

export interface UsageSummary extends TokenCounterRecord {
  user_id: string
  month: string
  tool: string
  total_tokens: number | string
  total_tokens_exact: string
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

export interface CustomSubscriptionRecord {
  id: string
  subscription_id: string
  name: string
  monthly_price_usd: number | string
  tools: string[]
  active: boolean
  started_at: string
  ended_at: string | null
}

export interface CustomSubscriptionSelection {
  subscriptionId?: string
  name: string
  monthlyPrice: number
  tools: string[]
}

export interface DisplaySubscription {
  id?: string
  name: string
  tier: string
  cost: number
  tools: string[]
  active: boolean
}

export interface ProfileRecord {
  id: string
  github_login: string | null
  display_name: string | null
  avatar_url: string | null
  stats_public: boolean
  created_at: string | null
}

export interface MonthlyUsage {
  month: string
  spent: number
  tokens: number
  estimated: number
  tokenTotals: TokenTotals
  unknownCostEvents: number
}

export interface GroupMember extends ComparisonMember {
  tokens: number
  monthlyUsage: MonthlyUsage[]
}

export interface GroupData {
  id: string
  name: string
  description: string
  members: GroupMember[]
  memberCount: number
  totalSpent: number
  totalTokens: number
  yourRank: number
  ownerId?: string
  inviteCode?: string
}

export interface ToolUsage {
  name: string
  tokens: number
  cost: number
  color: string
  tokenTotals: TokenTotals
  unknownCostEvents: number
}

export interface UsageAggregate {
  totalSpent: number
  totalTokens: number
  totalEstimated: number
  tokenTotals: TokenTotals
  unknownCostEvents: number
  toolBreakdown: ToolUsage[]
  monthlyData: MonthlyUsage[]
}

export interface DashboardStats extends UsageAggregate {
  subscriptions: DisplaySubscription[]
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

export function emptyMonthlyUsage(month: string): MonthlyUsage {
  return { month, spent: 0, tokens: 0, estimated: 0, tokenTotals: emptyTokenTotals(), unknownCostEvents: 0 }
}

export function aggregateUsage(rows: UsageSummary[]): UsageAggregate {
  const months = new Map<string, MonthlyUsage>()
  const userMonthlyCosts = new Map<string, number>()
  const breakdown = new Map<string, ToolUsage>()
  for (const row of rows) {
    const key = row.month.slice(0, 7)
    const month = months.get(key) ?? emptyMonthlyUsage(key)
    const tokenTotals = tokenTotalsFromRecord(row)
    // The view repeats costs per tool. Count once per user/month, not once per
    // tool or once for an entire group of different users.
    const userMonth = `${row.user_id}:${key}`
    const previousCost = userMonthlyCosts.get(userMonth) ?? 0
    const cost = Math.max(previousCost, Number(row.real_cost_usd))
    month.spent = addRecordedUsd(month.spent, cost - previousCost)
    userMonthlyCosts.set(userMonth, cost)
    month.tokenTotals = addTokenTotals(month.tokenTotals, tokenTotals)
    month.tokens = Number(tokenValue(month.tokenTotals, 'total'))
    month.estimated += Number(row.total_estimated_cost)
    month.unknownCostEvents += Number(row.unknown_cost_events ?? 0)
    months.set(key, month)
    const tool = breakdown.get(row.tool) ?? { ...(TOOLS[row.tool] ?? { name: row.tool, color: '#60a5fa' }), tokens: 0, cost: 0, tokenTotals: emptyTokenTotals(), unknownCostEvents: 0 }
    tool.tokenTotals = addTokenTotals(tool.tokenTotals, tokenTotals)
    tool.tokens = Number(tokenValue(tool.tokenTotals, 'total'))
    tool.cost += Number(row.total_estimated_cost)
    tool.unknownCostEvents += Number(row.unknown_cost_events ?? 0)
    breakdown.set(row.tool, tool)
  }
  const monthlyData = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  const tokenTotals = monthlyData.reduce((sum, month) => addTokenTotals(sum, month.tokenTotals), emptyTokenTotals())
  return {
    totalSpent: monthlyData.reduce((sum, month) => addRecordedUsd(sum, month.spent), 0),
    totalTokens: Number(tokenValue(tokenTotals, 'total')),
    tokenTotals,
    totalEstimated: monthlyData.reduce((sum, month) => sum + month.estimated, 0),
    unknownCostEvents: rows.reduce((sum, row) => sum + Number(row.unknown_cost_events ?? 0), 0),
    toolBreakdown: [...breakdown.values()],
    monthlyData,
  }
}

export function emptyStats(): DashboardStats {
  return { totalSpent: 0, totalEstimated: 0, unknownCostEvents: 0, totalTokens: 0, tokenTotals: emptyTokenTotals(), spentChange: null, tokensChange: null, toolBreakdown: [], monthlyData: [], subscriptions: [] }
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
      const rows = usage.filter(row => row.user_id === member.user_id)
      const history = aggregateUsage(rows)
      const stats = aggregateUsage(rows.filter(row => row.month.startsWith(currentMonth)))
      return { id: String(member.user_id), name: profile?.display_name || profile?.github_login || 'Member', login: profile?.github_login || '', avatar: profile?.avatar_url || '', spent: stats.totalSpent, estimated: stats.totalEstimated, tokens: stats.totalTokens, tokenTotals: stats.tokenTotals, unknownCostEvents: stats.unknownCostEvents, tools: stats.toolBreakdown.map(tool => tool.name), monthlyUsage: history.monthlyData }
    })
    const sorted = rankMembers(members, 'spent')
    return {
      id: String(group.id), name: String(group.name), description: group.description || '', ownerId: String(group.owner_id), inviteCode: String(group.invite_code),
      members, memberCount: members.length, totalSpent: members.reduce((sum, member) => addRecordedUsd(sum, member.spent), 0), totalTokens: members.reduce((sum, member) => sum + member.tokens, 0),
      yourRank: sorted.find(member => member.id === userId)?.rank ?? 0,
    }
  })
}

export function comparisonStatsForMonth(monthlyUsage: MonthlyUsage[], month: string): ComparisonStats {
  const rows = month === 'all' ? monthlyUsage : monthlyUsage.filter(row => row.month === month)
  return rows.reduce<ComparisonStats>((sum, row) => ({
    spent: addRecordedUsd(sum.spent, row.spent), estimated: sum.estimated + row.estimated,
    tokenTotals: addTokenTotals(sum.tokenTotals, row.tokenTotals), unknownCostEvents: sum.unknownCostEvents + row.unknownCostEvents,
  }), { spent: 0, estimated: 0, tokenTotals: emptyTokenTotals(), unknownCostEvents: 0 })
}

export function groupMembersForMonth(group: GroupData, month: string): ComparisonMember[] {
  return group.members.map(member => ({ ...member, ...comparisonStatsForMonth(member.monthlyUsage, month) }))
}

interface GlobalRankingRecord extends TokenCounterRecord {
  user_id: string
  github_login: string | null
  display_name: string | null
  avatar_url: string | null
  real_cost_usd: number | string
  total_estimated_cost: number | string
  unknown_cost_events: number | string
  rank: number | string
  total_members: number | string
}

export async function loadGlobalRanking(supabase: SupabaseClient, month: string, metric: ComparisonMetric, limit = 50, offset = 0): Promise<{ members: RankedMember[]; totalMembers: number }> {
  const { data, error } = await supabase.rpc('get_global_ranking', {
    p_month: month === 'all' ? null : `${month}-01`, p_metric: metric, p_limit: limit, p_offset: offset,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as GlobalRankingRecord[]
  return {
    members: rows.map(row => ({
      id: row.user_id, login: row.github_login ?? '', name: row.display_name || row.github_login || 'Member', avatar: row.avatar_url ?? '',
      spent: Number(row.real_cost_usd), estimated: Number(row.total_estimated_cost), unknownCostEvents: Number(row.unknown_cost_events),
      tokenTotals: tokenTotalsFromRecord(row), tools: [], rank: Number(row.rank),
    })),
    totalMembers: Number(rows[0]?.total_members ?? 0),
  }
}

export function subscriptionPrice(sub: { catalog: string; tier: string; custom_price_usd: number | string | null }): number {
  return sub.custom_price_usd != null ? Number(sub.custom_price_usd) : SUBSCRIPTION_CATALOG.find(catalog => catalog.id === sub.catalog)?.tiers.find(tier => tier.id === sub.tier)?.price ?? 0
}

export function subscriptionTools(catalog: string): string[] {
  return catalog === 'claude-pro' ? ['claude-code', 'opencode'] : catalog === 'chatgpt' ? ['codex', 'opencode'] : catalog === 'opencode' ? ['opencode', 'claude-code', 'codex'] : ['cursor']
}

export function recentUsageMonths(rows: MonthlyUsage[], count: number, now = new Date()): MonthlyUsage[] {
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + index + 1, 1)).toISOString().slice(0, 7)
    return rows.find(row => row.month === month) ?? emptyMonthlyUsage(month)
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

export async function loadCustomSubscriptions(supabase: SupabaseClient, userId: string): Promise<CustomSubscriptionRecord[]> {
  const { data, error } = await supabase.from('custom_subscriptions').select('*').eq('user_id', userId).order('started_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export function customSubscriptionError(sub: CustomSubscriptionSelection): string | null {
  if (!sub.name.trim() || sub.name.trim().length > 100) return 'Enter a subscription name (1–100 characters).'
  if (!Number.isFinite(sub.monthlyPrice) || sub.monthlyPrice < 0 || sub.monthlyPrice > 99_999_999.99 || Math.abs(sub.monthlyPrice * 100 - Math.round(sub.monthlyPrice * 100)) > 0.000001) return 'Enter a non-negative monthly USD price with at most two decimals.'
  if (!sub.tools.length || sub.tools.some(tool => !Object.hasOwn(TOOLS, tool))) return 'Choose at least one supported tool.'
  return null
}

export async function saveCustomSubscription(supabase: SupabaseClient, sub: CustomSubscriptionSelection, active = true): Promise<void> {
  const validationError = active ? customSubscriptionError(sub) : !sub.subscriptionId ? 'Choose a custom subscription to stop tracking.' : null
  if (validationError) throw new Error(validationError)
  const { error } = await supabase.rpc('set_custom_subscription', {
    p_subscription_id: sub.subscriptionId ?? null, p_name: sub.name.trim(),
    p_monthly_price: sub.monthlyPrice, p_tools: sub.tools, p_active: active,
  })
  if (error) throw new Error(error.message)
}

export function dashboardStats(rows: UsageSummary[], subscriptions: SubscriptionRecord[], now = new Date(), customSubscriptions: CustomSubscriptionRecord[] = []): DashboardStats {
  const month = now.toISOString().slice(0, 7)
  const summary = aggregateUsage(rows.filter(row => row.month.startsWith(month)))
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
  const previous = aggregateUsage(rows.filter(row => row.month.startsWith(previousMonth)))
  const change = (current: number, old: number) => old > 0 ? { value: (current - old) / old * 100, positive: current >= old } : null
  return {
    ...emptyStats(), ...summary,
    spentChange: change(summary.totalSpent, previous.totalSpent), tokensChange: change(summary.totalTokens, previous.totalTokens),
    subscriptions: [...subscriptions.filter(sub => sub.active).map(sub => ({
      id: `catalog:${sub.catalog}`,
      name: SUBSCRIPTION_CATALOG.find(catalog => catalog.id === sub.catalog)?.name ?? sub.catalog,
      tier: SUBSCRIPTION_CATALOG.find(catalog => catalog.id === sub.catalog)?.tiers.find(tier => tier.id === sub.tier)?.name ?? sub.tier,
      cost: subscriptionPrice(sub), tools: (sub.tools.length ? sub.tools : subscriptionTools(sub.catalog)).map(tool => TOOLS[tool]?.name ?? tool), active: true,
    })), ...customSubscriptions.filter(sub => sub.active).map(sub => ({
      id: `custom:${sub.subscription_id}`, name: sub.name, tier: 'Custom', cost: Number(sub.monthly_price_usd),
      tools: sub.tools.map(tool => TOOLS[tool]?.name ?? tool), active: true,
    }))],
  }
}

let demoGroups: GroupData[] | null = null

export function getDemoGroups(): GroupData[] {
  demoGroups ??= getMockGroups().map(group => ({
    ...group, ownerId: group.members[0].id, inviteCode: `demo-invite-${group.id}`,
    members: group.members.map(member => ({ ...member, monthlyUsage: getMockMonthlyData().map(month => {
      const tokens = Math.round(member.tokens * month.tokens / 47_800_000)
      return { month: month.month, spent: Math.round(member.spent * month.spent / 247 * 100) / 100, estimated: Math.round(member.estimated * month.spent / 247 * 100) / 100, tokens, tokenTotals: demoTokenTotals(tokens), unknownCostEvents: 0 }
    }) })),
  }))
  return demoGroups
}

export function getDemoGlobalRanking(month: string, metric: ComparisonMetric, limit = 50, offset = 0) {
  const recorded = getDemoGroups().flatMap(group => group.members
    .filter(member => month === 'all' ? member.monthlyUsage.length > 0 : member.monthlyUsage.some(row => row.month === month))
    .map(member => ({ ...member, ...comparisonStatsForMonth(member.monthlyUsage, month) })))
  const unique = new Map(recorded.map(member => [member.id, member]))
  const members = rankMembers([...unique.values()], metric)
  return { members: members.slice(offset, offset + limit), totalMembers: members.length }
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
