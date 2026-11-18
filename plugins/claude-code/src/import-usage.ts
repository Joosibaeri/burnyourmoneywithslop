import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { collectClaudeUsage, readClaudeTranscript } from './transcript'
import { flushEvents } from '../../shared/transport'

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { file: { type: 'string' }, 'session-id': { type: 'string' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('Usage: npm run claude:import -- --file TRANSCRIPT.jsonl --session-id SESSION_ID [--dry-run]'); return }
  if (!values.file || !values['session-id']) throw new Error('Supply --file and --session-id')
  const path = resolve(values.file)
  if (values['dry-run']) {
    const events = await readClaudeTranscript(path, values['session-id'])
    console.log(`Found ${events.length} metrics-only requests. Nothing uploaded.`)
    return
  }
  const events = await collectClaudeUsage({ hook_event_name: 'Stop', transcript_path: path, session_id: values['session-id'] }, undefined, 0)
  const result = await flushEvents()
  console.log(`Queued ${events.length} new local requests; uploaded ${result.uploaded} metrics (${result.inserted} new events).`)
}

main().catch(() => { console.error('Claude usage import failed. Check the file/schema and collector login/status/flush. No transcript content is uploaded.'); process.exitCode = 1 })
