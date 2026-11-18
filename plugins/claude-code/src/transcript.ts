import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { isAbsolute, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { configDirectory } from '../../shared/config'
import { counter, opaqueId, usageEvent, type UsageEvent } from '../../shared/events'
import { estimateClaudeCost, hasClaudePrice } from '../../shared/pricing'
import { privateDirectory, readCredentials, withLock, writePrivateJson } from '../../shared/storage'
import { accountScope, enqueueForAccount } from '../../shared/transport'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function claudeEvent(entry: unknown, sessionId: string): UsageEvent | null {
  const item = record(entry)
  const message = record(item?.message)
  const usage = record(message?.usage)
  if (item?.type !== 'assistant' || !message || !usage || typeof message.id !== 'string' || !message.id ||
    typeof item.timestamp !== 'string' || !Number.isFinite(Date.parse(item.timestamp))) return null
  if (usage.input_tokens == null || usage.output_tokens == null) return null
  const tokens = {
    input_tokens: counter(usage.input_tokens), output_tokens: counter(usage.output_tokens),
    // Anthropic includes thinking in output_tokens; it has no separate documented
    // thinking-token counter here. Never count thinking twice or infer from text.
    reasoning_tokens: 0, cache_read_tokens: counter(usage.cache_read_input_tokens),
    cache_write_tokens: counter(usage.cache_creation_input_tokens),
  }
  const creation = record(usage.cache_creation)
  const hourWrites = counter(creation?.ephemeral_1h_input_tokens)
  const model = typeof message.model === 'string' ? message.model : null
  return usageEvent('claude-code', message.id, sessionId, model, tokens, item.timestamp,
    model ? estimateClaudeCost(model, tokens, hourWrites) : 0,
    model && hasClaudePrice(model) ? 'list_price' : 'unavailable')
}

function addLine(events: Map<string, UsageEvent>, line: string, sessionId: string): void {
  if (!line || Buffer.byteLength(line) > 16_777_216) return
  try {
    const event = claudeEvent(JSON.parse(line), sessionId)
    if (!event) return
    const previous = events.get(event.event_id)
    // Streamed content blocks can repeat the same API message.id and usage.
    // Keep one request, preferring the most complete output-token snapshot.
    if (!previous || event.output_tokens >= previous.output_tokens) {
      events.set(event.event_id, { ...event, occurred_at: previous?.occurred_at ?? event.occurred_at })
    }
  } catch { /* A partial trailing line or unsupported usage isn't a billable request. */ }
}

export function parseClaudeTranscript(text: string, sessionId: string): UsageEvent[] {
  const events = new Map<string, UsageEvent>()
  for (const line of text.split('\n')) addLine(events, line, sessionId)
  return [...events.values()]
}

export async function readClaudeTranscript(path: string, sessionId: string): Promise<UsageEvent[]> {
  if (!isAbsolute(path) || !sessionId) throw new Error('Use an absolute transcript path and session ID')
  const events = new Map<string, UsageEvent>()
  const stream = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  try { for await (const line of lines) addLine(events, line, sessionId) }
  finally { lines.close(); stream.destroy() }
  return [...events.values()]
}

export async function collectClaudeUsage(input: Record<string, unknown>, directory = configDirectory(), settleMs = 500): Promise<UsageEvent[]> {
  if (!['Stop', 'StopFailure', 'SessionEnd', 'SubagentStop', 'SessionStart'].includes(String(input.hook_event_name)) ||
    typeof input.session_id !== 'string' || !input.session_id) throw new Error('Unsupported Claude hook input')
  // Agent tool_response.usage/totalTokens describe only its final request, not
  // the whole subagent. Its own transcript supplies all available requests.
  const path = input.hook_event_name === 'SubagentStop' ? input.agent_transcript_path : input.transcript_path
  if (typeof path !== 'string') throw new Error('Missing transcript path')
  // Transcripts are asynchronous. Background Stop hooks give writes time to
  // settle; late entries are recovered by a later hook or an explicit import.
  if (settleMs) await delay(settleMs)
  const events = await readClaudeTranscript(path, input.session_id)
  return withLock(directory, async () => {
    const credentials = await readCredentials(directory)
    const checkpoints = join(directory, 'claude-seen', accountScope(credentials))
    await privateDirectory(checkpoints)
    const checkpoint = join(checkpoints, `${opaqueId(input.session_id as string)}.json`)
    let seen: Set<string>
    try { seen = new Set(JSON.parse(await readFile(checkpoint, 'utf8')) as string[]) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; seen = new Set() }
    const fresh = events.filter(event => !seen.has(event.event_id))
    if (!fresh.length) return []
    await enqueueForAccount(fresh, directory, credentials)
    for (const event of fresh) seen.add(event.event_id)
    await writePrivateJson(checkpoint, [...seen])
    return fresh
  })
}
