import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configDirectory } from '../../shared/config'
import { counter, opaqueId, usageEvent, type Counters, type UsageEvent } from '../../shared/events'
import { estimateCodexCost, hasCodexPrice } from '../../shared/pricing'
import { privateDirectory, readCredentials, withLock, writePrivateJson } from '../../shared/storage'
import { accountScope, enqueueForAccount } from '../../shared/transport'

interface Attempt {
  id: string
  model: string
  startedAt: string
  completed: boolean
  event?: UsageEvent
}

function correlation(input: Record<string, unknown>, expected: string): string {
  if (input.hook_event_name !== expected || typeof input.session_id !== 'string' || !input.session_id ||
    typeof input.turn_id !== 'string' || !input.turn_id || typeof input.model !== 'string' || !input.model) {
    throw new Error('Unsupported Codex model-request hook input')
  }
  if (input.agent_id != null && typeof input.agent_id !== 'string') throw new Error('Invalid agent ID')
  if (input.agent_type != null && typeof input.agent_type !== 'string') throw new Error('Invalid agent type')
  return opaqueId(input.session_id, input.turn_id, String(input.agent_id ?? ''), String(input.agent_type ?? ''))
}

async function readAttempt(path: string): Promise<Attempt | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) as Attempt }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

export function codexCounters(usage: Record<string, unknown>): Counters {
  if (['input_tokens', 'output_tokens', 'cached_input_tokens', 'reasoning_output_tokens', 'total_tokens'].some(key => usage[key] == null)) throw new Error('Missing documented Codex counters')
  counter(usage.total_tokens)
  const input = counter(usage.input_tokens)
  const output = counter(usage.output_tokens)
  const read = counter(usage.cached_input_tokens)
  const write = counter(usage.cache_write_input_tokens)
  const reasoning = counter(usage.reasoning_output_tokens)
  // Cached/reasoning tokens are subsets in Codex's documented TokenUsage.
  if (read + write > input || reasoning > output) throw new Error('Inconsistent Codex usage')
  return { input_tokens: input - read - write, output_tokens: output - reasoning,
    reasoning_tokens: reasoning, cache_read_tokens: read, cache_write_tokens: write }
}

export async function beginCodexAttempt(input: Record<string, unknown>, directory = configDirectory()): Promise<void> {
  const key = correlation(input, 'PreModelRequest')
  await withLock(directory, async () => {
    const credentials = await readCredentials(directory)
    const attempts = join(directory, 'codex-attempts', accountScope(credentials))
    await privateDirectory(attempts)
    const path = join(attempts, `${key}.json`)
    const previous = await readAttempt(path)
    if (previous?.event && !previous.completed) await enqueueForAccount([previous.event], directory, credentials)
    // Duplicate synchronous Pre hooks share one live attempt. The next real
    // request/retry begins only after every Post hook has finished.
    if (previous && !previous.completed && !previous.event) {
      if (previous.model !== input.model) throw new Error('Overlapping Codex requests are unsupported')
      return
    }
    await writePrivateJson(path, { id: randomUUID(), model: input.model as string,
      startedAt: new Date().toISOString(), completed: false } satisfies Attempt)
  })
}

export async function completeCodexAttempt(input: Record<string, unknown>, directory = configDirectory()): Promise<UsageEvent[]> {
  const key = correlation(input, 'PostModelRequest')
  if (!['completed', 'failed', 'cancelled'].includes(String(input.status))) throw new Error('Invalid request status')
  return withLock(directory, async () => {
    const credentials = await readCredentials(directory)
    const path = join(directory, 'codex-attempts', accountScope(credentials), `${key}.json`)
    const attempt = await readAttempt(path)
    if (!attempt || attempt.model !== input.model) throw new Error('Codex Post hook has no matching Pre hook')
    if (attempt.completed) return attempt.event ? [attempt.event] : []
    let event: UsageEvent | undefined
    if (input.token_usage != null) {
      if (typeof input.token_usage !== 'object' || Array.isArray(input.token_usage)) throw new Error('Invalid request usage')
      const tokens = codexCounters(input.token_usage as Record<string, unknown>)
      event = usageEvent('codex', attempt.id, input.session_id as string, attempt.model,
        tokens, attempt.startedAt, estimateCodexCost(attempt.model, tokens), hasCodexPrice(attempt.model) ? 'list_price' : 'unavailable')
      // Preserve the completed metric before enqueueing, so even a process
      // killed between queueing and completion cannot reuse this ID next time.
      await writePrivateJson(path, { ...attempt, event })
      await enqueueForAccount([event], directory, credentials)
    }
    await writePrivateJson(path, { ...attempt, completed: true, ...(event ? { event } : {}) })
    return event ? [event] : []
  })
}
