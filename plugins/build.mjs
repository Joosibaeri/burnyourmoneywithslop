import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const entries = [
  ['collector', 'index'], ['opencode', 'index'],
  ['claude-code', 'stop-hook'], ['claude-code', 'session-end-hook'],
  ['claude-code', 'subagent-stop-hook'], ['claude-code', 'import-usage'],
  ['codex', 'pre-model-request'], ['codex', 'post-model-request'], ['codex', 'stop-hook'], ['cursor', 'import-usage'],
]
const selected = process.argv[2]
if (selected && !entries.some(([tool]) => tool === selected)) throw new Error('Unknown collector build target')
await Promise.all(entries.filter(([tool]) => !selected || tool === selected).map(([tool, entry]) => build({
  absWorkingDir: root, entryPoints: [`plugins/${tool}/src/${entry}.ts`],
  outfile: `plugins/${tool}/dist/${entry}.js`, bundle: true, platform: 'node', format: 'esm',
  target: 'node22', mainFields: ['module', 'main'], external: ['@opencode/plugin'], logLevel: 'info',
})))
// Source-level tests alone cannot detect an ESM bundle's dynamic-require errors.
if (!selected || selected === 'collector') await promisify(execFile)(process.execPath, ['plugins/collector/dist/index.js', '--help'], { cwd: root })
