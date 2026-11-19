import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { configDirectory, discoverConfig, validateConfig } from '../../shared/config'
import { readCredentials, withLock } from '../../shared/storage'
import { accessCredentials, flushEvents } from '../../shared/transport'
import { collectorLogin } from './login'
import { configurationSnippet } from './setup'
import { installCollectors } from './install'
import { autostartStatus, configureAutostart } from './autostart'

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open'
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    url: { type: 'string' }, key: { type: 'string' }, site: { type: 'string' }, tool: { type: 'string' },
    'config-dir': { type: 'string' }, 'max-batches': { type: 'string' }, autostart: { type: 'boolean' }, refresh: { type: 'boolean' },
    'no-open': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } })
  const command = positionals[0]
  if (values['config-dir']) process.env.BYM_CONFIG_DIR = values['config-dir']
  const directory = configDirectory()
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const cli = fileURLToPath(import.meta.url)
  if (values.help || !command) {
    console.log('Usage: npm run collector -- <login|status|flush|logout|config|install|autostart>\nLogin: --no-open, --site HTTPS_ORIGIN, or --url SUPABASE_ORIGIN --key PUBLISHABLE_KEY; optional --autostart (Linux)\nInstall: --tool all|opencode|claude-code|codex [--autostart] (backs up and merges persistent global configuration)\nAutostart: enable|disable|status (Linux systemd user task after login/reboot)\nConfig: --tool opencode|claude-code|codex (prints a snippet only)\nOptional: --config-dir ABSOLUTE_PATH; flush --max-batches 1-100; status --refresh verifies renewal\nNo prompts, code, transcripts, or GitHub provider tokens are uploaded/stored.')
    return
  }
  if (command === 'config') {
    if (!values.tool) throw new Error('Supply --tool opencode, claude-code, or codex')
    console.log(JSON.stringify(configurationSnippet(values.tool, root, directory), null, 2))
  } else if (command === 'install') {
    if (!values.tool) throw new Error('Supply --tool all, opencode, claude-code, or codex')
    if (values.autostart) await readCredentials(directory)
    const installed = await installCollectors(values.tool, root, directory)
    for (const item of installed) console.log(`${item.tool}: ${item.changed ? 'installed' : 'already installed'} in ${item.path}${item.backup ? ` (backup: ${item.backup})` : ''}`)
    if (values.autostart) { await configureAutostart('enable', process.execPath, cli, directory); console.log('Automatic queued uploads enabled after user login/reboot, with minute-by-minute retries.') }
    console.log('OpenCode reloads automatically. Claude may require a new session. Review/trust changed Codex hooks in /hooks once; trust is retained after restarts. Cursor remains an explicit billing-export import.')
  } else if (command === 'autostart') {
    const action = positionals[1]
    if (action === 'status') console.log(JSON.stringify(await autostartStatus()))
    else {
      await configureAutostart(action ?? '', process.execPath, cli, directory)
      console.log(action === 'enable' ? 'Automatic queued uploads enabled after login/reboot.' : 'Automatic queued uploads disabled; tool hooks and private queues remain.')
    }
  } else if (command === 'login') {
    if (!!values.url !== !!values.key) throw new Error('Supply --url and --key together')
    const config = values.url && values.key ? validateConfig({ supabaseUrl: values.url, publishableKey: values.key }) : await discoverConfig(values.site)
    await collectorLogin(config, directory, { onUrl: url => {
      console.log(`Authorize this collector in your browser:\n${url}\nWaiting for GitHub sign-in…`)
      if (!values['no-open']) openBrowser(url)
    } })
    if (values.autostart) await configureAutostart('enable', process.execPath, cli, directory)
    console.log(`Signed in. Refreshable credentials saved privately in ${directory}. Run collector flush to upload any pending metrics.`)
  } else if (command === 'status') {
    const credentials = values.refresh ? await accessCredentials(directory, true) : await readCredentials(directory)
    console.log(`Signed in to ${credentials.supabaseUrl}\nUser: ${credentials.userId}\nAccess token expires: ${new Date(credentials.expiresAt * 1000).toISOString()} (refreshes on upload)\nCredential directory: ${directory}`)
    if (process.platform === 'linux') { const startup = await autostartStatus(); console.log(`Automatic login/reboot uploads: ${startup.enabled ? 'enabled' : 'disabled'} (${startup.active ? 'running' : 'not running'})`) }
  } else if (command === 'flush') {
    const maxBatches = values['max-batches'] === undefined ? 100 : Number(values['max-batches'])
    if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) throw new Error('--max-batches must be an integer from 1 to 100')
    const result = await flushEvents(directory, maxBatches)
    console.log(`Uploaded ${result.uploaded} metrics; ${result.inserted} new events (retries are deduplicated).`)
  } else if (command === 'logout') {
    // Revoke only this collector session, not the website or other devices.
    const credentials = await accessCredentials(directory)
    const supabase = createClient(credentials.supabaseUrl, credentials.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { error: sessionError } = await supabase.auth.setSession({ access_token: credentials.accessToken, refresh_token: credentials.refreshToken })
    if (sessionError) throw new Error('Could not validate collector session for logout')
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw new Error('Could not revoke collector session; retry logout')
    await withLock(directory, async () => {
      const current = await readCredentials(directory)
      if (current.userId !== credentials.userId || current.supabaseUrl !== credentials.supabaseUrl || current.refreshToken !== credentials.refreshToken) throw new Error('Collector account changed during logout; local credentials were not removed')
      await unlink(join(directory, 'credentials.json'))
    })
    console.log('Collector session revoked and local credentials removed. Pending metrics remain private on this machine.')
  } else throw new Error('Unknown command. Use login, status, flush, logout, config, install, or autostart.')
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Collector command failed'); process.exitCode = 1 })
