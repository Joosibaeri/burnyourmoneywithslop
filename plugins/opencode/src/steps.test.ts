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
})
