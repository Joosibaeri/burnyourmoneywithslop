import { createHash } from 'node:crypto'

export type Tool = 'opencode' | 'claude-code' | 'cursor' | 'codex'
export type CostSource = 'reported' | 'list_price' | 'unavailable'

// Counters are disjoint: input excludes cached input; output excludes reasoning.
export interface UsageEvent {
  tool: Tool
  event_type: 'model_request'
  event_id: string
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  estimated_cost_usd: number
  cost_source: CostSource
  model: string | null
  session_id: string | null
  occurred_at: string
}

export type Counters = Pick<UsageEvent, 'input_tokens' | 'output_tokens' | 'reasoning_tokens' | 'cache_read_tokens' | 'cache_write_tokens'>

export function opaqueId(...parts: string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export function counter(value: unknown): number {
  if (value == null) return 0
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) throw new Error('Invalid token counter')
  return number
}

export function usageEvent(tool: Tool, identity: string, session: string | null, model: unknown, counters: Counters, occurredAt: string, cost = 0, costSource: CostSource = 'unavailable'): UsageEvent {
  if (!identity || !Number.isFinite(Date.parse(occurredAt))) throw new Error('Usage requires a stable identity and timestamp')
  if (!Number.isFinite(cost) || cost < 0 || cost >= 1_000_000) throw new Error('Invalid estimated cost')
  if (!['reported', 'list_price', 'unavailable'].includes(costSource)) throw new Error('Invalid cost source')
  return {
    tool, event_type: 'model_request', event_id: opaqueId(tool, identity),
    input_tokens: counter(counters.input_tokens), output_tokens: counter(counters.output_tokens),
    reasoning_tokens: counter(counters.reasoning_tokens), cache_read_tokens: counter(counters.cache_read_tokens),
    cache_write_tokens: counter(counters.cache_write_tokens), estimated_cost_usd: cost, cost_source: costSource,
    model: typeof model === 'string' ? model.slice(0, 200) : null,
    session_id: session ? opaqueId(tool, session) : null,
    occurred_at: new Date(occurredAt).toISOString(),
  }
}
