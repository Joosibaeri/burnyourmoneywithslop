import { createClient } from '@supabase/supabase-js'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

interface PostModelRequestHookInput {
  session_id: string
  transcript_path: string | null
  hook_event_name: 'PostModelRequest'
  model: string
  status: 'completed' | 'failed' | 'cancelled'
  error: string | null
  token_usage: {
    input_tokens: number
    output_tokens: number
    reasoning_tokens?: number
    cache_read_tokens?: number
    cache_write_tokens?: number
  } | null
}

async function main() {
  const rl = createInterface({ input, output, terminal: false })

  for await (const line of rl) {
    try {
      const inputData: PostModelRequestHookInput = JSON.parse(line)

      if (!inputData.token_usage || inputData.status !== 'completed') {
        console.log(JSON.stringify({}))
        continue
      }

      const usage = inputData.token_usage
      const totalInput = (usage.input_tokens || 0) + (usage.cache_read_tokens || 0) + (usage.cache_write_tokens || 0)
      const totalOutput = (usage.output_tokens || 0) + (usage.reasoning_tokens || 0)

      await sendUsageToSupabase({
        input_tokens: totalInput,
        output_tokens: totalOutput,
        reasoning_tokens: usage.reasoning_tokens || 0,
        cache_read_tokens: usage.cache_read_tokens || 0,
        cache_write_tokens: usage.cache_write_tokens || 0,
        estimated_cost_usd: calculateEstimatedCost(inputData.model, {
          input: totalInput,
          output: totalOutput,
          reasoning: usage.reasoning_tokens || 0,
          cache_read: usage.cache_read_tokens || 0,
          cache_write: usage.cache_write_tokens || 0,
        }),
        model: inputData.model,
        session_id: inputData.session_id,
        event_type: 'model_request',
        tool: 'codex',
        occurred_at: new Date().toISOString(),
      })

      console.log(JSON.stringify({}))
    } catch (err) {
      console.error('PostModelRequest hook error:', err)
      console.log(JSON.stringify({}))
    }
  }
}

function calculateEstimatedCost(model: string, usage: { input: number; output: number; reasoning: number; cache_read: number; cache_write: number }): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 5, output: 15 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'o1-preview': { input: 15, output: 60 },
    'o1-mini': { input: 3, output: 12 },
  }

  const { input, output } = pricing[model] || { input: 3, output: 15 }

  return (usage.input / 1_000_000) * input + (usage.output / 1_000_000) * output
}

async function sendUsageToSupabase(data: {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  estimated_cost_usd: number
  model: string
  session_id: string
  event_type: string
  tool: string
  occurred_at: string
}) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials not configured')
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { error } = await supabase.functions.invoke('ingest-usage', {
    body: { events: [data] },
  })

  if (error) {
    console.error('Failed to send usage:', error)
  }
}

main().catch(console.error)