import { addRecordedUsd, formatCurrencyPrecise } from './utils'
import { addTokenTotals, emptyTokenTotals, formatTokenCount, TOKEN_METRICS, tokenMetricInfo, tokenRatio, tokenValue, type TokenMetric, type TokenTotals } from './tokens'

export type ComparisonMetric = 'cost' | TokenMetric

export interface ComparisonStats {
  spent: number
  estimated: number
  tokenTotals: TokenTotals
  unknownCostEvents: number
}

export interface ComparisonMember extends ComparisonStats {
  id: string
  name: string
  login: string
  avatar: string
  tools: string[]
}

export interface RankedMember extends ComparisonMember {
  rank: number
}

export const COMPARISON_OPTIONS = [
  { value: 'cost', label: 'Cost' },
  ...TOKEN_METRICS.map(metric => ({ value: metric.id, label: `${metric.label} tokens` })),
]

export function comparisonLabel(metric: ComparisonMetric): string {
  return metric === 'cost' ? 'Cost' : `${tokenMetricInfo(metric).label} tokens`
}

export function comparisonValue(stats: ComparisonStats, metric: ComparisonMetric): number | bigint {
  return metric === 'cost' ? stats.spent + stats.estimated : tokenValue(stats.tokenTotals, metric)
}

export function formatComparisonValue(stats: ComparisonStats, metric: ComparisonMetric): string {
  const value = comparisonValue(stats, metric)
  return typeof value === 'bigint' ? formatTokenCount(value) : formatCurrencyPrecise(value)
}

export function comparisonRatio(stats: ComparisonStats, max: ComparisonStats, metric: ComparisonMetric): number {
  const value = comparisonValue(stats, metric)
  const maximum = comparisonValue(max, metric)
  return typeof value === 'bigint' && typeof maximum === 'bigint' ? tokenRatio(value, maximum) : Number(maximum) > 0 ? Number(value) / Number(maximum) : 0
}

export function rankMembers(members: ComparisonMember[], metric: ComparisonMetric): RankedMember[] {
  const sorted = [...members].sort((a, b) => {
    const left = comparisonValue(a, metric)
    const right = comparisonValue(b, metric)
    return left > right ? -1 : left < right ? 1 : a.login.localeCompare(b.login) || a.id.localeCompare(b.id)
  })
  let rank = 0
  return sorted.map((member, index) => {
    if (index === 0 || comparisonValue(member, metric) !== comparisonValue(sorted[index - 1], metric)) rank = index + 1
    return { ...member, rank }
  })
}

export function sumComparisonStats(stats: ComparisonStats[]): ComparisonStats {
  return stats.reduce((sum, value) => ({
    spent: addRecordedUsd(sum.spent, value.spent), estimated: sum.estimated + value.estimated,
    tokenTotals: addTokenTotals(sum.tokenTotals, value.tokenTotals), unknownCostEvents: sum.unknownCostEvents + value.unknownCostEvents,
  }), { spent: 0, estimated: 0, tokenTotals: emptyTokenTotals(), unknownCostEvents: 0 })
}
