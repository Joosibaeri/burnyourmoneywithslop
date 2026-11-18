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
