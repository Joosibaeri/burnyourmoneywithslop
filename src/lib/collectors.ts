export const COLLECTORS = [
  { id: 'opencode', name: 'OpenCode', icon: '⌨️', mode: 'Live requests',
    description: 'OpenCode V2 started/ended/failed steps; retains the dispatched model and ignores cumulative totals.',
    command: 'npm run collector -- install --tool opencode',
    target: 'Installs persistent global configuration while preserving your other settings. OpenCode reloads automatically and activates the collector whenever the tool starts.' },
  { id: 'claude-code', name: 'Claude Code', icon: '🤖', mode: 'Transcript hooks',
    description: 'Reads local assistant/subagent request counters, deduplicating API message IDs. Transcripts can lag; explicit imports recover late entries.',
    command: 'npm run collector -- install --tool claude-code',
    target: 'Installs persistent global hooks with backups. Start a fresh Claude session if it has snapshotted settings; subsequent restarts retain the collector.' },
  { id: 'codex', name: 'Codex', icon: '💬', mode: 'Paired live hooks',
    description: 'Paired synchronous Pre/PostModelRequest hooks keep identical genuine attempts and deduplicate retries. No historical hook replay.',
    command: 'npm run collector -- install --tool codex',
    target: 'Installs persistent global hooks, including startup flushing. Review/trust them in /hooks once; keep Pre/Post synchronous. Trust and configuration persist after restarts.' },
  { id: 'cursor', name: 'Cursor', icon: '📝', mode: 'Manual v2 import',
    description: 'Imports documented v2 billing items for your user_ principal only. Requires a Team API export; ordinary dashboard CSVs/transcripts are not guessed.',
    command: 'npm run cursor:import -- --file billing-items.json --user-id user_YOUR_ID --dry-run',
    target: 'Preview first, then remove --dry-run to upload. Other users, credits, adjustments and non-Cursor products are excluded; hidden costs remain unavailable.' },
] as const

export const COLLECTOR_QUICKSTART = 'git clone https://github.com/Joosibaeri/burnyourmoneywithslop.git\ncd burnyourmoneywithslop\nnpm ci\nnpm run collectors:build\nnpm run collector -- login\nnpm run collector -- install --tool all'
