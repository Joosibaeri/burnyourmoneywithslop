import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

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
  target: 'node22', external: ['@opencode/plugin'], logLevel: 'info',
})))
