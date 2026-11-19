// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { configurationSnippet } from './setup'
import { validateConfig } from '../../shared/config'

describe('collector configuration snippets', () => {
  it('generates V2 OpenCode package loading with absolute paths', () => {
    expect(configurationSnippet('opencode', '/home/friend/slop')).toEqual({ $schema: 'https://opencode.ai/config.json', plugins: ['/home/friend/slop/plugins/opencode'] })
  })
  it('keeps manually generated OpenCode configuration on the selected private credential directory', () => {
    expect(configurationSnippet('opencode', '/home/friend/slop', '/home/friend/private')).toEqual({
      $schema: 'https://opencode.ai/config.json',
      plugins: [{ package: '/home/friend/slop/plugins/opencode', options: { configDirectory: '/home/friend/private' } }],
    })
  })
  it('rejects relative credential directories for every live collector snippet', () => {
    for (const tool of ['opencode', 'claude-code', 'codex']) {
      expect(() => configurationSnippet(tool, '/home/friend/slop', 'relative/private')).toThrow('must be absolute')
    }
  })
  it('uses Codex shell commands and paired synchronous hooks, not unsupported args', () => {
    const snippet = configurationSnippet('codex', "/home/friend's folder/slop") as { hooks: Record<string, Array<{ hooks: Array<{ command: string; async: boolean }> }>> }
    expect(snippet.hooks.PreModelRequest[0].hooks[0].async).toBe(false)
    expect(snippet.hooks.PostModelRequest[0].hooks[0].async).toBe(false)
    expect(snippet.hooks.Stop[0].hooks[0].async).toBe(true)
    expect(snippet.hooks.PreModelRequest[0].hooks[0].command).toContain("friend'\\''s folder")
    expect(snippet.hooks.PreModelRequest[0].hooks[0]).not.toHaveProperty('args')
  })
  it('rejects privileged keys, remote HTTP and credential-bearing project URLs', () => {
    const valid = { supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test' }
    expect(validateConfig(valid).supabaseUrl).toBe(valid.supabaseUrl)
    expect(() => validateConfig({ ...valid, publishableKey: 'sb_secret_private' })).toThrow()
    expect(() => validateConfig({ ...valid, supabaseUrl: 'http://project.supabase.co' })).toThrow()
    expect(() => validateConfig({ ...valid, supabaseUrl: 'https://secret@project.supabase.co/auth' })).toThrow()
  })
})
