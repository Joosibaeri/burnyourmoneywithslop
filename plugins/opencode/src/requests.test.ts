// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openCodeMessageUsage, openCodeTokenSummary, type OpenCodeMessage } from './requests'
import { OpenCodeSteps } from './steps'

const created = 1_795_000_000_000
const tokens = { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 7 } }
const message = (id = 'message-a'): OpenCodeMessage => ({ id, type: 'assistant', time: { created, completed: created + 1 },
  model: { providerID: 'provider', id: 'model' }, tokens, cost: 0.01 })

describe('saved OpenCode request metrics', () => {
  it('uses the same request identity, timestamp, counters and model as live steps', () => {
    const collector = new OpenCodeSteps()
    collector.accept({ type: 'session.step.started', id: 'start', created, data: { sessionID: 'session', assistantMessageID: 'message-a', model: message().model } })
    const live = collector.accept({ type: 'session.step.ended', id: 'transport-end-id', created: created + 1,
      data: { sessionID: 'session', assistantMessageID: 'message-a', tokens, cost: 0.01 } })
    expect(openCodeMessageUsage('session', message())).toEqual(live)
  })
  it('reads reported usage without consulting or serializing private contents', () => {
    const dirty = { ...message(), get content(): never { throw new Error('Private content must not be consulted') },
      get native(): never { throw new Error('Native replies must not be consulted') },
      get snapshot(): never { throw new Error('Paths must not be consulted') } }
    const event = openCodeMessageUsage('PRIVATE SESSION', dirty)!
    expect(event.input_tokens).toBe(100)
    expect(event.cache_read_tokens).toBe(30)
    expect(JSON.stringify(event)).not.toContain('PRIVATE')
    expect(Object.keys(event)).not.toContain('content')
  })
  it('counts complete uncached compaction input without measuring its summary', () => {
    const compacted = { ...message(), type: 'compaction', status: 'completed', time: { created },
      tokens: { ...tokens, input: 1_300_000 }, get summary(): never { throw new Error('Summary must not be consulted') } }
    const event = openCodeMessageUsage('session', compacted)!
    expect(event.input_tokens).toBe(1_300_000)
    expect(event.occurred_at).toBe(new Date(created).toISOString())
    expect(JSON.stringify(event)).not.toContain('summary')
  })
  it.each(['completed', 'failed'])('includes usage-bearing %s compactions', status => {
    expect(openCodeMessageUsage('session', { ...message(), type: 'compaction', status })?.input_tokens).toBe(100)
  })
  it('skips unfinished requests, unsupported messages and missing counters rather than guessing', () => {
    expect(openCodeMessageUsage('session', { ...message(), time: { created } })).toBeNull()
    expect(openCodeMessageUsage('session', { ...message(), type: 'compaction', status: 'running' })).toBeNull()
    expect(openCodeMessageUsage('session', { ...message(), type: 'user' })).toBeNull()
    expect(openCodeMessageUsage('session', { ...message(), tokens: undefined, cost: 0 })).toBeNull()
  })
  it('preserves a completed paid failure even when token counters are unavailable', () => {
    const event = openCodeMessageUsage('session', { ...message(), tokens: undefined, cost: 0.01 })!
    expect(event.input_tokens).toBe(0)
    expect(event.estimated_cost_usd).toBe(0.01)
  })
  it('keeps cache-heavy requests separate and sums all categories exactly', () => {
    const event = openCodeMessageUsage('session', { ...message(), tokens: { ...tokens, input: 3, cache: { read: 100_000, write: 5000 } } })!
    expect(openCodeTokenSummary([event])).toEqual({ input: 3n, output: 25n, cached: 105000n })
    const large = openCodeMessageUsage('session', { ...message(), tokens: { ...tokens, input: Number.MAX_SAFE_INTEGER } })!
    expect(openCodeTokenSummary([large, large]).input).toBe(18014398509481982n)
  })
  it('rejects invalid provider counters', () => {
    expect(() => openCodeMessageUsage('session', { ...message(), tokens: { ...tokens, input: -1 } })).toThrow('Invalid token counter')
  })
})
