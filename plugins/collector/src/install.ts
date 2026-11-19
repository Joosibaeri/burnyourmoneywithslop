import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { access } from 'node:fs/promises'
import { userConfigHome } from '../../shared/config'
import { configurationSnippet } from './setup'
import { existingText, writeConfig } from './files'

export type InstallTool = 'opencode' | 'claude-code' | 'codex'
const TOOLS: InstallTool[] = ['opencode', 'claude-code', 'codex']

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function mergeCollectorConfig(text: string, tool: InstallTool, root: string, directory: string): string {
  const errors: ParseError[] = []
  const original: unknown = parse(text.trim() ? text : '{}', errors, { allowTrailingComma: true })
  if (errors.length || !object(original)) throw new Error('Existing tool configuration is invalid; it was not modified')
  const snippet = configurationSnippet(tool, root, directory)
  let result = text.trim() ? text : '{}\n'
  const set = (path: Array<string | number>, value: unknown) => {
    result = applyEdits(result, modify(result, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' } }))
  }
  if (tool === 'opencode') {
    if (original.plugins !== undefined && !Array.isArray(original.plugins)) throw new Error('Existing plugins field is not an array; configuration was not modified')
    const packagePath = join(root, 'plugins/opencode')
    const plugins = (original.plugins ?? []) as unknown[]
    const index = plugins.findIndex(entry => entry === packagePath || object(entry) && entry.package === packagePath)
    if (index < 0) {
      const plugin = { package: packagePath, options: { configDirectory: directory } }
      if (original.plugins === undefined) set(['plugins'], [plugin])
      else set(['plugins', -1], plugin)
    } else if (object(plugins[index])) {
      if (plugins[index].options !== undefined && !object(plugins[index].options)) throw new Error('Existing collector plugin options are invalid; configuration was not modified')
      set(['plugins', index, 'options', 'configDirectory'], directory)
    } else set(['plugins', index], { package: packagePath, options: { configDirectory: directory } })
    if (original.$schema === undefined) set(['$schema'], 'https://opencode.ai/config.json')
  } else {
    if (original.hooks !== undefined && !object(original.hooks)) throw new Error('Existing hooks field is not an object; configuration was not modified')
    const hooks = (original.hooks ?? {}) as Record<string, unknown>
    const additions = snippet.hooks as Record<string, Array<{ hooks: unknown[] }>>
    for (const [event, groups] of Object.entries(additions)) {
      const current = hooks[event] ?? []
      if (!Array.isArray(current)) throw new Error('Existing hook event is not an array; configuration was not modified')
      const baseline = (configurationSnippet(tool, root).hooks as typeof additions)[event]
      for (const group of groups) {
        const desired = group.hooks[0] as Record<string, unknown>
        const previous = baseline[0].hooks[0] as Record<string, unknown>
        const same = (hook: unknown) => object(hook) &&
          ((hook.command === desired.command && JSON.stringify(hook.args) === JSON.stringify(desired.args)) ||
           (hook.command === previous.command && JSON.stringify(hook.args) === JSON.stringify(previous.args)))
        let found = false
        current.forEach((existing, i) => {
          if (!object(existing) || !Array.isArray(existing.hooks)) return
          existing.hooks.forEach((hook, j) => {
            if (!same(hook)) return
            found = true
            // Upgrade only our handler fields, preserving other scripts,
            // matcher groups, comments, and longer user-selected timeouts.
            for (const [field, value] of Object.entries(desired)) {
              const chosen = field === 'timeout' && object(hook) && typeof hook.timeout === 'number' ? Math.max(hook.timeout, value as number) : value
              set(['hooks', event, i, 'hooks', j, field], chosen)
            }
          })
        })
        if (!found) {
          if (hooks[event] === undefined) set(['hooks', event], [group])
          else set(['hooks', event, -1], group)
        }
      }
    }
  }
  return result
}

export async function installCollectors(tool: string, root: string, directory: string, paths?: Partial<Record<InstallTool, string>>): Promise<Array<{ tool: string; path: string; backup: string | null; changed: boolean }>> {
  if (!isAbsolute(root) || !isAbsolute(directory)) throw new Error('Use absolute repository and collector configuration paths')
  const selected = tool === 'all' ? TOOLS : TOOLS.includes(tool as InstallTool) ? [tool as InstallTool] : null
  if (!selected) throw new Error('Use --tool all, opencode, claude-code, or codex. Cursor uses explicit imports.')
  const results = []
  for (const name of selected) {
    await access(join(root, 'plugins', name, 'dist', name === 'opencode' ? 'index.js' : 'stop-hook.js')).catch(() => { throw new Error('Collector bundles are missing. Run npm run collectors:build first.') })
    let path = paths?.[name]
    if (!path && name === 'opencode') {
      const json = join(userConfigHome(), 'opencode/opencode.json')
      const jsonc = join(userConfigHome(), 'opencode/opencode.jsonc')
      const [hasJson, hasJsonc] = await Promise.all([existingText(json), existingText(jsonc)])
      if (hasJson !== null && hasJsonc !== null) throw new Error('Both global OpenCode JSON and JSONC files exist; merge the printed config snippet into your chosen file')
      path = hasJson !== null ? json : jsonc
    }
    path ??= name === 'claude-code' ? join(homedir(), '.claude/settings.json') : join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'hooks.json')
    if (!isAbsolute(path)) throw new Error('Tool configuration path must be absolute')
    const previous = await existingText(path)
    const before = previous ?? '{}\n'
    const after = mergeCollectorConfig(before, name, root, directory)
    const backup = before === after ? null : await writeConfig(path, after, previous)
    results.push({ tool: name, path, backup, changed: before !== after })
  }
  return results
}
