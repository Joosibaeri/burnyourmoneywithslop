# Plugin Installation Guide

Install plugins for each AI tool to automatically track usage and send it to Burn Your Money With Slop.

## Prerequisites

- Supabase project configured (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))
- Supabase URL and Anon Key ready

---

## OpenCode Plugin

### Installation

```bash
# Clone or copy the plugin
mkdir -p ~/.config/opencode/plugins
cp -r plugins/opencode ~/.config/opencode/plugins/burnyourmoneywithslop
```

### Configuration

Add to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./plugins/burnyourmoneywithslop",
      "options": {
        "supabaseUrl": "https://your-project.supabase.co",
        "supabaseAnonKey": "your-anon-key",
        "batchSize": 10,
        "flushIntervalMs": 30000
      }
    }
  ]
}
```

### How It Works

- Listens to `session.usage.updated` events (periodic cumulative usage)
- Listens to `session.step.ended` events (per-step usage)
- Batches events and sends to Supabase Edge Function every 30 seconds
- Runs in OpenCode server process - no external dependencies

### Verify

1. Restart OpenCode: `opencode service restart`
2. Check logs: `opencode service status` then check `~/.local/share/opencode/log/opencode.log`
3. Use OpenCode for a coding session
4. Check Supabase `usage_events` table

---

## Claude Code Plugin

### Installation

```bash
# Copy plugin to Claude plugins directory
mkdir -p ~/.claude/plugins
cp -r plugins/claude-code ~/.claude/plugins/burnyourmoneywithslop
```

### Build

```bash
cd ~/.claude/plugins/burnyourmoneywithslop
npm install
npm run build
```

### Configuration

1. Open Claude Code
2. Run `/plugins` to review and trust the plugin hooks
3. The plugin will prompt for Supabase credentials on first run
4. Or configure via `~/.claude/settings.json`:

```json
{
  "plugins": {
    "burnyourmoneywithslop": {
      "supabase_url": "https://your-project.supabase.co",
      "supabase_anon_key": "your-anon-key"
    }
  }
}
```

### How It Works

- `Stop` hook: Runs at end of each agent turn, reads transcript for token usage
- `SessionEnd` hook: Runs when session ends, sends final summary
- Uses OpenTelemetry for additional metrics (optional)
- Sends data to Supabase Edge Function via Node.js scripts

### Verify

1. Use Claude Code for a coding session
2. Check Supabase `usage_events` table for `tool: "claude-code"`

---

## Cursor Plugin

### Installation

```bash
# Copy plugin to Cursor local plugins directory
mkdir -p ~/.cursor/plugins/local
cp -r plugins/cursor ~/.cursor/plugins/local/burnyourmoneywithslop
```

### Build

```bash
cd ~/.cursor/plugins/local/burnyourmoneywithslop
npm install
npm run build
```

### Configuration

1. Restart Cursor
2. Open Cursor Settings → Plugins
3. Find "Burn Your Money With Slop" and click **Configure**
3. Enter your Supabase URL and Anon Key
4. Enable the plugin

### How It Works

- `sessionEnd` hook: Runs when a composer conversation ends
- Reads the conversation transcript for token usage
- Sends aggregated usage to Supabase Edge Function
- Runs as Node.js script from plugin directory

### Verify

1. Use Cursor for a coding session
2. Check Supabase `usage_events` table for `tool: "cursor"`

---

## Codex Plugin

### Installation

```bash
# Copy hooks to Codex hooks directory
mkdir -p ~/.codex
cp plugins/codex/.codex/hooks.json ~/.codex/hooks.json
# OR for project-specific:
cp plugins/codex/.codex/hooks.json .codex/hooks.json
```

### Build

```bash
cd plugins/codex
npm install
npm run build
# Copy dist to Codex plugins directory
mkdir -p ~/.codex/plugins/burnyourmoneywithslop
cp -r dist ~/.codex/plugins/burnyourmoneywithslop/
```

### Configuration

1. Edit `~/.codex/hooks.json` (or project `.codex/hooks.json`)
2. Update the script paths to point to your built plugin:

```json
{
  "hooks": {
    "PostModelRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["~/.codex/plugins/burnyourmoneywithslop/dist/post-model-request.js"],
            "timeout": 10,
            "statusMessage": "Sending usage to Burn Your Money With Slop"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["~/.codex/plugins/burnyourmoneywithslop/dist/session-end.js"],
            "timeout": 3,
            "statusMessage": "Finalizing usage tracking"
          }
        ]
      }
    ]
  }
}
```

3. Set environment variables for Supabase credentials:

```bash
# Add to your shell config (.bashrc, .zshrc, etc.)
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

### How It Works

- `PostModelRequest` hook: Runs after each model request attempt, captures `token_usage`
- `SessionEnd` hook: Runs when session ends
- Sends data to Supabase Edge Function via Node.js scripts
- Works with Codex CLI and Codex in ChatGPT

### Verify

1. Use Codex for a coding session
2. Check Supabase `usage_events` table for `tool: "codex"`

---

## Environment Variables

All plugins require these environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Your Supabase anon/publishable key | Yes |

### Setting Environment Variables

**Linux/macOS (bash/zsh):**
```bash
echo 'export SUPABASE_URL="https://your-project.supabase.co"' >> ~/.bashrc
echo 'export SUPABASE_ANON_KEY="your-anon-key"' >> ~/.bashrc
source ~/.bashrc
```

**Windows (PowerShell):**
```powershell
[Environment]::SetEnvironmentVariable("SUPABASE_URL", "https://your-project.supabase.co", "User")
[Environment]::SetEnvironmentVariable("SUPABASE_ANON_KEY", "your-anon-key", "User")
```

**VS Code / Cursor / Claude Desktop:**
Add to your shell config or use the plugin's configuration UI.

---

## Troubleshooting

### Plugin not loading

- Check plugin directory structure matches expected format
- Verify `package.json` has correct `name` and `main`/`exports`
- Check tool's plugin logs for errors

### No data in Supabase

- Verify Edge Function is deployed: `supabase functions list`
- Check function logs: `supabase functions logs ingest-usage`
- Verify environment variables are set in the plugin's process

### Hook not firing

- Review and trust hooks in the tool's UI (`/hooks` in Codex, `/plugins` in Claude Code)
- Check hook timeout - increase if transcripts are large
- Verify transcript path exists and is readable

### Permission errors

- Ensure plugin scripts are executable: `chmod +x dist/*.js`
- Check hook `timeout` values - increase for large transcripts
- Verify Supabase credentials have correct permissions

---

## Privacy

All plugins only send:
- Token counts (input, output, reasoning, cache)
- Estimated cost (calculated locally)
- Model name
- Session/conversation IDs
- Timestamps

**Never sent:** Prompts, code, file contents, transcripts, or any user data.

---

## Uninstalling

### OpenCode
Remove from `opencode.json` plugins array.

### Claude Code
Run `/plugins` → Disable/Remove "Burn Your Money With Slop"

### Cursor
Settings → Plugins → Disable/Remove "Burn Your Money With Slop"

### Codex
Remove from `~/.codex/hooks.json` or project `.codex/hooks.json`