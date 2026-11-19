import { counter, opaqueId, type UsageEvent } from '../../shared/events'
import { accessCredentials, enqueueForAccount, readQueuedEvents } from '../../shared/transport'
import { readCredentials, withLock, type Credentials } from '../../shared/storage'

export interface RecordedOpenCodeUsage {
  event_id: string
  session_id: string | null
  occurred_at: string
  input_tokens: number | string
  output_tokens: number | string
  reasoning_tokens: number | string
  cache_read_tokens: number | string
  cache_write_tokens: number | string
}

const categories = ['input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_read_tokens', 'cache_write_tokens'] as const

function fingerprint(event: RecordedOpenCodeUsage): string {
  const time = Date.parse(event.occurred_at)
  if (!Number.isFinite(time) || !/^[a-f0-9]{64}$/.test(event.event_id) ||
    (event.session_id !== null && !/^[a-f0-9]{64}$/.test(event.session_id))) throw new Error('Invalid recorded request identity')
  return opaqueId(event.session_id ?? event.event_id, String(time), ...categories.map(key => String(counter(event[key]))))
}

export function missingOpenCodeHistory(events: readonly UsageEvent[], recorded: readonly RecordedOpenCodeUsage[]): UsageEvent[] {
  const known = new Map<string, RecordedOpenCodeUsage>()
  for (const event of recorded) {
    const previous = known.get(event.event_id)
    if (previous && fingerprint(previous) !== fingerprint(event)) throw new Error('Conflicting recorded request snapshots')
    fingerprint(event)
    known.set(event.event_id, event)
  }
  const candidates = new Map<string, UsageEvent>()
  for (const event of events) {
    if (event.tool !== 'opencode') throw new Error('OpenCode history contains another tool')
    const previous = candidates.get(event.event_id)
    if (previous && fingerprint(previous) !== fingerprint(event)) throw new Error('Conflicting historical request snapshots')
    candidates.set(event.event_id, event)
  }
  const missing = new Map<string, UsageEvent[]>()
  for (const event of candidates.values()) {
    const existing = known.get(event.event_id)
    if (existing) {
      if (fingerprint(existing) !== fingerprint(event)) throw new Error('Uploaded request counters differ from the saved request')
      continue
    }
    const key = fingerprint(event)
    missing.set(key, [...missing.get(key) ?? [], event])
  }
  const legacy = new Map<string, RecordedOpenCodeUsage[]>()
  for (const event of known.values()) if (!candidates.has(event.event_id)) {
    const key = fingerprint(event)
    if (missing.has(key)) legacy.set(key, [...legacy.get(key) ?? [], event])
  }
  const result: UsageEvent[] = []
  for (const [key, requests] of missing) {
    const older = legacy.get(key)
    if (!older) result.push(...requests)
    else if (older.length !== 1 || requests.length !== 1) {
      // Older collectors used boundary event IDs, unavailable in historical
      // projections. Reconcile only a unique exact session/time/counter match.
      // Never collapse distinct genuine requests just because counts are equal.
      throw new Error('Ambiguous legacy usage overlap; no historical metrics were queued')
    }
  }
  return result
}

function assertAccount(current: Credentials, expected: Credentials): void {
  if (current.userId !== expected.userId || current.supabaseUrl !== expected.supabaseUrl) throw new Error('Collector account changed during history import')
}

async function readUploadedUsage(directory: string, expected: Credentials): Promise<RecordedOpenCodeUsage[]> {
  let credentials = await accessCredentials(directory)
  assertAccount(credentials, expected)
  const recorded: RecordedOpenCodeUsage[] = []
  let cursor: string | undefined
  do {
    const url = new URL(`${credentials.supabaseUrl}/rest/v1/usage_events`)
    url.searchParams.set('select', `event_id,session_id,occurred_at,${categories.join(',')}`)
    url.searchParams.set('tool', 'eq.opencode')
    url.searchParams.set('user_id', `eq.${credentials.userId}`)
    url.searchParams.set('order', 'event_id.asc')
    url.searchParams.set('limit', '1000')
    if (cursor) url.searchParams.set('event_id', `gt.${cursor}`)
    const request = () => fetch(url, {
      headers: { apikey: credentials.publishableKey, Authorization: `Bearer ${credentials.accessToken}` },
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    let response = await request()
    if (response.status === 401) {
      credentials = await accessCredentials(directory, true)
      assertAccount(credentials, expected)
      response = await request()
    }
    if (!response.ok) throw new Error(`Could not reconcile uploaded OpenCode usage (HTTP ${response.status})`)
    const page = await response.json() as RecordedOpenCodeUsage[]
    if (!Array.isArray(page)) throw new Error('Invalid recorded usage response')
    for (const event of page) fingerprint(event)
    const next = page.at(-1)?.event_id
    if (next && cursor && next <= cursor) throw new Error('Recorded usage pagination did not advance')
    recorded.push(...page)
    cursor = page.length === 1000 ? next : undefined
  } while (cursor)
  return recorded
}

export async function queueOpenCodeHistory(events: readonly UsageEvent[], directory: string, expected: Credentials) {
  // Read pending metrics before hosted ones: a concurrent successful flush may
  // move an item from disk into the database, but it cannot escape both reads.
  const pending = await readQueuedEvents(directory, expected)
  const recorded = await readUploadedUsage(directory, expected)
  return withLock(directory, async () => {
    const current = await readCredentials(directory)
    assertAccount(current, expected)
    const latestPending = await readQueuedEvents(directory, current)
    const missing = missingOpenCodeHistory(events, [...pending, ...recorded, ...latestPending].filter(event =>
      !('tool' in event) || event.tool === 'opencode'))
    await enqueueForAccount(missing, directory, current)
    return { queued: missing.length, alreadyRecorded: events.length - missing.length }
  })
}
