import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateUsage, comparisonStatsForMonth, customSubscriptionError, dashboardStats, emptyMonthlyUsage, loadGlobalRanking, recentUsageMonths, saveCustomSubscription, type CustomSubscriptionRecord, type UsageSummary } from './data'
import { tokenValue } from './tokens'

const row = (user_id: string, tool: string, cost: number, month = '2026-11-01T00:00:00Z'): UsageSummary => ({ user_id, tool, month, real_cost_usd: cost, total_tokens: 100, total_tokens_exact: '100', input_tokens: '60', output_tokens: '20', reasoning_tokens: '5', cache_read_tokens: '10', cache_write_tokens: '5', total_estimated_cost: 1, unknown_cost_events: 1 })
describe('UTC usage and shared billing aggregation', () => {
  it('counts subscriptions once per user/month, but sums different friends independently', () => {
    const summary = aggregateUsage([row('alice', 'codex', 20), row('alice', 'opencode', 20), row('bob', 'cursor', 30)])
    expect(summary.totalSpent).toBe(50)
    expect(summary.totalTokens).toBe(300)
    expect(summary.totalEstimated).toBe(3)
    expect(summary.unknownCostEvents).toBe(3)
  })
  it('does not carry a previous month’s spending into an empty current month', () => {
    const now = new Date('2026-11-18T12:00:00Z')
    const rows = [row('alice', 'codex', 20, '2026-10-01T00:00:00Z')]
    expect(dashboardStats(rows, [], now).totalSpent).toBe(0)
    expect(recentUsageMonths(aggregateUsage(rows).monthlyData, 1, now)).toEqual([emptyMonthlyUsage('2026-11')])
  })
  it('fills calendar gaps across a UTC year boundary', () => {
    expect(recentUsageMonths([], 3, new Date('2027-01-01T00:01:00Z')).map(row => row.month)).toEqual(['2026-11', '2026-12', '2027-01'])
  })
  it('lists active custom prices on the dashboard without multiplying recorded spending per tool', () => {
    const custom: CustomSubscriptionRecord[] = [
      { id: 'version-one', subscription_id: 'logical-one', name: 'My plan', monthly_price_usd: '12.50', tools: ['codex', 'opencode'], active: true, started_at: '2026-11-01Z', ended_at: null },
      { id: 'version-two', subscription_id: 'logical-two', name: 'My plan', monthly_price_usd: '7.00', tools: ['codex'], active: true, started_at: '2026-11-01Z', ended_at: null },
      { id: 'old-version', subscription_id: 'logical-one', name: 'Old plan', monthly_price_usd: '5.00', tools: ['codex'], active: false, started_at: '2026-10-01Z', ended_at: '2026-11-01Z' },
    ]
    const stats = dashboardStats([row('alice', 'codex', 19.5), row('alice', 'opencode', 19.5)], [], new Date('2026-11-18Z'), custom)
    expect(stats.totalSpent).toBe(19.5)
    expect(stats.subscriptions.map(sub => sub.cost)).toEqual([12.5, 7])
    expect(new Set(stats.subscriptions.map(sub => sub.id)).size).toBe(2)
  })

  it('keeps every token category exact per user, month and tool', () => {
    const rows = [row('alice', 'codex', 20), row('alice', 'opencode', 20), row('bob', 'cursor', 30), row('alice', 'codex', 15, '2026-10-01Z')]
    const summary = aggregateUsage(rows)
    expect(summary.tokenTotals).toEqual({ input: 240n, output: 80n, reasoning: 20n, cacheRead: 40n, cacheWrite: 20n })
    expect(summary.monthlyData[1].tokenTotals.input).toBe(180n)
    expect(summary.toolBreakdown.find(tool => tool.name === 'Codex')?.tokenTotals.reasoning).toBe(10n)
    expect(summary.totalSpent).toBe(65)
    expect(tokenValue(summary.tokenTotals, 'input')).toBe(240n)
    expect(tokenValue(summary.tokenTotals, 'cached')).toBe(60n)
    expect(tokenValue(summary.tokenTotals, 'input_output')).toBe(340n)
    expect(tokenValue(summary.tokenTotals, 'total')).toBe(400n)
  })

  it('does not round aggregate counters when JSON totals exceed the safe integer limit', () => {
    const first = { ...row('alice', 'codex', 20), input_tokens: '9007199254740993' }
    const summary = aggregateUsage([first, row('alice', 'opencode', 20)])
    expect(summary.tokenTotals.input).toBe(9007199254741053n)
    expect(summary.monthlyData[0].tokenTotals.input).toBe(9007199254741053n)
    expect(summary.toolBreakdown[0].tokenTotals.input).toBe(9007199254740993n)
    expect(summary.totalSpent).toBe(20)
  })

  it('filters comparison snapshots by UTC month and sums all-time billing once per recorded month', () => {
    const summary = aggregateUsage([row('alice', 'codex', 20), row('alice', 'opencode', 20), row('alice', 'codex', 15, '2026-10-01Z')])
    expect(comparisonStatsForMonth(summary.monthlyData, '2026-11').spent).toBe(20)
    expect(comparisonStatsForMonth(summary.monthlyData, '2026-10').tokenTotals.input).toBe(60n)
    expect(comparisonStatsForMonth(summary.monthlyData, '2026-09').tokenTotals.input).toBe(0n)
    expect(comparisonStatsForMonth(summary.monthlyData, 'all').spent).toBe(35)
    expect(comparisonStatsForMonth(summary.monthlyData, 'all').tokenTotals.input).toBe(180n)
  })
})

