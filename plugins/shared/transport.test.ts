// @vitest-environment node
import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accessCredentials, enqueueEvents, flushEvents, sendEvents } from './transport'
import { readCredentials, saveCredentials } from './storage'
import { collectorFixture, eventFixture, queued } from '../test/helpers'

const directories: string[] = []
async function fixture(overrides: Parameters<typeof collectorFixture>[0] = {}) {
  const result = await collectorFixture(overrides)
  directories.push(result.directory)
  return result
}
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const accepted = (inserted = 1) => new Response(JSON.stringify({ success: true, inserted, rejected: 0 }))

describe('private credentials and durable transport', () => {
  it('stores credentials privately', async () => {
    const { directory, credentials } = await fixture()
    expect(await readCredentials(directory)).toEqual(credentials)
    if (process.platform !== 'win32') {
      expect((await stat(directory)).mode & 0o777).toBe(0o700)
      expect((await stat(join(directory, 'credentials.json'))).mode & 0o777).toBe(0o600)
    }
  })
  it('queues metrics before upload failure and deduplicates retries, not genuine requests', async () => {
    const { directory, credentials } = await fixture()
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    vi.stubGlobal('fetch', fetcher)
    const dirty = { ...eventFixture(), prompt: 'PRIVATE', metadata: { transcript: 'PRIVATE' } }
    await expect(sendEvents([dirty], directory)).rejects.toThrow('503')
    await enqueueEvents([dirty, eventFixture(), eventFixture('another-identical-request')], directory)
    expect(await queued(directory, credentials)).toHaveLength(2)
    const body = String(fetcher.mock.calls[0][1].body)
    expect(body).not.toContain('PRIVATE')
    expect(body).not.toContain('user_id')
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer test-access')
    fetcher.mockResolvedValue(accepted(2))
    expect(await flushEvents(directory)).toEqual({ inserted: 2, uploaded: 2 })
    expect(await queued(directory, credentials)).toHaveLength(0)
  })
  it('serializes refresh-token rotation across concurrent collectors', async () => {
    const { directory, credentials } = await fixture({ expiresAt: 0 })
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600, user: { id: credentials.userId } })))
    vi.stubGlobal('fetch', fetcher)
    const results = await Promise.all([accessCredentials(directory), accessCredentials(directory)])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(results.every(result => result.refreshToken === 'rotated-refresh')).toBe(true)
    expect((await readCredentials(directory)).accessToken).toBe('rotated-access')
  })
  it('refreshes and retries one unauthorized upload with the same identity', async () => {
    const { directory, credentials } = await fixture()
    await enqueueEvents([eventFixture()], directory)
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600, user: { id: credentials.userId } })))
      .mockResolvedValueOnce(accepted(0))
    vi.stubGlobal('fetch', fetcher)
    expect(await flushEvents(directory)).toEqual({ inserted: 0, uploaded: 1 })
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[2][1].body)
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer rotated-access')
  })
  it('never sends another account’s pending queue after a sign-in switch', async () => {
    const { directory, credentials } = await fixture()
    await enqueueEvents([eventFixture()], directory)
    const second = { ...credentials, userId: '00000000-0000-0000-0000-000000000002', accessToken: 'other-access' }
    await saveCredentials(directory, second)
    await enqueueEvents([eventFixture('other-request')], directory)
    const fetcher = vi.fn().mockResolvedValue(accepted())
    vi.stubGlobal('fetch', fetcher)
    await flushEvents(directory)
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer other-access')
    expect(await queued(directory, credentials)).toHaveLength(1)
    expect(await queued(directory, second)).toHaveLength(0)
  })
  it('keeps the queue on a partial/malformed server acknowledgement', async () => {
    const { directory, credentials } = await fixture()
    await enqueueEvents([eventFixture()], directory)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, inserted: 0, rejected: 1 }))))
    await expect(flushEvents(directory)).rejects.toThrow('whole batch')
    expect(await queued(directory, credentials)).toHaveLength(1)
  })
  it('refreshes an expired access token before uploading metrics retained across restart', async () => {
    const { directory, credentials } = await fixture({ expiresAt: 0 })
    await enqueueEvents([eventFixture()], directory)
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'after-reboot-access', refresh_token: 'rotated-refresh', expires_in: 3600, user: { id: credentials.userId } }))).mockResolvedValueOnce(accepted())
    vi.stubGlobal('fetch', fetcher)
    expect(await flushEvents(directory)).toEqual({ inserted: 1, uploaded: 1 })
    expect(fetcher.mock.calls[0][0]).toContain('grant_type=refresh_token')
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer after-reboot-access')
  })
  it('retains queued metrics when the refresh session is expired or revoked', async () => {
    const { directory, credentials } = await fixture({ expiresAt: 0 })
    await enqueueEvents([eventFixture()], directory)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error_code: 'refresh_token_not_found', message: 'PRIVATE provider response' }), { status: 400 })))
    await expect(flushEvents(directory)).rejects.toThrow('refresh_token_not_found')
    expect(await queued(directory, credentials)).toHaveLength(1)
    expect((await readCredentials(directory)).refreshToken).toBe(credentials.refreshToken)
  })
  it('does not renew an idle session when the reboot scheduler finds an empty queue', async () => {
    const { directory } = await fixture({ expiresAt: 0 })
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await flushEvents(directory)).toEqual({ inserted: 0, uploaded: 0 })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
