import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { saveCredentials, type Credentials } from '../shared/storage'
import { accountScope } from '../shared/transport'
import { usageEvent } from '../shared/events'

export const userId = '00000000-0000-0000-0000-000000000001'
export async function collectorFixture(overrides: Partial<Credentials> = {}) {
  const temporaryRoot = join(tmpdir(), 'opencode')
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(join(temporaryRoot, 'slop-collector-test-'))
  const credentials: Credentials = { supabaseUrl: 'https://test.supabase.co', publishableKey: 'sb_publishable_test',
    accessToken: 'test-access', refreshToken: 'test-refresh', userId, expiresAt: Math.floor(Date.now() / 1000) + 3600, ...overrides }
  await saveCredentials(directory, credentials)
  return { directory, credentials }
}
export async function queued(directory: string, credentials: Credentials) {
  const path = join(directory, 'pending', accountScope(credentials))
  const names = await readdir(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error })
  return Promise.all(names.filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(path, name), 'utf8'))))
}
export function eventFixture(identity = 'request-one') {
  return usageEvent('codex', identity, 'local-session', 'gpt-6.1-sol', {
    input_tokens: 100, output_tokens: 20, reasoning_tokens: 5, cache_read_tokens: 10, cache_write_tokens: 0,
  }, '2026-11-18T12:00:00Z', 0.001, 'list_price')
}
