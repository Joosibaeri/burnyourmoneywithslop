# Collector installation

All collectors send metrics directly to authenticated Supabase ingestion; the website reads controlled aggregates. The website does not receive local transcripts.

## 1. Build and sign in once per machine

Use Node.js **22 or newer**. Keep this clone at a stable path; generated snippets refer to its built bundles.

```sh
git clone https://github.com/Joosibaeri/burnyourmoneywithslop.git
cd burnyourmoneywithslop
npm ci
npm run collectors:build
npm run collector -- login
```

Complete GitHub authorization in the browser. This uses PKCE, an in-memory verifier, and a random-state callback on **127.0.0.1:48173**. The only persisted session credentials are Supabase access/refresh tokens, expiry, user ID and public project configuration. GitHub provider tokens are discarded.

Credentials, queues and checkpoints live under `$XDG_CONFIG_HOME/burnyourmoneywithslop` or `~/.config/burnyourmoneywithslop`. On Unix, the directory is `0700` and files are `0600`. `BYM_CONFIG_DIR` can override this with an **absolute** path. Windows relies on your user-directory ACLs; do not use a shared folder.

For headless machines, use `--no-open`, open the printed URL in a browser on that machine, or forward the loopback port securely. Do not expose the listener publicly.

If hosted configuration discovery is unavailable because Pages HTTPS is still being provisioned:

```sh
npm run collector -- login --url https://skvbxlhnjnksmzdnchlu.supabase.co --key YOUR_PUBLISHABLE_KEY
```

