export const COLLECTORS = [
  { id: 'opencode', name: 'OpenCode', icon: '⌨️', mode: 'Live requests',
    description: 'OpenCode V2 started/ended/failed steps; retains the dispatched model and ignores cumulative totals.',
    command: 'npm run --silent collector -- config --tool opencode',
    target: 'Merge the plugins entry into ~/.config/opencode/opencode.json(c). Changes reload automatically; /reload forces a reload.' },
  { id: 'claude-code', name: 'Claude Code', icon: '🤖', mode: 'Transcript hooks',
    description: 'Reads local assistant/subagent request counters, deduplicating API message IDs. Transcripts can lag; explicit imports recover late entries.',
    command: 'npm run --silent collector -- config --tool claude-code',
    target: 'Merge the hooks entries into ~/.claude/settings.json, preserving existing hooks. Or load the full built plugin directory—not only its manifest.' },
  { id: 'codex', name: 'Codex', icon: '💬', mode: 'Paired live hooks',
    description: 'Paired synchronous Pre/PostModelRequest hooks keep identical genuine attempts and deduplicate retries. No historical hook replay.',
    command: 'npm run --silent collector -- config --tool codex',
    target: 'Merge all three entries into $CODEX_HOME/hooks.json (normally ~/.codex/hooks.json), then review/trust them in /hooks. Keep Pre/Post synchronous.' },
  { id: 'cursor', name: 'Cursor', icon: '📝', mode: 'Manual v2 import',
    description: 'Imports documented v2 billing items for your user_ principal only. Requires a Team API export; ordinary dashboard CSVs/transcripts are not guessed.',
    command: 'npm run cursor:import -- --file billing-items.json --user-id user_YOUR_ID --dry-run',
    target: 'Preview first, then remove --dry-run to upload. Other users, credits, adjustments and non-Cursor products are excluded; hidden costs remain unavailable.' },
] as const

export const COLLECTOR_QUICKSTART = 'git clone https://github.com/Joosibaeri/burnyourmoneywithslop.git\ncd burnyourmoneywithslop\nnpm ci\nnpm run collectors:build\nnpm run collector -- login'
