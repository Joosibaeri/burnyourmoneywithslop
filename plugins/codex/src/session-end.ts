import { createClient } from '@supabase/supabase-js'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

interface SessionEndHookInput {
  session_id: string
  transcript_path: string | null
  hook_event_name: 'SessionEnd'
  reason: string
}

async function main() {
  const rl = createInterface({ input, output, terminal: false })

  for await (const line of rl) {
    try {
      const inputData: SessionEndHookInput = JSON.parse(line)
      // Could send a summary event here
      console.log(JSON.stringify({}))
    } catch (err) {
      console.error('SessionEnd hook error:', err)
      console.log(JSON.stringify({}))
    }
  }
}

main().catch(console.error)