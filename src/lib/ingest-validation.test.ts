import { describe, expect, it } from 'vitest'
import { validateEvents } from '../../supabase/functions/ingest-usage/validation'

const event = { tool: 'codex', event_type: 'model_request', event_id: 'a'.repeat(64), input_tokens: 100, output_tokens: 20, occurred_at: '2026-11-18T12:00:00Z' }

describe('usage payload validation', () => {
  it('accepts counters and never persists arbitrary metadata or user IDs', () => {
    const result = validateEvents({ events: [{ ...event, user_id: 'someone-else', metadata: { transcript: 'private', snapshot: 'code' } }] })
    expect(result.rejected).toBe(0)
    expect(result.events[0]).not.toHaveProperty('metadata')
    expect(result.events[0]).not.toHaveProperty('user_id')
  })

  it.each([null, [], {}, { events: [] }, { events: Array(501).fill(event) }])('rejects missing or oversized batches', body => {
    expect(() => validateEvents(body)).toThrow()
  })

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid token counts (%s)', input_tokens => {
    expect(validateEvents({ events: [{ ...event, input_tokens }] }).rejected).toBe(1)
  })

  it('handles mixed batches and validates optional fields', () => {
    const result = validateEvents({ events: [event, null, { ...event, cache_read_tokens: -1 }, { ...event, estimated_cost_usd: Infinity }, { ...event, occurred_at: 'bad' }] })
    expect(result.events).toHaveLength(1)
    expect(result.rejected).toBe(4)
    expect(result.events[0].reasoning_tokens).toBe(0)
  })

  it.each([
    { event_id: undefined }, { event_id: 'raw-request-id' }, { event_id: 'A'.repeat(64) },
    { session_id: 'raw-session-id' }, { event_type: 'session_end' }, { event_type: 'usage_update' },
    { cost_source: 'invoice' }, { model: 'x'.repeat(201) },
  ])('rejects legacy/cumulative events and unsafe identities (%j)', fields => {
    expect(validateEvents({ events: [{ ...event, ...fields }] }).rejected).toBe(1)
  })

  it('preserves explicit opaque identities and marks unavailable estimates', () => {
    const result = validateEvents({ events: [{ ...event, session_id: 'b'.repeat(64), cost_source: 'unavailable', prompt: 'PRIVATE', snapshot: 'PRIVATE' }] })
    expect(result.events[0].event_id).toBe(event.event_id)
    expect(result.events[0].session_id).toBe('b'.repeat(64))
    expect(result.events[0].cost_source).toBe('unavailable')
    expect(JSON.stringify(result.events)).not.toContain('PRIVATE')
  })
})
