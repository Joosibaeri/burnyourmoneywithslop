import { createClient } from 'npm:@supabase/supabase-js@2'
import { withSupabase } from 'npm:@supabase/server@1'

interface UsageEvent {
  tool: 'opencode' | 'claude-code' | 'cursor' | 'codex'
  event_type: 'session_end' | 'model_request' | 'usage_update'
  input_tokens: number
  output_tokens: number
  reasoning_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  estimated_cost_usd?: number
  model?: string
  session_id?: string
  metadata?: Record<string, unknown>
  occurred_at: string
}

interface IngestRequest {
  events: UsageEvent[]
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export default withSupabase({ auth: 'user' }, async (req, ctx) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = ctx.userClaims?.sub
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body: IngestRequest = await req.json()
    const { events } = body

    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ error: 'events array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = ctx.supabase

    // Validate and normalize events
    const validEvents = events
      .map((e, idx) => {
        const errors: string[] = []

        if (!['opencode', 'claude-code', 'cursor', 'codex'].includes(e.tool)) {
          errors.push(`event ${idx}: invalid tool "${e.tool}"`)
        }
        if (!['session_end', 'model_request', 'usage_update'].includes(e.event_type)) {
          errors.push(`event ${idx}: invalid event_type "${e.event_type}"`)
        }
        if (typeof e.input_tokens !== 'number' || e.input_tokens < 0) {
          errors.push(`event ${idx}: input_tokens must be non-negative number`)
        }
        if (typeof e.output_tokens !== 'number' || e.output_tokens < 0) {
          errors.push(`event ${idx}: output_tokens must be non-negative number`)
        }
        if (!e.occurred_at || isNaN(Date.parse(e.occurred_at))) {
          errors.push(`event ${idx}: occurred_at must be valid ISO timestamp`)
        }

        return { event: e, errors }
      })
      .filter(({ errors }) => errors.length === 0)
      .map(({ event }) => ({
        user_id: userId,
        tool: event.tool,
        event_type: event.event_type,
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        reasoning_tokens: event.reasoning_tokens ?? 0,
        cache_read_tokens: event.cache_read_tokens ?? 0,
        cache_write_tokens: event.cache_write_tokens ?? 0,
        estimated_cost_usd: event.estimated_cost_usd ?? 0,
        model: event.model ?? null,
        session_id: event.session_id ?? null,
        metadata: event.metadata ?? {},
        occurred_at: event.occurred_at,
      }))

    if (validEvents.length === 0) {
      return new Response(JSON.stringify({ error: 'no valid events', details: events.map((_, i) => `event ${i}: validation failed`) }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert with ON CONFLICT DO NOTHING for idempotency (based on user_id + session_id + occurred_at)
    // Note: We don't have a unique constraint, so we rely on client-side deduplication
    // For production, consider adding a unique constraint on (user_id, session_id, occurred_at)
    const { data, error } = await supabase
      .from('usage_events')
      .insert(validEvents)
      .select('id')

    if (error) {
      console.error('Insert error:', error)
      return new Response(JSON.stringify({ error: 'Failed to insert events', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      inserted: data?.length ?? 0,
      rejected: events.length - validEvents.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Ingest error:', err)
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})