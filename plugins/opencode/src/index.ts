import { Plugin } from "@opencode/plugin"

interface UsageEvent {
  tool: 'opencode'
  event_type: 'session_end' | 'usage_update'
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  estimated_cost_usd: number
  model: string
  session_id: string
  metadata: Record<string, unknown>
  occurred_at: string
}

interface PluginOptions {
  supabaseUrl?: string
  supabaseAnonKey?: string
  batchSize?: number
  flushIntervalMs?: number
}

const DEFAULT_BATCH_SIZE = 10
const DEFAULT_FLUSH_INTERVAL = 30_000 // 30 seconds

export default Plugin.define({
  id: "burnyourmoneywithslop",
  async setup(ctx) {
    const options = ctx.options as PluginOptions
    const supabaseUrl = options.supabaseUrl || ctx.env.VITE_SUPABASE_URL
    const supabaseAnonKey = options.supabaseAnonKey || ctx.env.VITE_SUPABASE_ANON_KEY
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE
    const flushInterval = options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL

    if (!supabaseUrl || !supabaseAnonKey) {
      ctx.log.warn("Burn Your Money With Slop: Supabase credentials not configured. Running in demo mode.")
      return
    }

    // Import supabase-js dynamically
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const eventBuffer: UsageEvent[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = async () => {
      if (eventBuffer.length === 0) return

      const eventsToSend = eventBuffer.splice(0, batchSize)
      try {
        const { error } = await supabase.functions.invoke('ingest-usage', {
          body: { events: eventsToSend },
        })
        if (error) {
          ctx.log.error("Failed to send usage events:", error)
          // Re-add to buffer for retry
          eventBuffer.unshift(...eventsToSend)
        }
      } catch (err) {
        ctx.log.error("Error sending usage events:", err)
        eventBuffer.unshift(...eventsToSend)
      }
    }

    const scheduleFlush = () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => {
        flush()
        scheduleFlush()
      }, flushInterval)
    }

    scheduleFlush()

    // Hook: session.usage.updated - fires periodically with cumulative usage
    ctx.event.subscribe({
      types: ["session.usage.updated"],
      signal: AbortSignal.none,
    }).then(async (stream) => {
      for await (const event of stream) {
        if (event.type !== "session.usage.updated") continue

        const { sessionID, cost, tokens } = event.data
        const session = await ctx.session.get({ sessionID })
        if (!session) continue

        const model = session.model
        const modelRef = model ? `${model.providerID}/${model.id}` : "unknown"

        // Calculate estimated cost based on model pricing (rough estimates)
        const estimatedCost = calculateEstimatedCost(modelRef, tokens)

        const usageEvent: UsageEvent = {
          tool: "opencode",
          event_type: "usage_update",
          input_tokens: tokens.input,
          output_tokens: tokens.output,
          reasoning_tokens: tokens.reasoning,
          cache_read_tokens: tokens.cache.read,
          cache_write_tokens: tokens.cache.write,
          estimated_cost_usd: estimatedCost,
          model: modelRef,
          session_id: sessionID,
          metadata: { agent: session.agent },
          occurred_at: new Date(event.created).toISOString(),
        }

        eventBuffer.push(usageEvent)
        if (eventBuffer.length >= batchSize) await flush()
      }
    })

    // Hook: session.step.ended - fires at end of each step with assistant message
    ctx.event.subscribe({
      types: ["session.step.ended"],
      signal: AbortSignal.none,
    }).then(async (stream) => {
      for await (const event of stream) {
        if (event.type !== "session.step.ended") continue

        const { sessionID, assistantMessageID, finish, cost, tokens, snapshot } = event.data
        const session = await ctx.session.get({ sessionID })
        if (!session) continue

        const model = session.model
        const modelRef = model ? `${model.providerID}/${model.id}` : "unknown"
        const estimatedCost = calculateEstimatedCost(modelRef, tokens)

        const usageEvent: UsageEvent = {
          tool: "opencode",
          event_type: "session_end",
          input_tokens: tokens.input,
          output_tokens: tokens.output,
          reasoning_tokens: tokens.reasoning,
          cache_read_tokens: tokens.cache.read,
          cache_write_tokens: tokens.cache.write,
          estimated_cost_usd: estimatedCost,
          model: modelRef,
          session_id: sessionID,
          metadata: { finish, agent: session.agent, snapshot: snapshot?.toString() },
          occurred_at: new Date(event.created).toISOString(),
        }

        eventBuffer.push(usageEvent)
        if (eventBuffer.length >= batchSize) await flush()
      }
    })

    // Cleanup on unload
    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      flush()
    }
  },
})

function calculateEstimatedCost(modelRef: string, tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }): number {
  // Rough per-million-token estimates (USD)
  const pricing: Record<string, { input: number; output: number }> = {
    "anthropic/claude-opus-4": { input: 15, output: 75 },
    "anthropic/claude-sonnet-4": { input: 3, output: 15 },
    "anthropic/claude-haiku-3": { input: 0.25, output: 1.25 },
    "openai/gpt-4o": { input: 5, output: 15 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
    "google/gemini-1.5-pro": { input: 3.5, output: 10.5 },
    "google/gemini-1.5-flash": { input: 0.075, output: 0.3 },
  }

  const defaultPricing = { input: 3, output: 15 }
  const { input, output } = pricing[modelRef] || defaultPricing

  const totalInput = tokens.input + tokens.cache.read + tokens.cache.write
  const totalOutput = tokens.output + tokens.reasoning

  return (totalInput / 1_000_000) * input + (totalOutput / 1_000_000) * output
}