import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isAbsolute, join } from 'node:path'
import { existingText, writeConfig } from './files'
import { readCredentials } from '../../shared/storage'
import { userConfigHome } from '../../shared/config'

const exec = promisify(execFile)
export const FLUSH_TIMER = 'burnyourmoneywithslop-flush.timer'
export const FLUSH_SERVICE = 'burnyourmoneywithslop-flush.service'
const MARKER = '# Managed by burnyourmoneywithslop collector\n'

function quote(value: string): string {
  if (!isAbsolute(value) || /[\r\n\0]/.test(value)) throw new Error('Autostart paths must be absolute and contain no control characters')
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => '$$')}"`
}

export function startupUnits(node: string, cli: string, directory: string): { service: string; timer: string } {
  return {
    service: `${MARKER}[Unit]\nDescription=Upload queued Burn Your Money metrics\n\n[Service]\nType=oneshot\nExecStart=${quote(node)} ${quote(cli)} flush --config-dir ${quote(directory)} --max-batches 5\nTimeoutStartSec=180\nNoNewPrivileges=true\nUMask=0077\n`,
    timer: `${MARKER}[Unit]\nDescription=Retry Burn Your Money uploads after login/reboot\n\n[Timer]\nOnStartupSec=15s\nOnUnitInactiveSec=60s\nAccuracySec=10s\nUnit=${FLUSH_SERVICE}\n\n[Install]\nWantedBy=timers.target\n`,
  }
}

export async function autostartStatus(): Promise<{ enabled: boolean; active: boolean }> {
  if (process.platform !== 'linux') return { enabled: false, active: false }
  const check = async (command: string) => { try { await exec('systemctl', ['--user', '--no-ask-password', command, '--quiet', FLUSH_TIMER]); return true } catch { return false } }
  const [enabled, active] = await Promise.all([check('is-enabled'), check('is-active')])
  return { enabled, active }
}

export async function configureAutostart(action: string, node: string, cli: string, directory: string): Promise<void> {
  if (process.platform !== 'linux') throw new Error('Automatic login/reboot uploads currently require Linux with systemd. Tool hooks remain persistent on other platforms.')
  if (!['enable', 'disable'].includes(action)) throw new Error('Use autostart enable, disable, or status')
  if (action === 'enable') {
    await readCredentials(directory) // Do not install a repeating unsigned-in job.
    const units = startupUnits(node, cli, directory)
    const folder = join(userConfigHome(), 'systemd/user')
    const files = [[FLUSH_SERVICE, units.service], [FLUSH_TIMER, units.timer]]
    for (const [name] of files) {
      const path = join(folder, name)
      const previous = await existingText(path)
      if (previous !== null && !previous.startsWith(MARKER)) throw new Error('A same-named unmanaged startup unit already exists; it was not overwritten')
    }
    for (const [name, text] of files) await writeConfig(join(folder, name), text)
    await exec('systemd-analyze', ['--user', 'verify', join(folder, FLUSH_SERVICE), join(folder, FLUSH_TIMER)])
    await exec('systemctl', ['--user', '--no-ask-password', 'daemon-reload'])
    await exec('systemctl', ['--user', '--no-ask-password', 'enable', '--now', FLUSH_TIMER])
  } else {
    for (const name of [FLUSH_SERVICE, FLUSH_TIMER]) {
      const previous = await existingText(join(userConfigHome(), 'systemd/user', name))
      if (previous !== null && !previous.startsWith(MARKER)) throw new Error('A same-named unmanaged startup unit exists; it was not disabled')
    }
    await exec('systemctl', ['--user', '--no-ask-password', 'disable', '--now', FLUSH_TIMER])
    await exec('systemctl', ['--user', '--no-ask-password', 'stop', FLUSH_SERVICE])
  }
}
