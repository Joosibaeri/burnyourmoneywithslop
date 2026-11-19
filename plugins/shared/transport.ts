import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { configDirectory } from './config'
import { opaqueId, usageEvent, type UsageEvent } from './events'
import { readCredentials, saveCredentials, withLock, writePrivateJson, type Credentials } from './storage'

const BATCH_SIZE = 100
const MAX_PENDING = 10_000

export async function accessCredentials(directory: string, forceRefresh = false): Promise<Credentials> {
  return withLock(directory, async () => {
    let credentials = await readCredentials(directory)
    if (!forceRefresh && credentials.expiresAt > Date.now() / 1000 + 60) return credentials
    const response = await fetch(`${credentials.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { apikey: credentials.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: credentials.refreshToken }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error_code?: string } | null
      const known = ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired'].includes(body?.error_code ?? '') ? `, ${body!.error_code}` : ''
      // Emit only known error codes, never provider error text or credential data.
      throw new Error(`Collector session could not refresh (HTTP ${response.status}${known}). Sign in again: npm run collector -- login`)
    }
    const session = await response.json() as { access_token: string; refresh_token: string; expires_in: number; expires_at?: number; user: { id: string } }
    if (!session.access_token || !session.refresh_token || session.user?.id !== credentials.userId || !Number.isFinite(session.expires_in)) throw new Error('Invalid refreshed session; sign in again')
    credentials = { ...credentials, accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in }
    await saveCredentials(directory, credentials)
    return credentials
  })
}

export function accountScope(credentials: Credentials): string {
  return opaqueId(credentials.supabaseUrl, credentials.userId)
}

function queueDirectory(directory: string, credentials: Credentials): string {
  // Never upload another account's pending events after a sign-in/account switch.
  return join(directory, 'pending', accountScope(credentials))
}

function sanitized(event: UsageEvent): UsageEvent {
  const clean = usageEvent(event.tool, event.event_id, null, event.model, event, event.occurred_at, event.estimated_cost_usd, event.cost_source)
  // Preserve already-hashed identities; arbitrary extra properties are never serialized.
  if (!/^[a-f0-9]{64}$/.test(event.event_id) || (event.session_id !== null && !/^[a-f0-9]{64}$/.test(event.session_id))) throw new Error('Invalid opaque usage identity')
  return { ...clean, event_id: event.event_id, session_id: event.session_id }
}

export async function readQueuedEvents(directory: string, credentials: Credentials): Promise<UsageEvent[]> {
  const pending = queueDirectory(directory, credentials)
  const names = await readdir(pending).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const events: UsageEvent[] = []
  for (const name of names.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
    try { events.push(sanitized(JSON.parse(await readFile(join(pending, name), 'utf8')) as UsageEvent)) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return events
}

export async function enqueueEvents(events: UsageEvent[], directory = configDirectory()): Promise<void> {
  if (!events.length) return
  await withLock(directory, async () => {
    const credentials = await readCredentials(directory)
    await enqueueForAccount(events, directory, credentials)
  })
}

// Call only while holding withLock(directory). This lets hooks atomically queue
// metrics before advancing their durable, account-scoped collection checkpoint.
export async function enqueueForAccount(events: UsageEvent[], directory: string, credentials: Credentials): Promise<void> {
  const clean = events.map(sanitized)
  const pending = queueDirectory(directory, credentials)
  await mkdir(pending, { recursive: true, mode: 0o700 })
  const existing = new Set(await readdir(pending))
  const newEvents = new Map(clean.filter(event => !existing.has(`${event.event_id}.json`)).map(event => [event.event_id, event]))
  if (existing.size + newEvents.size > MAX_PENDING) throw new Error('Collector queue is full. Run collector flush before collecting more usage.')
  for (const event of newEvents.values()) {
    const path = join(pending, `${event.event_id}.json`)
    // Atomic writes prevent a killed hook from leaving a half-written queue item.
    await writePrivateJson(path, event)
  }
}

export async function flushEvents(directory = configDirectory(), maxBatches = 100): Promise<{ inserted: number; uploaded: number }> {
  let credentials = await withLock(directory, () => readCredentials(directory))
  const pending = queueDirectory(directory, credentials)
  const names = (await readdir(pending).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort()
  // Startup retries must not keep an otherwise idle account alive forever.
  // Refresh only when there are actual queued metrics to upload.
  if (!names.length) return { inserted: 0, uploaded: 0 }
  let inserted = 0
  let uploaded = 0
  for (let offset = 0; offset < names.length && offset / BATCH_SIZE < maxBatches; offset += BATCH_SIZE) {
    const batchNames = names.slice(offset, offset + BATCH_SIZE)
    const events: UsageEvent[] = []
    for (const name of batchNames) {
      // Another collector may have flushed this exact file already.
      try { events.push(sanitized(JSON.parse(await readFile(join(pending, name), 'utf8')) as UsageEvent)) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    if (!events.length) continue
    // Do not continue a flush if the active account changed while it was running.
    const current = await accessCredentials(directory)
    if (current.userId !== credentials.userId || current.supabaseUrl !== credentials.supabaseUrl) throw new Error('Collector account changed; run flush again')
    credentials = current
    const post = () => fetch(`${credentials.supabaseUrl}/functions/v1/ingest-usage`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { apikey: credentials.publishableKey, Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    })
    let response = await post()
    if (response.status === 401) {
      const refreshed = await accessCredentials(directory, true)
      if (refreshed.userId !== credentials.userId || refreshed.supabaseUrl !== credentials.supabaseUrl) throw new Error('Collector account changed; run flush again')
      credentials = refreshed
      response = await post()
    }
    if (!response.ok) throw new Error(`Usage upload failed (HTTP ${response.status}); metrics remain queued locally`)
    const result = await response.json() as { success: boolean; inserted: number; rejected: number }
    if (!result.success || result.rejected !== 0 || !Number.isInteger(result.inserted)) throw new Error('Ingestion did not accept the whole batch; metrics remain queued locally')
    inserted += result.inserted
    uploaded += events.length
    await Promise.all(batchNames.map(name => unlink(join(pending, name)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })))
  }
  return { inserted, uploaded }
}

export async function sendEvents(events: UsageEvent[], directory = configDirectory()): Promise<void> {
  if (!events.length) return
  await enqueueEvents(events, directory)
  await flushEvents(directory, 5)
}
