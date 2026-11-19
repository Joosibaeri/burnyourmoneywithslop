import { describe, expect, it } from 'vitest'
import { comparisonLabel, comparisonRatio, formatComparisonValue, rankMembers, sumComparisonStats, type ComparisonMember } from './comparison'
import { emptyTokenTotals } from './tokens'

const member = (id: string, input: bigint, output: bigint, cacheRead: bigint, reasoning = 0n): ComparisonMember => ({
  id, name: id, login: id, avatar: '', spent: 0, estimated: 0, tools: [], unknownCostEvents: 0,
  tokenTotals: { input, output, reasoning, cacheRead, cacheWrite: 0n },
})
const members = [member('dan', 40000n, 100n, 0n, 20n), member('erin', 1000n, 50000n, 100n, 500n), member('finn', 39000n, 25000n, 1000n, 50n), member('gina', 900n, 900n, 500000n)]

describe('group metric rankings', () => {
  it.each([['input', 'dan'], ['output', 'erin'], ['input_output', 'finn'], ['total', 'gina'], ['cached', 'gina'], ['cache_read', 'gina'], ['reasoning', 'erin']] as const)('ranks %s independently', (metric, expected) => {
    expect(rankMembers(members, metric)[0].id).toBe(expected)
  })
  it('preserves meaningful differences above Number.MAX_SAFE_INTEGER', () => {
    const exact = [member('a', 9007199254740992n, 0n, 0n), member('b', 9007199254740993n, 0n, 0n)]
    expect(rankMembers(exact, 'input').map(member => member.id)).toEqual(['b', 'a'])
    expect(formatComparisonValue(exact[1], 'input')).toBe('9,007,199,254,740,993')
  })
  it('gives ties the same rank and stabilizes them by GitHub login without mutating input', () => {
    const tied = [member('b', 10n, 0n, 0n), member('a', 10n, 0n, 0n), member('c', 5n, 0n, 0n)]
    expect(rankMembers(tied, 'total').map(member => [member.id, member.rank])).toEqual([['a', 1], ['b', 1], ['c', 3]])
    expect(tied.map(member => member.id)).toEqual(['b', 'a', 'c'])
  })
  it('compares real spending and estimates separately', () => {
    const costs = [{ ...members[0], spent: 25, estimated: 2 }, { ...members[1], spent: 10, estimated: 99 }]
    expect(rankMembers(costs, 'spent')[0].id).toBe('dan')
    expect(rankMembers(costs, 'estimated')[0].id).toBe('erin')
    expect(formatComparisonValue(costs[0], 'spent')).toBe('$25.00')
    expect(comparisonLabel('output')).toBe('Out tokens')
  })
  it('sums members without coercing their exact token counters to numbers', () => {
    const stats = sumComparisonStats(members)
    expect(stats.tokenTotals.input).toBe(80900n)
    expect(stats.tokenTotals.reasoning).toBe(570n)
    expect(sumComparisonStats([]).tokenTotals).toEqual(emptyTokenTotals())
    expect(comparisonRatio(members[0], members[2], 'input_output')).toBeGreaterThan(0)
  })
  it('does not create different ranks for equivalent recorded invoice totals', () => {
    const summed = sumComparisonStats([{ ...members[0], spent: 0.1 }, { ...members[1], spent: 0.2 }])
    const ranking = rankMembers([{ ...members[0], spent: 0.3 }, { ...members[1], spent: summed.spent }], 'spent')
    expect(summed.spent).toBe(0.3)
    expect(ranking.map(member => member.rank)).toEqual([1, 1])
  })
})
