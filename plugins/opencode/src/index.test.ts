// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import plugin from './index'
import { enqueueEvents, flushEvents } from '../../shared/transport'

vi.mock('@opencode/plugin', () => ({ Plugin: { define: (plugin: unknown) => plugin } }))
vi.mock('../../shared/transport', () => ({ enqueueEvents: vi.fn().mockResolvedValue(undefined), flushEvents: vi.fn().mockResolvedValue({ inserted: 0, uploaded: 0 }) }))

const created = 1_795_000_000_000
const tokens = { input: 1_300_000, output: 20, reasoning: 5, cache: { read: 30, write: 7 } }

describe('installed OpenCode live collector', () => {
  it('subscribes to primary and compaction requests, not cumulative/unsupported usage events', async () => {
    vi.mocked(enqueueEvents).mockClear()
    vi.mocked(flushEvents).mockClear()
    const compacted = { id: 'compaction-message', type: 'compaction', status: 'completed', time: { created }, tokens, cost: 0,
      model: { providerID: 'provider', id: 'model' }, get summary(): never { throw new Error('PRIVATE') } }
    let finished: () => void = () => {}
    const completion = new Promise<void>(resolve => { finished = resolve })
    const ctx = { options: { configDirectory: '/tmp/opencode/test-collector' },
      session: { context: vi.fn().mockResolvedValueOnce([{ id: compacted.id, type: 'compaction', status: 'running', time: { created } }]).mockResolvedValueOnce([compacted]) },
      event: { subscribe: vi.fn((_options: { types: readonly string[] }) => (async function* () {
        yield { type: 'session.compaction.started', id: 'start', created, data: { sessionID: 'session' } }
        yield { type: 'session.compaction.ended', id: 'end', created: created + 10, data: { sessionID: 'session', tokens, cost: 0 } }
        finished()
      })()) } }
    const cleanup = await plugin.setup(ctx as unknown as Parameters<typeof plugin.setup>[0])
    await completion
    if (typeof cleanup === 'function') await cleanup()
    const types = ctx.event.subscribe.mock.calls[0][0].types
    expect(types).toContain('session.step.ended')
    expect(types).toContain('session.compaction.ended')
    expect(types).toContain('session.compaction.failed')
    expect(types).not.toContain('session.usage.updated')
    // 2.3.2 exposes usage.recorded in its durable schema, not the public stream.
    expect(types).not.toContain('session.usage.recorded')
    expect(enqueueEvents).toHaveBeenCalledTimes(1)
    const usage = vi.mocked(enqueueEvents).mock.calls[0][0][0]
    expect(usage.input_tokens).toBe(1_300_000)
    expect(usage.model).toBe('provider/model')
    expect(JSON.stringify(usage)).not.toContain('PRIVATE')
  })
})
