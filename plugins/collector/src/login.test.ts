// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectorLogin } from './login'
import { collectorFixture, userId } from '../../test/helpers'
import { readCredentials } from '../../shared/storage'

vi.unmock('@supabase/supabase-js')
const nativeFetch = globalThis.fetch
const directories: string[] = []
async function fixture() { const result = await collectorFixture(); directories.push(result.directory); return result }
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('collector browser PKCE login', () => {
  it('uses a nonce-bound loopback callback and persists only Supabase credentials, not provider tokens', async () => {
    const { directory } = await fixture()
    const config = { supabaseUrl: 'http://127.0.0.1:9', publishableKey: 'sb_publishable_test' }
    let exchange: Record<string, unknown> | null = null
    let challenge = ''
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.port !== '9') return nativeFetch(input, init)
      expect(url.pathname).toBe('/auth/v1/token')
      exchange = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600,
        provider_token: 'PRIVATE-GITHUB-TOKEN', provider_refresh_token: 'PRIVATE-GITHUB-REFRESH', user: { id: userId, aud: 'authenticated', created_at: '2026-11-18T12:00:00Z', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'test' } } }), { headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetcher)
    await collectorLogin(config, directory, { port: 0, timeoutMs: 5000, onUrl: async value => {
      const authorize = new URL(value)
      challenge = authorize.searchParams.get('code_challenge') ?? ''
      expect(authorize.searchParams.get('code_challenge_method')).toBe('s256')
      const callback = new URL(authorize.searchParams.get('redirect_to')!)
      expect(callback.hostname).toBe('127.0.0.1')
      expect(callback.pathname).toMatch(/^\/auth\/callback\/[a-f0-9]{64}$/)
      const invalid = new URL(callback)
      invalid.pathname = '/auth/callback/' + 'bad-state'
      expect((await fetch(invalid)).status).toBe(400)
      callback.searchParams.set('code', 'one-time-code')
      const response = await fetch(callback)
      expect(response.status).toBe(200)
      expect(await response.text()).not.toContain('test-access')
      expect(response.headers.get('cache-control')).toBe('no-store')
    } })
    expect(exchange).not.toBeNull()
    const request = exchange as unknown as { auth_code: string; code_verifier: string }
    expect(request.auth_code).toBe('one-time-code')
    expect(createHash('sha256').update(request.code_verifier).digest('base64url')).toBe(challenge)
    const saved = await readCredentials(directory)
    expect(saved.userId).toBe(userId)
    expect(saved.refreshToken).toBe('test-refresh')
    expect(await readFile(join(directory, 'credentials.json'), 'utf8')).not.toContain('PRIVATE-GITHUB')
  }, 10000)

  it('times out safely and leaves the prior account untouched', async () => {
    const { directory, credentials } = await fixture()
    await expect(collectorLogin({ supabaseUrl: 'http://127.0.0.1:9', publishableKey: 'sb_publishable_test' }, directory, { port: 0, timeoutMs: 30, onUrl: () => {} })).rejects.toThrow('timed out')
    expect(await readCredentials(directory)).toEqual(credentials)
  })
})
