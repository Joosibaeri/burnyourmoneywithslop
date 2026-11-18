import { describe, expect, it } from 'vitest'
import { aggregateUsage, dashboardStats, recentUsageMonths, type UsageSummary } from './data'

const row = (user_id: string, tool: string, cost: number, month = '2026-11-01T00:00:00Z'): UsageSummary => ({ user_id, tool, month, real_cost_usd: cost, total_tokens: 100, total_estimated_cost: 1, unknown_cost_events: 1 })
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
    expect(dashboardStats(rows, [], 0, now).totalSpent).toBe(0)
    expect(recentUsageMonths(aggregateUsage(rows).monthlyData, 1, now)).toEqual([{ month: '2026-11', spent: 0, tokens: 0, estimated: 0 }])
  })
  it('fills calendar gaps across a UTC year boundary', () => {
    expect(recentUsageMonths([], 3, new Date('2027-01-01T00:01:00Z')).map(row => row.month)).toEqual(['2026-11', '2026-12', '2027-01'])
  })
})
