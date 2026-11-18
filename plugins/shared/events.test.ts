// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { counter, opaqueId, usageEvent } from './events'
import { estimateClaudeCost, estimateCodexCost, hasClaudePrice, hasCodexPrice } from './pricing'
import { eventFixture } from '../test/helpers'

describe('metrics-only events and pricing', () => {
  it('uses opaque, stable identities and disjoint counters', () => {
    const event = eventFixture()
    expect(event.event_id).toMatch(/^[a-f0-9]{64}$/)
    expect(event.session_id).toMatch(/^[a-f0-9]{64}$/)
    expect(event.event_id).toBe(eventFixture().event_id)
    expect(opaqueId('ab', 'c')).not.toBe(opaqueId('a', 'bc'))
    expect(JSON.stringify(event)).not.toContain('local-session')
  })
  it.each([-1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1.0', 'secret', {}])('rejects unsafe counters (%s)', value => {
    expect(() => counter(value)).toThrow()
  })
  it('accepts documented string meters and defaults optional counters', () => {
    expect(counter('123')).toBe(123)
    expect(counter(undefined)).toBe(0)
  })
  it('never serializes arbitrary event properties', () => {
    const dirty = { ...eventFixture(), prompt: 'PRIVATE', metadata: { code: 'PRIVATE' } }
    const clean = usageEvent(dirty.tool, dirty.event_id, null, dirty.model, dirty, dirty.occurred_at, dirty.estimated_cost_usd, dirty.cost_source)
    expect(JSON.stringify(clean)).not.toContain('PRIVATE')
  })
  it('uses current Claude rates and the cache-write TTL breakdown', () => {
    const tokens = { input_tokens: 1_000_000, output_tokens: 1_000_000, reasoning_tokens: 0, cache_read_tokens: 1_000_000, cache_write_tokens: 1_000_000 }
    expect(estimateClaudeCost('claude-fable-5-2', tokens)).toBeCloseTo(58.2)
    expect(estimateClaudeCost('claude-sonnet-5-5', tokens, 1_000_000)).toBeCloseTo(16.1)
    expect(hasClaudePrice('claude-sonnet-4-6-20260217')).toBe(true)
    expect(hasClaudePrice('claude-sonnet-99')).toBe(false)
    expect(estimateClaudeCost('unknown-model', tokens)).toBe(0)
  })
  it('uses request-level long-context pricing, not a cumulative-session threshold', () => {
    const tokens = { input_tokens: 100_001, output_tokens: 100, reasoning_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
    expect(estimateClaudeCost('claude-haiku-5-5', tokens)).toBeCloseTo(0.0502505)
    expect(estimateCodexCost('gpt-6.1-sol', { ...tokens, input_tokens: 300_000 })).toBeCloseTo(1.2015)
    expect(hasCodexPrice('gpt-6.2-sol')).toBe(true)
    expect(hasCodexPrice('gpt-9-codex')).toBe(false)
  })
})
