import { describe, expect, it } from 'vitest'
import { addTokenTotals, demoTokenTotals, emptyTokenTotals, formatTokenCount, parseTokenCount, tokenRatio, tokenTotalsFromRecord, tokenValue } from './tokens'

const tokens = { input: 1000n, output: 200n, reasoning: 50n, cacheRead: 300n, cacheWrite: 100n }

describe('exact token metrics', () => {
  it.each([
    ['input', 1000n], ['output', 250n], ['input_output', 1250n], ['total', 1650n],
    ['cached', 400n], ['cache_read', 300n], ['cache_write', 100n], ['reasoning', 50n],
  ] as const)('calculates %s without double-counting reasoning or cache', (metric, expected) => {
    expect(tokenValue(tokens, metric)).toBe(expected)
  })
  it('keeps integers exact above the JSON safe-number boundary', () => {
    expect(parseTokenCount('9007199254740993')).toBe(9007199254740993n)
    expect(formatTokenCount(9007199254740993n)).toBe('9,007,199,254,740,993')
    expect(addTokenTotals(tokens, { ...emptyTokenTotals(), input: 9007199254740993n }).input).toBe(9007199254741993n)
  })
  it.each([-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '-1', '1.1', '1e6', '', 'unknown'])('rejects non-exact or invalid counter %s', value => {
    expect(() => parseTokenCount(value)).toThrow()
  })
  it('reads disjoint recorded counters without reconstructing unavailable categories', () => {
    expect(tokenTotalsFromRecord({ input_tokens: '1000', output_tokens: 200, reasoning_tokens: '50', cache_read_tokens: 300, cache_write_tokens: '100' })).toEqual(tokens)
  })
  it('only approximates chart ratios, not displayed counts', () => {
    expect(tokenRatio(10n ** 100n, 2n * 10n ** 100n)).toBe(0.5)
    expect(tokenRatio(100n, 0n)).toBe(0)
  })
  it('keeps synthetic demo categories internally consistent', () => {
    expect(tokenValue(demoTokenTotals(101), 'total')).toBe(101n)
  })
})
