import { describe, expect, it } from 'vitest'
import { addTokenTotals, demoTokenTotals, emptyTokenTotals, formatTokenCount, parseTokenCount, TOKEN_METRICS, tokenRatio, tokenTotalsFromRecord, tokenValue } from './tokens'

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
  it('keeps cache-heavy context entirely in Cached without adding it to clean In', () => {
    const recorded = tokenTotalsFromRecord({ input_tokens: '327', output_tokens: '20', reasoning_tokens: '10', cache_read_tokens: '100000', cache_write_tokens: '1000' })
    expect(tokenValue(recorded, 'input')).toBe(327n)
    expect(tokenValue(recorded, 'cached')).toBe(101000n)
    expect(tokenValue(recorded, 'input_output')).toBe(357n)
    expect(tokenValue(recorded, 'total')).toBe(101357n)
    expect(tokenValue(recorded, 'total')).toBe(tokenValue(recorded, 'cached') + tokenValue(recorded, 'input') + tokenValue(recorded, 'output'))
  })
  it('reports zero clean input for cached-only usage without dropping its total', () => {
    const recorded = { ...emptyTokenTotals(), cacheRead: 1000n, cacheWrite: 100n }
    expect(tokenValue(recorded, 'input')).toBe(0n)
    expect(tokenValue(recorded, 'cached')).toBe(1100n)
    expect(tokenValue(recorded, 'total')).toBe(1100n)
  })
  it('adds cached input exactly above Number.MAX_SAFE_INTEGER', () => {
    const recorded = { ...tokens, input: 9007199254740993n, cacheRead: 9007199254740995n }
    expect(tokenValue(recorded, 'input')).toBe(9007199254740993n)
    expect(tokenValue(recorded, 'cached')).toBe(9007199254741095n)
    expect(tokenValue(recorded, 'total')).toBe(18014398509482338n)
  })
  it('uses In as the only clean-input metric without an extra Uncached input field', () => {
    expect(TOKEN_METRICS.some(metric => String(metric.id) === 'uncached_input')).toBe(false)
    expect(TOKEN_METRICS.some(metric => String(metric.label) === 'Uncached input')).toBe(false)
    expect(TOKEN_METRICS.find(metric => metric.id === 'input')?.description).toContain('tool results')
  })
  it('only approximates chart ratios, not displayed counts', () => {
    expect(tokenRatio(10n ** 100n, 2n * 10n ** 100n)).toBe(0.5)
    expect(tokenRatio(100n, 0n)).toBe(0)
  })
  it('keeps synthetic demo categories internally consistent', () => {
    expect(tokenValue(demoTokenTotals(101), 'total')).toBe(101n)
  })
})
