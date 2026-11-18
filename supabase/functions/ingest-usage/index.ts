import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { validateEvents } from './validation.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ingest = withSupabase({ auth: 'user' }, async (req, ctx) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = ctx.userClaims?.id
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const text = await req.text()
    if (new TextEncoder().encode(text).byteLength > 1_048_576) {
      return new Response(JSON.stringify({ error: 'Request body exceeds 1 MiB' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { events, rejected } = validateEvents(JSON.parse(text))
    if (events.length === 0) {
      return new Response(JSON.stringify({ error: 'no valid events', rejected }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await ctx.supabase
      .from('usage_events')
      .upsert(events.map(event => ({ ...event, user_id: userId })), {
        onConflict: 'user_id,tool,event_id',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      console.error('Usage ingestion database operation failed')
      return new Response(JSON.stringify({ error: 'Failed to insert events' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      inserted: data?.length ?? 0,
      rejected,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch {
    // JSON/parser errors can contain excerpts of the request; never log them.
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

export default {
  fetch: async (req: Request) => {
    // Preflight is not an authenticated data operation.
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const response = await ingest(req)
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value)
    return new Response(response.body, { status: response.status, headers })
  },
}
