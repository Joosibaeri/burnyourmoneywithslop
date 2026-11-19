import { type UsageEvent } from '../../shared/events'
import { openCodeMessageUsage, type OpenCodeMessage } from './requests'

interface Page<T> { data: T[]; cursor: { next?: string | null } }
interface Session {
  id: string
  time: { created: number }
  fork?: { sessionID: string }
}

export interface HistoryClient {
  session(sessionID: string): Promise<Session>
  sessions(input: { limit: number; cursor?: string; order?: 'asc' }): Promise<Page<Session>>
  messages(input: { sessionID: string; type: 'assistant' | 'compaction'; limit: number; cursor?: string; order?: 'asc' }): Promise<Page<OpenCodeMessage>>
}

export interface HistoryOptions { sessionID?: string; since?: number; until?: number }

export async function readOpenCodeHistory(client: HistoryClient, options: HistoryOptions = {}) {
  const until = options.until ?? Date.now()
  if (!Number.isFinite(until) || (options.since !== undefined && (!Number.isFinite(options.since) || options.since >= until))) throw new Error('Invalid history time range')
  const sessions: Session[] = []
  if (options.sessionID) sessions.push(await client.session(options.sessionID))
  else {
    const seen = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | null | undefined
    do {
      const page = await client.sessions({ limit: 100, ...cursor ? { cursor } : { order: 'asc' as const } })
      for (const session of page.data) if (!seen.has(session.id)) { seen.add(session.id); sessions.push(session) }
      cursor = page.cursor.next
      if (cursor && cursors.has(cursor)) throw new Error('OpenCode session pagination repeated a cursor')
      if (cursor) cursors.add(cursor)
    } while (cursor)
  }
  const requests = new Map<string, UsageEvent>()
  let incomplete = 0
  let inherited = 0
  for (const session of sessions) for (const type of ['assistant', 'compaction'] as const) {
    const cursors = new Set<string>()
    let cursor: string | null | undefined
    do {
      const page = await client.messages({ sessionID: session.id, type, limit: 100, ...cursor ? { cursor } : { order: 'asc' as const } })
      for (const message of page.data) {
        // Forks copy earlier history, not new billed requests. Shared original
        // message IDs are additionally deduplicated across sessions/pages.
        if (session.fork && message.time.created < session.time.created) { inherited++; continue }
        const event = openCodeMessageUsage(session.id, message)
        if (!event) { incomplete++; continue }
        const time = Date.parse(event.occurred_at)
        if (time >= until || (options.since !== undefined && time < options.since)) continue
        const previous = requests.get(event.event_id)
        if (previous) {
          if (['input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_read_tokens', 'cache_write_tokens'].some(key =>
            previous[key as keyof UsageEvent] !== event[key as keyof UsageEvent])) throw new Error('Conflicting historical request counters')
          continue
        }
        requests.set(event.event_id, event)
      }
      cursor = page.cursor.next
      if (cursor && cursors.has(cursor)) throw new Error('OpenCode message pagination repeated a cursor')
      if (cursor) cursors.add(cursor)
    } while (cursor)
  }
  return { events: [...requests.values()], sessions: sessions.length, incomplete, inherited }
}
