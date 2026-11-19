import { counter, usageEvent, type Counters, type UsageEvent } from '../../shared/events'

export interface OpenCodeTokens {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export interface OpenCodeModel { providerID: string; id: string }

// Only usage fields are consulted. Native replies, summaries, content, snapshots
// and project paths are deliberately absent from this interface and the payload.
export interface OpenCodeMessage {
  id: string
  type: string
  time: { created: number; completed?: number }
  status?: string
  model?: OpenCodeModel
  tokens?: OpenCodeTokens
  cost?: number
}

export function openCodeCounters(tokens?: OpenCodeTokens): Counters {
  return {
    input_tokens: counter(tokens?.input), output_tokens: counter(tokens?.output),
    reasoning_tokens: counter(tokens?.reasoning), cache_read_tokens: counter(tokens?.cache.read),
    cache_write_tokens: counter(tokens?.cache.write),
  }
}

export function openCodeModelId(model?: OpenCodeModel): string | null {
  return model ? `${model.providerID}/${model.id}` : null
}

export function openCodeRequest(sessionID: string, messageID: string, model: string | null,
  tokens: OpenCodeTokens | undefined, created: number, cost?: number): UsageEvent {
  // Live events and historical projections refer to the same immutable message.
  // The transport event ID changes across representations; the message ID doesn't.
  return usageEvent('opencode', `message:${messageID}`, sessionID, model,
    openCodeCounters(tokens), new Date(created).toISOString(), cost ?? 0, cost == null ? 'unavailable' : 'reported')
}

export function openCodeMessageUsage(sessionID: string, message: OpenCodeMessage): UsageEvent | null {
  let created: number | undefined
  if (message.type === 'assistant') created = message.time.completed
  else if (message.type === 'compaction' && ['completed', 'failed'].includes(message.status ?? '')) created = message.time.created
  else return null
  // A running/partial assistant message isn't an immutable request snapshot.
  if (created === undefined || (!message.tokens && !message.cost)) return null
  return openCodeRequest(sessionID, message.id, openCodeModelId(message.model), message.tokens, created, message.cost)
}

export function openCodeTokenSummary(events: readonly UsageEvent[]) {
  return events.reduce((sum, event) => ({
    input: sum.input + BigInt(event.input_tokens),
    output: sum.output + BigInt(event.output_tokens) + BigInt(event.reasoning_tokens),
    cached: sum.cached + BigInt(event.cache_read_tokens) + BigInt(event.cache_write_tokens),
  }), { input: 0n, output: 0n, cached: 0n })
}
