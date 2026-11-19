import { parseArgs } from 'node:util'
import { isAbsolute } from 'node:path'
import { OpenCode } from '@opencode/client'
import { Service } from '@opencode/client/service'
import { configDirectory } from '../../shared/config'
import { readCredentials } from '../../shared/storage'
import { flushEvents } from '../../shared/transport'
import { readOpenCodeHistory } from './history'
import { queueOpenCodeHistory } from './history-upload'
import { openCodeTokenSummary } from './requests'

function historyTime(value?: string): number | undefined {
  if (value === undefined) return undefined
  if (!/^\d{4}-\d{2}-\d{2}(?:T.+(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new Error('Use a UTC date or a timestamp with an explicit timezone')
  const time = Date.parse(value)
  if (!Number.isFinite(time)) throw new Error('Invalid history date')
  return time
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    'session-id': { type: 'string' }, since: { type: 'string' }, until: { type: 'string' },
    'config-dir': { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } })
  if (values.help) {
    console.log('Usage: npm run opencode:import -- [--session-id SESSION_ID] [--since UTC_DATE] [--until UTC_DATE] [--dry-run] [--config-dir ABSOLUTE_PATH]\nReads saved assistant/compaction request counters through your running local OpenCode V2 service. Time range is start-inclusive/end-exclusive. Dry run makes no Supabase requests and writes nothing. No prompts, code, summaries or paths are uploaded.')
    return
  }
  if (values['config-dir']) {
    if (!isAbsolute(values['config-dir'])) throw new Error('Collector config directory must be absolute')
    process.env.BYM_CONFIG_DIR = values['config-dir']
  }
  const directory = configDirectory()
  const credentials = values['dry-run'] ? undefined : await readCredentials(directory)
  const endpoint = await Service.discover({ version: version => version.startsWith('2.') })
  if (!endpoint) throw new Error('Start your local OpenCode V2 service before importing')
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
  const options = { signal: () => AbortSignal.timeout(30_000) }
  const history = await readOpenCodeHistory({
    session: sessionID => client.session.get({ sessionID }, { signal: options.signal() }),
    sessions: input => client.session.list(input, { signal: options.signal() }),
    messages: input => client.message.list(input, { signal: options.signal() }),
  }, { sessionID: values['session-id'], since: historyTime(values.since), until: historyTime(values.until) })
  const totals = openCodeTokenSummary(history.events)
  const format = (value: bigint) => new Intl.NumberFormat('en-US').format(value)
  console.log(`Found ${history.events.length} saved requests across ${history.sessions} sessions.\nIn: ${format(totals.input)}; Out: ${format(totals.output)}; Cached: ${format(totals.cached)}.`)
  if (values['dry-run']) {
    console.log('Dry run: nothing queued or uploaded. Saved totals include any requests already uploaded; the real import reconciles that overlap.')
    return
  }
  const queued = await queueOpenCodeHistory(history.events, directory, credentials!)
  const current = await readCredentials(directory)
  if (current.userId !== credentials!.userId || current.supabaseUrl !== credentials!.supabaseUrl) throw new Error('Collector account changed during history import')
  const result = await flushEvents(directory)
  console.log(`Queued ${queued.queued} missing requests; ${queued.alreadyRecorded} already recorded or pending. Uploaded ${result.uploaded} metrics (${result.inserted} new events).`)
  console.log('Only saved per-request counters were imported. Historical title/transient-generation usage without saved request records is not reconstructed.')
}

main().catch(() => {
  // Native service/parser errors can contain private data. Never print them.
  console.error('OpenCode usage import failed. Check the running local V2 service, date range, and collector login/status/flush. Ambiguous or conflicting overlap is rejected; any queued metrics stay private. No transcript content is uploaded.')
  process.exitCode = 1
})
