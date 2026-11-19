// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { readOpenCodeHistory, type HistoryClient } from './history'
import { openCodeTokenSummary, type OpenCodeMessage } from './requests'

const created = 1_795_000_000_000
const session = { id: 'session', time: { created: created - 100 } }
const tokens = { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 7 } }
const message = (id = 'request-a'): OpenCodeMessage => ({ id, type: 'assistant', time: { created, completed: created + 1 }, tokens, cost: 0 })
const page = <T,>(data: T[], next: string | null = null) => ({ data, cursor: { next } })
function fixture(messages: OpenCodeMessage[] = [message()]): HistoryClient {
  return { session: vi.fn().mockResolvedValue(session), sessions: vi.fn().mockResolvedValue(page([session])),
    messages: vi.fn(async input => page(messages.filter(message => message.type === input.type))) }
}

describe('explicit metrics-only OpenCode backfill', () => {
  it('recovers millions of pre-install input tokens and compactions while keeping cache separate', async () => {
    const client = fixture([{ ...message(), tokens: { ...tokens, input: 2_800_000 } },
      { ...message('summary-request'), type: 'compaction', status: 'completed', tokens: { ...tokens, input: 1_300_000 } }])
    const result = await readOpenCodeHistory(client, { until: created + 100 })
    expect(result.events).toHaveLength(2)
    expect(openCodeTokenSummary(result.events)).toEqual({ input: 4_100_000n, output: 50n, cached: 74n })
    expect(JSON.stringify(result.events)).not.toContain('summary')
  })
  it('follows every session/message page and retains identical genuine request IDs', async () => {
    const client = fixture()
    vi.mocked(client.sessions).mockResolvedValueOnce(page([session], 'sessions-next')).mockResolvedValueOnce(page([]))
    vi.mocked(client.messages).mockImplementation(async input => input.type === 'compaction' ? page([]) :
      input.cursor ? page([message(), message('request-b')]) : page([message()], 'messages-next'))
    const result = await readOpenCodeHistory(client, { until: created + 100 })
    expect(result.events).toHaveLength(2)
    expect(client.sessions).toHaveBeenLastCalledWith({ limit: 100, cursor: 'sessions-next' })
    expect(client.messages).toHaveBeenCalledWith({ sessionID: 'session', type: 'assistant', limit: 100, cursor: 'messages-next' })
  })
  it('supports a single selected session without losing its fork metadata', async () => {
    const client = fixture([message()])
    vi.mocked(client.session).mockResolvedValue({ ...session, fork: { sessionID: 'parent' }, time: { created: created + 2 } })
    const result = await readOpenCodeHistory(client, { sessionID: 'session', until: created + 100 })
    expect(result.events).toHaveLength(0)
    expect(result.inherited).toBe(1)
    expect(client.sessions).not.toHaveBeenCalled()
  })
  it('does not count copied fork history with new IDs or repeated original IDs', async () => {
    const client = fixture()
    vi.mocked(client.sessions).mockResolvedValue(page([session, { id: 'fork', fork: { sessionID: 'session' }, time: { created: created + 10 } }]))
    vi.mocked(client.messages).mockImplementation(async input => input.type === 'compaction' ? page([]) :
      input.sessionID === 'fork' ? page([message('copied-request'), { ...message('new-fork-request'), time: { created: created + 11, completed: created + 12 } }]) : page([message()]))
    const result = await readOpenCodeHistory(client, { until: created + 100 })
    expect(result.events).toHaveLength(2)
    expect(result.inherited).toBe(1)
  })
  it('uses start-inclusive/end-exclusive UTC request timestamps', async () => {
    const client = fixture([message(), { ...message('later'), time: { created: created + 1, completed: created + 2 } }])
    const result = await readOpenCodeHistory(client, { since: created + 1, until: created + 2 })
    expect(result.events).toHaveLength(1)
    expect(result.events[0].occurred_at).toBe(new Date(created + 1).toISOString())
    await expect(readOpenCodeHistory(client, { since: created + 2, until: created + 1 })).rejects.toThrow('Invalid history time range')
  })
  it('skips incomplete requests and never accesses content or native provider replies', async () => {
    const dirty = { ...message(), get content(): never { throw new Error('PRIVATE') }, get native(): never { throw new Error('PRIVATE') } }
    const result = await readOpenCodeHistory(fixture([dirty, { ...message('partial'), time: { created } }]), { until: created + 100 })
    expect(result.events).toHaveLength(1)
    expect(result.incomplete).toBe(1)
  })
  it('rejects conflicting snapshots and broken pagination instead of silently guessing', async () => {
    await expect(readOpenCodeHistory(fixture([message(), { ...message(), tokens: { ...tokens, input: 200 } }]), { until: created + 100 })).rejects.toThrow('Conflicting')
    const client = fixture()
    vi.mocked(client.sessions).mockResolvedValue(page([session], 'same-cursor'))
    await expect(readOpenCodeHistory(client, { until: created + 100 })).rejects.toThrow('repeated a cursor')
  })
})
