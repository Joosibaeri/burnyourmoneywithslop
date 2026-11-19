// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { startupUnits } from './autostart'

describe('login/reboot upload scheduler', () => {
  it('schedules private queued uploads after login/reboot without starting coding tools', () => {
    const units = startupUnits('/usr/bin/node', '/home/friend/slop/plugins/collector/dist/index.js', '/home/friend/private')
    expect(units.timer).toContain('OnStartupSec=15s')
    expect(units.timer).toContain('OnUnitInactiveSec=60s')
    expect(units.timer).toContain('WantedBy=timers.target')
    expect(units.service).toContain('Type=oneshot')
    expect(units.service).toContain('flush --config-dir "/home/friend/private" --max-batches 5')
    expect(units.service).toContain('UMask=0077')
    expect(units.service).not.toContain('login')
    expect(units.service).not.toContain('refreshToken')
  })
  it('quotes paths and escapes systemd specifiers and environment expansions', () => {
    const units = startupUnits('/path with spaces/node', '/repo/%name/$value/cli.js', '/private/"quoted"')
    expect(units.service).toContain('"/path with spaces/node"')
    expect(units.service).toContain('%%name/$$value')
    expect(units.service).toContain('\\"quoted\\"')
  })
  it.each(['relative/path', '/unsafe\nnew-directive'])('rejects unsafe paths (%s)', path => {
    expect(() => startupUnits('/usr/bin/node', path, '/private')).toThrow()
  })
})
