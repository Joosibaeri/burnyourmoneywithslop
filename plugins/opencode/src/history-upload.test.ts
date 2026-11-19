// @vitest-environment node
import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { opaqueId } from '../../shared/events'
import { enqueueEvents } from '../../shared/transport'
import { saveCredentials } from '../../shared/storage'
import { collectorFixture, eventFixture, queued } from '../../test/helpers'
import { missingOpenCodeHistory, queueOpenCodeHistory } from './history-upload'
import { openCodeMessageUsage } from './requests'

const created = 1_795_000_000_000
const tokens = { input: 3, output: 20, reasoning: 5, cache: { read: 100_000, write: 5000 } }
const event = (id = 'message-a') => openCodeMessageUsage('session', { id, type: 'assistant', time: { created, completed: created + 1 }, tokens, cost: 0 })!
const legacy = (id = 'boundary-a') => ({ ...event(), event_id: opaqueId('opencode', id) })
const response = (data: unknown) => new Response(JSON.stringify(data))
const directories: string[] = []
async function fixture() { const result = await collectorFixture(); directories.push(result.directory); return result }
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('historical/live usage reconciliation', () => {
  it('skips canonical uploaded IDs and uniquely matched older boundary IDs', () => {
    expect(missingOpenCodeHistory([event()], [event()])).toEqual([])
    expect(missingOpenCodeHistory([event()], [legacy()])).toEqual([])
    expect(missingOpenCodeHistory([event(), event('new-request')], [event()])).toEqual([event('new-request')])
  })
  it('requires an exact hashed session, UTC timestamp and every category for legacy overlap', () => {
    for (const different of [{ ...legacy(), session_id: opaqueId('another-session') },
      { ...legacy(), occurred_at: new Date(created + 2).toISOString() }, { ...legacy(), cache_write_tokens: 5001 }]) {
      expect(missingOpenCodeHistory([event()], [different])).toEqual([event()])
    }
    expect(missingOpenCodeHistory([event()], [{ ...legacy(), input_tokens: '3', occurred_at: new Date(created + 1).toISOString().replace('Z', '+00:00') }])).toEqual([])
  })
  it('retains distinct identical requests, and refuses ambiguous legacy matches', () => {
    expect(missingOpenCodeHistory([event(), event('another-message')], [])).toHaveLength(2)
    expect(() => missingOpenCodeHistory([event(), event('another-message')], [legacy()])).toThrow('Ambiguous')
    expect(() => missingOpenCodeHistory([event()], [legacy(), legacy('another-boundary')])).toThrow('Ambiguous')
  })
  it('deduplicates a metric seen both pending and uploaded, but rejects changed counters', () => {
    expect(missingOpenCodeHistory([event()], [legacy(), legacy()])).toEqual([])
    expect(() => missingOpenCodeHistory([event()], [{ ...event(), input_tokens: 4 }])).toThrow('differ')
    expect(() => missingOpenCodeHistory([event()], [{ ...legacy(), input_tokens: -1 }])).toThrow('Invalid token counter')
    expect(() => missingOpenCodeHistory([eventFixture()], [])).toThrow('another tool')
  })
  it('reconciles both owner-only hosted usage and pending metrics before queuing', async () => {
    const { directory, credentials } = await fixture()
    await enqueueEvents([legacy()], directory)
    const fetcher = vi.fn().mockResolvedValue(response([]))
    vi.stubGlobal('fetch', fetcher)
    const next = { ...event('new-request'), occurred_at: new Date(created + 2).toISOString() }
    expect(await queueOpenCodeHistory([event(), next], directory, credentials)).toEqual({ queued: 1, alreadyRecorded: 1 })
    const pending = await queued(directory, credentials)
    expect(pending).toHaveLength(2)
    expect(pending.some(metric => metric.event_id === event('new-request').event_id)).toBe(true)
    const url = new URL(fetcher.mock.calls[0][0])
    expect(url.searchParams.get('user_id')).toBe(`eq.${credentials.userId}`)
    expect(url.searchParams.get('tool')).toBe('eq.opencode')
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer test-access')
    expect(JSON.stringify(pending)).not.toContain('message-a')
  })
  it('does not upload or queue on a failed reconciliation read', async () => {
    const { directory, credentials } = await fixture()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    await expect(queueOpenCodeHistory([event()], directory, credentials)).rejects.toThrow('503')
    expect(await queued(directory, credentials)).toHaveLength(0)
  })
  it('does not mistake another tool\'s queue for already recorded OpenCode usage', async () => {
    const { directory, credentials } = await fixture()
    await enqueueEvents([{ ...legacy(), tool: 'codex' }], directory)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])))
    expect(await queueOpenCodeHistory([event()], directory, credentials)).toEqual({ queued: 1, alreadyRecorded: 0 })
  })
  it('rejects an account switch during a historical read without queuing either account\'s data', async () => {
    const { directory, credentials } = await fixture()
    const other = { ...credentials, userId: '00000000-0000-0000-0000-000000000002' }
    vi.stubGlobal('fetch', vi.fn(async () => { await saveCredentials(directory, other); return response([]) }))
    await expect(queueOpenCodeHistory([event()], directory, credentials)).rejects.toThrow('account changed')
    expect(await queued(directory, credentials)).toHaveLength(0)
    expect(await queued(directory, other)).toHaveLength(0)
  })
  it('refreshes once on a denied owner read without exposing provider error text', async () => {
    const { directory, credentials } = await fixture()
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(response({ access_token: 'renewed-access', refresh_token: 'renewed-refresh', expires_in: 3600, user: { id: credentials.userId } }))
      .mockResolvedValueOnce(response([event()]))
    vi.stubGlobal('fetch', fetcher)
    expect(await queueOpenCodeHistory([event()], directory, credentials)).toEqual({ queued: 0, alreadyRecorded: 1 })
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer renewed-access')
  })
  it('follows keyset pagination for more than one thousand existing requests', async () => {
    const { directory, credentials } = await fixture()
    const records = Array.from({ length: 1000 }, (_, index) => ({ ...legacy(`legacy-${index}`), occurred_at: new Date(created - index - 1).toISOString() }))
      .sort((a, b) => a.event_id.localeCompare(b.event_id))
    const fetcher = vi.fn().mockResolvedValueOnce(response(records)).mockResolvedValueOnce(response([]))
    vi.stubGlobal('fetch', fetcher)
    expect(await queueOpenCodeHistory([event()], directory, credentials)).toEqual({ queued: 1, alreadyRecorded: 0 })
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('event_id')).toBe(`gt.${records.at(-1)!.event_id}`)
  })
})