Get the public key from [Supabase API Keys](https://supabase.com/dashboard/project/skvbxlhnjnksmzdnchlu/settings/api-keys). Never supply a secret/service-role key. GitHub OAuth must already be configured in Supabase; see [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## 2. Configure your tools

Generated snippets print JSON with your clone's absolute paths. **Merge the relevant entries into your existing configuration**, preserving other plugins/hooks. Do not redirect these commands onto an existing settings file and overwrite it. These packages are not published on npm.

### OpenCode V2

```sh
npm run --silent collector -- config --tool opencode
```

Merge the `plugins` entry into `~/.config/opencode/opencode.json` or `.jsonc`, or the corresponding `$XDG_CONFIG_HOME` location. Keep the published `$schema`.

The local package is `plugins/opencode`, with its default export at `dist/index.js`. The root install supplies the pinned `@opencode/plugin` **2.3.2** SDK. Configure the **directory/package**, not a copied manifest without its bundle.

Configuration reloads automatically; `/reload` forces a reload. Do not restart the shared OpenCode service just to apply a plugin change.

The plugin consumes one ordered live stream of started/ended/failed steps, correlating `assistantMessageID` with the exact dispatched model. It uploads reported per-step counters/cost, never cumulative `session.usage.updated` totals. Enabling it does not import historical sessions. If a start wasn't observed, the model remains unknown rather than being guessed from a later session selection. Usage-bearing failed steps are included.

### Claude Code

```sh
npm run --silent collector -- config --tool claude-code
```

Merge `hooks` into `~/.claude/settings.json`, or your desired project settings. Alternatively, use Claude's local plugin loading with the entire built `plugins/claude-code` directory. Do not install both paths; duplicate registrations are unnecessary. Review hooks using Claude's documented hook/plugin interface and use a fresh session if it has already snapshotted its settings.

The supplied manifest has no MCP server, OpenTelemetry exporter, or Supabase-secret prompt. Exec-form hooks invoke Node with absolute script arguments:

- Background **Stop**, **StopFailure**, and **SessionStart** hooks collect and upload available local assistant request counters.
- Background **SubagentStop** reads the supplied `agent_transcript_path`, collecting available requests across the run—not just `tool_response.usage`, which describes its final request.
- **SessionEnd** queues locally without network I/O, within its short shared shutdown budget.

Transcripts are asynchronous, and their internal format may change. Collection gives writes time to settle, retains one most-complete snapshot per API `message.id` within a scan, skips partial/missing-ID records, and avoids resending previously checkpointed requests. It is **best effort**, not a guaranteed provider billing feed. A later hook/import can recover late **new** entries; an already ingested request snapshot is immutable and isn't revised by re-importing it.

To preview/backfill an existing main or subagent transcript explicitly:

```sh
npm run claude:import -- --file /absolute/path/transcript.jsonl --session-id ROOT_SESSION_ID --dry-run
npm run claude:import -- --file /absolute/path/transcript.jsonl --session-id ROOT_SESSION_ID
```

Use the root session's ID for subagent imports. The importer reads the original locally and emits metrics only; it never copies or modifies the transcript. Long shutdown collection can require a longer per-hook timeout in your **settings**, up to Claude's documented 60-second shared SessionEnd cap; plugin timeout alone is not assumed to raise that cap. Manual import/flush is safer than relying on shutdown.

### Codex

Use a Codex release that supplies `PreModelRequest`, `PostModelRequest`, `turn_id`, and the documented TokenUsage fields. Fixtures target the release schema in **rust-v0.170.0**.

```sh
npm run --silent collector -- config --tool codex
```

Merge **all three** entries into `$CODEX_HOME/hooks.json` (normally `~/.codex/hooks.json`), or a trusted project's `.codex/hooks.json`. Open **`/hooks`** in Codex and review/trust the exact new definitions. An untrusted hook does not run. Don't use a trust-bypass flag.

- **PreModelRequest and PostModelRequest must stay synchronous** (`async: false`). They only write local state/metrics, never wait on HTTP.
- A separate **background Stop** hook uploads queued metrics after turns.
- Codex commands are quoted shell command strings, **not** Claude's exec-form `args` objects.
- The bundled alternative under `plugins/codex/.codex-plugin` uses `PLUGIN_ROOT`, not an assumed installation path.

The protocol lacks a request/attempt ID. The paired hooks allocate one durable local ID for each live attempt, scoped to account, session, turn and agent. Duplicate synchronous registrations share that live ID; the next real attempt gets a new ID, even when every token counter is identical. Failures/cancellations with usage count; outcomes without usage emit no fake summary.

**Do not feed historical Post hook payloads into this collector or make the pair asynchronous.** It supports paired, sequential live attempts per agent—not arbitrary replay or overlapping requests on the same session/turn/agent. Missing Pre data is rejected instead of inventing an identity. Codex transcripts are not read.

### Cursor: explicit v2 billing import

There is **no sessionEnd hook**. Cursor's transcript/legacy usage rows do not provide the supported stable request identity used here.

Export the documented Team Admin API response from:

```text
GET https://api.cursor.com/v2/teams/billing-items
```

An authorized Team administrator needs a Team API key with `read:*` or `admin:*`. The key is used only to obtain the export, **never supplied to this collector or uploaded to Supabase**. See the [official API documentation](https://cursor.com/docs/account/teams/admin-api#get-billing-items) for authentication and pagination.

Use RFC3339 `startTime`/`endTime`, at most 31 days per request; bounds are start-inclusive/end-exclusive. Filter `product=cursor`, `chargeCategory=usage`, `principalType=user`, and your encoded `principalId=user_…`. Get that exact ID from `/teams/members`; emails/numeric IDs are not interchangeable. Continue through `pagination.nextCursor` until `hasMore` is false and retain all returned `data` rows in a JSON object's `data` array. Treat the full export as private because it may contain names/emails.

```sh
npm run cursor:import -- --file billing-items.json --user-id user_YOUR_ID --dry-run
npm run cursor:import -- --file billing-items.json --user-id user_YOUR_ID
```

The importer independently filters to your user principal and excludes other users/principals, credit/adjustment items, non-Cursor products, non-token meters, and product-ambiguous data before 2026-07-19. Only stable `billingItemId` hashes and whitelisted metrics/models/timestamps leave the machine. Re-importing overlapping exports is deduplicated. Ordinary personal dashboard CSVs, filtered-usage events and guessed transcript fields are **not supported**.

Costs are decimal **USD**, not cents. Included/credit items may conceal costs as zero without a visibility marker; these are marked unavailable, not free. Reported costs remain model estimates, not reconciled invoices or prepaid top-up spending.

## 3. Verify and retry

```sh
npm run collector -- status
# Use your configured tool for a new request/turn, or import your Cursor export.
npm run collector -- flush
```

Refresh the website. Tokens should appear under the correct tool; choose the actual plans/tools covered in Settings. One shared plan is counted once per UTC month with relevant usage. Repeating `flush` must not raise totals again.

No collector can upload before its own browser sign-in. Website login alone is not collector login. A publishable key alone does not authorize ingestion.

Uploads that fail remain queued locally, with a 10,000-event limit. Hooks emit generic errors and allow the coding tool to continue. Check sign-in/refresh, hook trust, bundle paths, supported event fields, and network access. If SessionEnd was interrupted, run the explicit Claude import and `flush` before removing the clone. Never paste transcripts, tokens, or full credential files into an issue.

## Remove collectors

Remove only this repository's entries from your tool configuration, preserving other hooks/plugins. Disable a bundled plugin if you used that loading method. Stop Cursor imports. Then:

```sh
npm run collector -- logout
```

Logout revokes only the current collector session and removes its credentials. Private queues/checkpoints remain on your machine. Existing access JWTs expire normally. Website **Sign Out Everywhere** also revokes refresh for collector sessions; sign the collector back in if you want syncing to resume.
