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

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open'
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    url: { type: 'string' }, key: { type: 'string' }, site: { type: 'string' }, tool: { type: 'string' }, 'no-open': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } })
  const command = positionals[0]
  const directory = configDirectory()
  if (values.help || !command) {
    console.log('Usage: npm run collector -- <login|status|flush|logout|config>\nLogin options: --no-open, --site HTTPS_ORIGIN, or --url SUPABASE_ORIGIN --key PUBLISHABLE_KEY\nConfig: --tool opencode|claude-code|codex (prints a snippet; merge it into your existing global configuration)\nRun login once per machine. No prompts, code, transcripts, or GitHub access tokens are uploaded/stored by the collector.')
    return
  }
  if (command === 'config') {
    if (!values.tool) throw new Error('Supply --tool opencode, claude-code, or codex')
    console.log(JSON.stringify(configurationSnippet(values.tool, fileURLToPath(new URL('../../../', import.meta.url))), null, 2))
  } else if (command === 'login') {
    if (!!values.url !== !!values.key) throw new Error('Supply --url and --key together')
    const config = values.url && values.key ? validateConfig({ supabaseUrl: values.url, publishableKey: values.key }) : await discoverConfig(values.site)
    await collectorLogin(config, directory, { onUrl: url => {
      console.log(`Authorize this collector in your browser:\n${url}\nWaiting for GitHub sign-in…`)
      if (!values['no-open']) openBrowser(url)
    } })
    console.log(`Signed in. Refreshable credentials saved privately in ${directory}. Run collector flush to upload any pending metrics.`)
  } else if (command === 'status') {
    const credentials = await readCredentials(directory)
    console.log(`Signed in to ${credentials.supabaseUrl}\nUser: ${credentials.userId}\nAccess token expires: ${new Date(credentials.expiresAt * 1000).toISOString()} (refreshes on upload)\nCredential directory: ${directory}`)
  } else if (command === 'flush') {
    const result = await flushEvents(directory)
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
  } else throw new Error('Unknown command. Use login, status, flush, logout, or config.')
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Collector command failed'); process.exitCode = 1 })
