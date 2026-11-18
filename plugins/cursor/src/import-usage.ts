import { readFile, stat } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { parseCursorBilling } from './billing'
import { enqueueEvents, flushEvents } from '../../shared/transport'

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { file: { type: 'string' }, 'user-id': { type: 'string' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('Usage: npm run cursor:import -- --file BILLING_ITEMS.json --user-id user_YOUR_ID [--dry-run]\nImports documented Cursor v2 billing items only, filtered to you. Dashboard CSV/transcript fields are not guessed.'); return }
  if (!values.file || !values['user-id']) throw new Error('Supply --file and --user-id')
  if ((await stat(values.file)).size > 67_108_864) throw new Error('Export exceeds 64 MiB; split it into smaller exports')
  const result = parseCursorBilling(JSON.parse(await readFile(values.file, 'utf8')), values['user-id'])
  console.log(`Found ${result.events.length} own Cursor requests; skipped ${result.skipped} unrelated/non-token items. ${result.unavailableCosts} requests have unavailable costs.`)
  if (values['dry-run']) { console.log('Nothing uploaded.'); return }
  await enqueueEvents(result.events)
  const uploaded = await flushEvents()
  console.log(`Uploaded ${uploaded.uploaded} metrics (${uploaded.inserted} new events). Only whitelisted counters/models and opaque IDs leave this machine.`)
}

main().catch(() => { console.error('Cursor import failed. Check the documented v2 JSON export, your user_ ID, and collector login/status/flush. Metrics already queued remain local.'); process.exitCode = 1 })
