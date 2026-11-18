import { isAbsolute, join } from 'node:path'

export function configurationSnippet(tool: string, root: string): Record<string, unknown> {
  if (!isAbsolute(root)) throw new Error('Collector repository path must be absolute')
  if (tool === 'opencode') return { $schema: 'https://opencode.ai/config.json', plugins: [join(root, 'plugins/opencode')] }
  const path = (name: string) => join(root, 'plugins', tool, 'dist', `${name}.js`)
  const claudeHook = (name: string, async = true) => [{ hooks: [{ type: 'command', command: 'node', args: [path(name)], async, timeout: async ? 20 : 1 }] }]
  if (tool === 'claude-code') return { hooks: {
    SessionStart: claudeHook('stop-hook'), Stop: claudeHook('stop-hook'), StopFailure: claudeHook('stop-hook'),
    SubagentStop: claudeHook('subagent-stop-hook'), SessionEnd: claudeHook('session-end-hook', false),
  } }
  // Codex command hooks use shell command strings, not Claude's exec-form args.
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const codexHook = (name: string, async = false) => [{ hooks: [{ type: 'command', command: `node ${quote(path(name))}`,
    commandWindows: `node "${path(name).replaceAll('"', '\\"')}"`, async, timeout: async ? 30 : 20 }] }]
  if (tool === 'codex') return { hooks: { PreModelRequest: codexHook('pre-model-request'), PostModelRequest: codexHook('post-model-request'), Stop: codexHook('stop-hook', true) } }
  throw new Error('Use --tool opencode, claude-code, or codex. Cursor uses npm run cursor:import, not hooks.')
}
