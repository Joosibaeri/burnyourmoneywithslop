// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'jsonc-parser'
import { installCollectors, mergeCollectorConfig } from './install'
import { writeConfig } from './files'
import { configurationSnippet } from './setup'

const directories: string[] = []
async function directory() { const parent = join(tmpdir(), 'opencode'); await mkdir(parent, { recursive: true }); const path = await mkdtemp(join(parent, 'collector-install-test-')); directories.push(path); return path }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('persistent collector installation', () => {
  it('preserves JSONC comments, providers and unrelated plugins, and is repeatable', () => {
    const original = '{\n  // Keep my provider settings\n  "providers": {"private": {"setting": "unchanged"}},\n  "plugins": [\n    // Keep this plugin comment\n    "other-plugin",\n  ],\n}\n'
    const merged = mergeCollectorConfig(original, 'opencode', '/home/friend/slop', '/home/friend/private')
    expect(merged).toContain('// Keep my provider settings')
    expect(merged).toContain('// Keep this plugin comment')
    const result = parse(merged)
    expect(result.providers).toEqual(parse(original).providers)
    expect(result.plugins).toHaveLength(2)
    expect(result.plugins[1].options.configDirectory).toBe('/home/friend/private')
    expect(mergeCollectorConfig(merged, 'opencode', '/home/friend/slop', '/home/friend/private')).toBe(merged)
  })
  it('preserves unrelated hooks and installs synchronous Codex pairs with startup flushing', () => {
    const original = '{"hooks":{"PreModelRequest":[\n// Keep my hook comment\n{"hooks":[{"type":"command","command":"other-command"}]}]}}'
    const merged = mergeCollectorConfig(original, 'codex', '/home/friend/slop', '/home/friend/private')
    expect(merged).toContain('// Keep my hook comment')
    const result = parse(merged)
    expect(result.hooks.PreModelRequest).toHaveLength(2)
    expect(result.hooks.PreModelRequest[0].hooks[0].command).toBe('other-command')
    expect(result.hooks.PreModelRequest[1].hooks[0].async).toBe(false)
    expect(result.hooks.PostModelRequest[0].hooks[0].async).toBe(false)
    expect(result.hooks.SessionStart[0].hooks[0].async).toBe(true)
    expect(mergeCollectorConfig(merged, 'codex', '/home/friend/slop', '/home/friend/private')).toBe(merged)
  })
  it('upgrades its own legacy handlers without duplicating them or shortening user timeouts', () => {
    const old = configurationSnippet('claude-code', '/home/friend/slop') as { hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>> }
    old.hooks.SessionEnd[0].hooks[0].timeout = 45
    const result = parse(mergeCollectorConfig(JSON.stringify(old), 'claude-code', '/home/friend/slop', '/home/friend/private'))
    expect(result.hooks.SessionEnd).toHaveLength(1)
    expect(result.hooks.SessionEnd[0].hooks[0].timeout).toBe(45)
    expect(result.hooks.SessionEnd[0].hooks[0].args).toEqual(['/home/friend/slop/plugins/claude-code/dist/session-end-hook.js', '--config-dir', '/home/friend/private'])
  })
  it.each(['{"plugins":{}}', 'not json', '[]'])('refuses malformed configuration without guessing (%s)', text => {
    expect(() => mergeCollectorConfig(text, 'opencode', '/repo', '/private')).toThrow()
  })
  it('creates private backups and preserves symlinks when modifying an existing config', async () => {
    const root = await directory()
    const target = join(root, 'actual.json')
    const link = join(root, 'linked.json')
    await writeFile(target, '{"keep":true}\n')
    await symlink(target, link)
    const backup = await writeConfig(link, '{"keep":true,"new":true}\n')
    expect(await readFile(backup!, 'utf8')).toBe('{"keep":true}\n')
    expect((await stat(backup!)).mode & 0o777).toBe(0o600)
    expect(await readFile(link, 'utf8')).toContain('"new":true')
    expect(await writeConfig(link, '{"keep":true,"new":true}\n')).toBeNull()
  })
  it('does not overwrite configuration changed by another writer', async () => {
    const root = await directory()
    const path = join(root, 'config.json')
    await writeFile(path, '{"newUserWork":true}')
    await expect(writeConfig(path, '{"replacement":true}', '{"old":true}')).rejects.toThrow('not overwritten')
    expect(await readFile(path, 'utf8')).toBe('{"newUserWork":true}')
  })
  it('writes persistent configs to selected files without touching other files', async () => {
    const root = await directory()
    for (const [tool, entry] of [['opencode', 'index'], ['claude-code', 'stop-hook'], ['codex', 'stop-hook']]) {
      await mkdir(join(root, 'plugins', tool, 'dist'), { recursive: true })
      await writeFile(join(root, 'plugins', tool, 'dist', `${entry}.js`), '')
    }
    const paths = { opencode: join(root, 'opencode.jsonc'), 'claude-code': join(root, 'claude.json'), codex: join(root, 'codex.json') }
    await writeFile(paths.opencode, '{"keep":42}')
    const first = await installCollectors('all', root, join(root, 'private'), paths)
    expect(first).toHaveLength(3)
    expect(parse(await readFile(paths.opencode, 'utf8')).keep).toBe(42)
    const second = await installCollectors('all', root, join(root, 'private'), paths)
    expect(second.every(item => !item.changed)).toBe(true)
    expect((await readdir(root)).filter(name => name.includes('.bym-backup-'))).toHaveLength(1)
  })
})
