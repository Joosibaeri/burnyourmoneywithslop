import { stdin, stdout, stderr } from 'node:process'
import { parseArgs } from 'node:util'
import { configDirectory } from './config'
import type { UsageEvent } from './events'
import { enqueueEvents, flushEvents } from './transport'

// Hook stdin is one JSON object, not necessarily a single line. Never log that object.
export async function runHook(collect: (input: Record<string, unknown>) => Promise<UsageEvent[]>, options: { queueOnly?: boolean } = {}): Promise<void> {
  try {
    const { values } = parseArgs({ options: { 'config-dir': { type: 'string' } } })
    if (values['config-dir']) process.env.BYM_CONFIG_DIR = values['config-dir']
    configDirectory() // Validate overrides before collecting anything.
    let text = ''
    for await (const chunk of stdin) {
      text += chunk.toString()
      if (Buffer.byteLength(text) > 1_048_576) throw new Error('Hook input too large')
    }
    const input: unknown = JSON.parse(text)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid hook input')
    const events = await collect(input as Record<string, unknown>)
    await enqueueEvents(events)
    if (!options.queueOnly) await flushEvents(undefined, 5)
  } catch {
    // Parser/network errors may contain local paths, tokens, or transcript excerpts.
    stderr.write('Burn Your Money collector: collection/upload unavailable. Check collector status and flush; the tool will continue.\n')
  } finally {
    stdout.write('{}\n')
  }
}
