import { createClient } from '@supabase/supabase-js'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

interface SessionEndHookInput {
  session_id: string
  conversation_id: string
  generation_id: string
  transcript_path: string | null
  reason: string
  duration_ms: number
  is_background_agent: boolean
  final_status: string
  error_message: string
  hook_event_name: 'sessionEnd'
}

interface UsageData {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  estimated_cost_usd: number
  model: string
}

async function main() {
  const rl = createInterface({ input, output, terminal: false })

  for await (const line of rl) {
    try {
      const inputData: SessionEndHookInput = JSON.parse(line)

      // Read transcript to extract usage data
      let totalUsage: UsageData | null = null

      if (inputData.transcript_path) {
        totalUsage = await extractUsageFromTranscript(inputData.transcript_path)
      }

      if (totalUsage) {
        await sendUsageToSupabase({
          ...totalUsage,
          session_id: inputData.session_id,
          conversation_id: inputData.conversation_id,
          event_type: 'session_end',
          tool: 'cursor',
          occurred_at: new Date().toISOString(),
        })
      }

      // Success response
      console.log(JSON.stringify({}))
    } catch (err) {
      console.error('SessionEnd hook error:', err)
      // Don't block on error
      console.log(JSON.stringify({}))
    }
  }
}

async function extractUsageFromTranscript(transcriptPath: string): Promise<UsageData | null> {
  try {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(transcriptPath, 'utf-8')
    const lines = content.trim().split('\n')

    let totalInput = 0
    let totalOutput = 0
    let totalReasoning = 0
    let totalCacheRead = 0
    let totalCacheWrite = 0
    let totalCost = 0
    let lastModel = 'unknown'

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        // Cursor transcript format may vary - adapt as needed
        if (entry.usage) {
          totalInput += entry.usage.input_tokens || 0
          totalOutput += entry.usage.output_tokens || 0
          totalReasoning += entry.usage.reasoning_tokens || 0
          totalCacheRead += entry.usage.cache_read_tokens || 0
          totalCacheWrite += entry.usage.cache_write_tokens || 0
          if (entry.model) lastModel = entry.model
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    if (totalInput === 0 && totalOutput === 0) return null

    return {
      input_tokens: totalInput,
      output_tokens: totalOutput,
      reasoning_tokens: totalReasoning,
      cache_read_tokens: totalCacheRead,
      cache_write_tokens: totalCacheWrite,
      estimated_cost_usd: calculateEstimatedCost(lastModel, {
        input: totalInput,
        output: totalOutput,
        reasoning: totalReasoning,
        cache_read: totalCacheRead,
        cache_write: totalCacheWrite,
      }),
      model: lastModel,
    }
  } catch {
    return null
  }
}

function calculateEstimatedCost(model: string, usage: { input: number; output: number; reasoning: number; cache_read: number; cache_write: number }): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 5, output: 15 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'claude-3.5-sonnet': { input: 3, output: 15 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    'gemini-1.5-pro': { input: 3.5, output: 10.5 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  }

  const { input, output } = pricing[model] || { input: 3, output: 15 }
  const totalInput = usage.input + usage.cache_read + usage.cache_write
  const totalOutput = usage.output + usage.reasoning

  return (totalInput / 1_000_000) * input + (totalOutput / 1_000_000) * output
}

async function sendUsageToSupabase(data: UsageData & { session_id: string; conversation_id: string; event_type: string; tool: string; occurred_at: string }) {
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