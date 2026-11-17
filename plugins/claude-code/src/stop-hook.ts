import { createClient } from '@supabase/supabase-js'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

interface StopHookInput {
  session_id: string
  transcript_path: string
  hook_event_name: 'Stop'
  stop_hook_active: boolean
  last_assistant_message: string | null
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
      const inputData: StopHookInput = JSON.parse(line)

      // Read transcript to extract usage data
      const usage = await extractUsageFromTranscript(inputData.transcript_path)

      if (usage) {
        await sendUsageToSupabase({
          ...usage,
          session_id: inputData.session_id,
          event_type: 'session_end',
          tool: 'claude-code',
          occurred_at: new Date().toISOString(),
        })
      }

      // Allow Claude to continue
      console.log(JSON.stringify({ continue: true }))
    } catch (err) {
      console.error('Stop hook error:', err)
      // Don't block on error
      console.log(JSON.stringify({ continue: true }))
    }
  }
}

async function extractUsageFromTranscript(transcriptPath: string): Promise<UsageData | null> {
  try {
    const fs = await import('node:fs/promises')
    const content = await fs.readFile(transcriptPath, 'utf-8')
    const lines = content.trim().split('\n')

    // Find the last assistant message with usage data
    let lastUsage: UsageData | null = null

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.type === 'assistant' && entry.message?.usage) {
          const usage = entry.message.usage
          lastUsage = {
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            reasoning_tokens: usage.thinking_tokens || 0,
            cache_read_tokens: usage.cache_read_tokens || 0,
            cache_write_tokens: usage.cache_write_tokens || 0,
            estimated_cost_usd: calculateEstimatedCost(entry.message.model, usage),
            model: entry.message.model || 'unknown',
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return lastUsage
  } catch {
    return null
  }
}

function calculateEstimatedCost(model: string, usage: Record<string, number>): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4': { input: 15, output: 75 },
    'claude-sonnet-4': { input: 3, output: 15 },
    'claude-haiku-3': { input: 0.25, output: 1.25 },
  }

  const { input, output } = pricing[model] || { input: 3, output: 15 }
  const inputTokens = (usage.input_tokens || 0) + (usage.cache_read_tokens || 0) + (usage.cache_write_tokens || 0)
  const outputTokens = (usage.output_tokens || 0) + (usage.thinking_tokens || 0)

  return (inputTokens / 1_000_000) * input + (outputTokens / 1_000_000) * output
}

async function sendUsageToSupabase(data: UsageData & { session_id: string; event_type: string; tool: string; occurred_at: string }) {
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