// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { OpenCodeSteps } from './steps'

const tokens = { input: 100, output: 20, reasoning: 5, cache: { read: 10, write: 3 } }
const end = (assistantMessageID = 'message-a') => ({ type: 'session.step.ended' as const, id: `event-${assistantMessageID}`, created: 1_795_000_000_000,
  data: { sessionID: 'local-session', assistantMessageID, tokens, cost: 0.01, snapshot: 'PRIVATE CODE' } })

describe('OpenCode V2 step collection', () => {
  it('correlates exact dispatched models across switches and interleaved steps', () => {
    const collector = new OpenCodeSteps()
    collector.accept({ ...end(), type: 'session.step.started', data: { ...end().data, model: { providerID: 'anthropic', id: 'claude-sonnet-5-5' } } })
    collector.accept({ ...end('message-b'), type: 'session.step.started', data: { ...end('message-b').data, model: { providerID: 'openai', id: 'gpt-6.1-sol' } } })
    const first = collector.accept(end())!
    const second = collector.accept(end('message-b'))!
    expect(first.model).toBe('anthropic/claude-sonnet-5-5')
    expect(second.model).toBe('openai/gpt-6.1-sol')
    expect(first.input_tokens + first.output_tokens + first.reasoning_tokens + first.cache_read_tokens + first.cache_write_tokens).toBe(138)
    expect(first.estimated_cost_usd).toBe(0.01)
    expect(JSON.stringify(first)).not.toContain('PRIVATE')
    expect(JSON.stringify(first)).not.toContain('local-session')
  })
  it('does not guess the model for a step whose start was not observed', () => {
    const collector = new OpenCodeSteps()
    expect(collector.accept(end())?.model).toBeNull()
  })
  it('preserves full request input on tool-feedback continuations without measuring or uploading text', () => {
    const collector = new OpenCodeSteps()
    const continuation = {
      ...end('tool-feedback'),
      data: {
        ...end('tool-feedback').data,
        tokens: { input: 123456, output: 20, reasoning: 5, cache: { read: 30000, write: 4000 } },
        prompt: 'PRIVATE SHORT PROMPT', system: 'PRIVATE INSTRUCTIONS', tool_result: 'PRIVATE TOOL ANSWER',
      },
    }
    const event = collector.accept(continuation)!
    expect(event.input_tokens).toBe(123456)
    expect(event.cache_read_tokens).toBe(30000)
    expect(event.cache_write_tokens).toBe(4000)
    expect(JSON.stringify(event)).not.toContain('PRIVATE')
    expect(event).not.toHaveProperty('prompt')
    expect(event).not.toHaveProperty('tool_result')
  })
  it('does not relabel cache-heavy tool continuations as clean input', () => {
    const collector = new OpenCodeSteps()
    const event = collector.accept({ ...end('cached-tool-feedback'), data: { ...end('cached-tool-feedback').data, tokens: { input: 3, output: 20, reasoning: 5, cache: { read: 100000, write: 5000 } } } })!
    expect(event.input_tokens).toBe(3)
    expect(event.cache_read_tokens).toBe(100000)
    expect(event.cache_write_tokens).toBe(5000)
  })
  it('captures failed paid requests but skips failures without usage', () => {
    const collector = new OpenCodeSteps()
    expect(collector.accept({ ...end(), type: 'session.step.failed' })?.input_tokens).toBe(100)
    expect(collector.accept({ ...end(), type: 'session.step.failed', data: { sessionID: 'local-session', assistantMessageID: 'empty' } })).toBeNull()
  })
  it('keeps boundary identities stable for upload retries', () => {
    const collector = new OpenCodeSteps()
    expect(collector.accept(end())?.event_id).toBe(collector.accept(end())?.event_id)
  })
  it('deduplicates one request across different transport boundaries but retains identical genuine requests', () => {
    const collector = new OpenCodeSteps()
    expect(collector.accept(end())?.event_id).toBe(collector.accept({ ...end(), id: 'another-transport-boundary' })?.event_id)
    expect(collector.accept(end())?.event_id).not.toBe(collector.accept(end('another-genuine-request'))?.event_id)
  })
  it('preserves separate paid failed attempts when retries reuse an assistant message ID', () => {
    const collector = new OpenCodeSteps()
    const first = collector.accept({ ...end(), type: 'session.step.failed', id: 'failed-attempt-a' })!
    const second = collector.accept({ ...end(), type: 'session.step.failed', id: 'failed-attempt-b' })!
    const successful = collector.accept(end())!
    expect(new Set([first.event_id, second.event_id, successful.event_id]).size).toBe(3)
    expect(collector.accept({ ...end(), type: 'session.step.failed', id: 'failed-attempt-a' })?.event_id).toBe(first.event_id)
  })
  it('collects live compactions once with the saved message identity, including a missed start', () => {
    const collector = new OpenCodeSteps()
    const compacted = { id: 'compact-message', type: 'compaction', status: 'completed', time: { created: end().created - 20 },
      tokens: { ...tokens, input: 1_300_000 }, model: { providerID: 'provider', id: 'model' }, cost: 0.02 }
    collector.accept({ type: 'session.compaction.started', id: 'compact-start', created: end().created - 19,
      data: { sessionID: 'local-session' } }, [{ ...compacted, status: 'running', tokens: undefined }])
    const event = { type: 'session.compaction.ended' as const, id: 'compact-end', created: end().created,
      data: { sessionID: 'local-session', tokens: compacted.tokens, cost: compacted.cost } }
    const first = collector.accept(event, [compacted])!
    expect(first.input_tokens).toBe(1_300_000)
    expect(first.model).toBe('provider/model')
    expect(collector.accept(event, [compacted])?.event_id).toBe(first.event_id)
  })
  it('counts usage-bearing failed compactions without guessing from an older summary', () => {
    const collector = new OpenCodeSteps()
    const event = { type: 'session.compaction.failed' as const, id: 'failure', created: end().created,
      data: { sessionID: 'local-session', tokens, cost: 0.01 } }
    const message = { id: 'failed-compact', type: 'compaction', status: 'failed', time: { created: end().created - 1 }, tokens, cost: 0.01 }
    expect(collector.accept(event, [message])?.input_tokens).toBe(100)
    expect(() => collector.accept(event, [{ ...message, status: 'completed' }])).toThrow('unavailable')
    expect(() => collector.accept(event, [{ ...message, tokens: { ...tokens, input: 1 } }])).toThrow('unavailable')
    expect(collector.accept({ ...event, data: { sessionID: 'local-session' } })).toBeNull()
  })
})