describe('global ranking transport', () => {
  it('uses the public-only server ranking and keeps exact counters and server-assigned ranks', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row('alice', 'codex', 20), input_tokens: '9007199254740993', github_login: 'alice', display_name: 'Alice', avatar_url: 'https://github.com/alice.png', rank: '51', total_members: '80' }], error: null })
    const result = await loadGlobalRanking({ rpc } as unknown as SupabaseClient, '2026-11', 'input', 50, 50)
    expect(rpc).toHaveBeenCalledWith('get_global_ranking', { p_month: '2026-11-01', p_metric: 'input', p_limit: 50, p_offset: 50 })
    expect(result.members[0]).toMatchObject({ id: 'alice', name: 'Alice', login: 'alice', rank: 51, tokenTotals: { input: 9007199254740993n } })
    expect(tokenValue(result.members[0].tokenTotals, 'input')).toBe(9007199254740993n)
    expect(result.totalMembers).toBe(80)
  })
  it('requests all time explicitly without sending a caller/group visibility override', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    expect(await loadGlobalRanking({ rpc } as unknown as SupabaseClient, 'all', 'spent')).toEqual({ members: [], totalMembers: 0 })
    expect(rpc).toHaveBeenCalledWith('get_global_ranking', { p_month: null, p_metric: 'spent', p_limit: 50, p_offset: 0 })
  })
  it('propagates ranking failures instead of presenting them as an empty ranking', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Ranking unavailable' } })
    await expect(loadGlobalRanking({ rpc } as unknown as SupabaseClient, '2026-11', 'total')).rejects.toThrow('Ranking unavailable')
  })
})

describe('custom subscription input and persistence', () => {
  const plan = { name: 'My plan', monthlyPrice: 12.5, tools: ['codex', 'opencode'] }
  it.each([
    { name: '' }, { name: ' '.repeat(3) }, { name: 'x'.repeat(101) }, { monthlyPrice: -1 },
    { monthlyPrice: Infinity }, { monthlyPrice: NaN }, { monthlyPrice: 1.123 },
    { monthlyPrice: 100_000_000 }, { tools: [] }, { tools: ['unknown'] },
  ])('rejects invalid custom plan fields (%j)', invalid => {
    expect(customSubscriptionError({ ...plan, ...invalid })).not.toBeNull()
  })
  it('allows free custom plans with explicit tool coverage', () => {
    expect(customSubscriptionError({ ...plan, monthlyPrice: 0 })).toBeNull()
  })
  it('saves a caller-scoped custom plan with a stable logical ID', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const client = { rpc } as unknown as SupabaseClient
    await saveCustomSubscription(client, { ...plan, subscriptionId: 'logical-id', name: ' My plan ' })
    expect(rpc).toHaveBeenCalledWith('set_custom_subscription', { p_subscription_id: 'logical-id', p_name: 'My plan', p_monthly_price: 12.5, p_tools: ['codex', 'opencode'], p_active: true })
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('user_id')
  })
})
