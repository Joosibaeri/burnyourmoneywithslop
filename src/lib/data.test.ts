import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateUsage, customSubscriptionError, dashboardStats, recentUsageMonths, saveCustomSubscription, type CustomSubscriptionRecord, type UsageSummary } from './data'

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
  it('lists active custom prices on the dashboard without multiplying recorded spending per tool', () => {
    const custom: CustomSubscriptionRecord[] = [
      { id: 'version-one', subscription_id: 'logical-one', name: 'My plan', monthly_price_usd: '12.50', tools: ['codex', 'opencode'], active: true, started_at: '2026-11-01Z', ended_at: null },
      { id: 'version-two', subscription_id: 'logical-two', name: 'My plan', monthly_price_usd: '7.00', tools: ['codex'], active: true, started_at: '2026-11-01Z', ended_at: null },
      { id: 'old-version', subscription_id: 'logical-one', name: 'Old plan', monthly_price_usd: '5.00', tools: ['codex'], active: false, started_at: '2026-10-01Z', ended_at: '2026-11-01Z' },
    ]
    const stats = dashboardStats([row('alice', 'codex', 19.5), row('alice', 'opencode', 19.5)], [], 0, new Date('2026-11-18Z'), custom)
    expect(stats.totalSpent).toBe(19.5)
    expect(stats.subscriptions.map(sub => sub.cost)).toEqual([12.5, 7])
    expect(new Set(stats.subscriptions.map(sub => sub.id)).size).toBe(2)
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
