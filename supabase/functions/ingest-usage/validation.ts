export interface UsageEvent {
  tool: 'opencode' | 'claude-code' | 'cursor' | 'codex'
  event_type: 'model_request'
  event_id: string
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  estimated_cost_usd: number
  cost_source: 'reported' | 'list_price' | 'unavailable'
  model: string | null
  session_id: string | null
  occurred_at: string
}

export function validateEvents(body: unknown): { events: UsageEvent[]; rejected: number } {
  if (!body || typeof body !== 'object' || !('events' in body) || !Array.isArray(body.events) || body.events.length === 0 || body.events.length > 500) {
    throw new Error('events must be an array containing 1–500 events')
  }

  const events: UsageEvent[] = []
  for (const candidate of body.events) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const e = candidate as Record<string, unknown>
    if (typeof e.tool !== 'string' || !['opencode', 'claude-code', 'cursor', 'codex'].includes(e.tool)) continue
    if (e.event_type !== 'model_request') continue
    if (typeof e.event_id !== 'string' || !/^[a-f0-9]{64}$/.test(e.event_id)) continue
    const counters = ['input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_read_tokens', 'cache_write_tokens'] as const
    if (counters.some(key => {
      const value = e[key] ?? (key === 'input_tokens' || key === 'output_tokens' ? undefined : 0)
      return typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
    })) continue
    const cost = e.estimated_cost_usd ?? 0
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || cost >= 1_000_000) continue
    const source = e.cost_source ?? 'unavailable'
    if (typeof source !== 'string' || !['reported', 'list_price', 'unavailable'].includes(source)) continue
    if (typeof e.occurred_at !== 'string' || !Number.isFinite(Date.parse(e.occurred_at))) continue
    if (e.model != null && (typeof e.model !== 'string' || e.model.length > 200)) continue
    if (e.session_id != null && (typeof e.session_id !== 'string' || !/^[a-f0-9]{64}$/.test(e.session_id))) continue
    events.push({
      tool: e.tool as UsageEvent['tool'],
      event_type: e.event_type as UsageEvent['event_type'],
      event_id: e.event_id,
      input_tokens: e.input_tokens as number,
      output_tokens: e.output_tokens as number,
      reasoning_tokens: (e.reasoning_tokens ?? 0) as number,
      cache_read_tokens: (e.cache_read_tokens ?? 0) as number,
      cache_write_tokens: (e.cache_write_tokens ?? 0) as number,
      estimated_cost_usd: cost,
      cost_source: source as UsageEvent['cost_source'],
      model: (e.model ?? null) as string | null,
      session_id: (e.session_id ?? null) as string | null,
      // Arbitrary metadata, user IDs, snapshots, prompts, and transcripts are discarded.
      occurred_at: new Date(e.occurred_at).toISOString(),
    })
  }
  return { events, rejected: body.events.length - events.length }
}
