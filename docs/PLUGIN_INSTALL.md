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
npm run collector -- install --tool all
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

The `install` command backs up and updates persistent **global** tool configuration. It preserves JSON/JSONC comments, unrelated plugins/hooks and symlinks, and is safe to repeat. Install all supported live collectors with `--tool all`, or select one of `opencode`, `claude-code`, `codex`. It does not create undocumented Cursor hooks.

Once installed, hooks/plugins are automatically loaded whenever you start their tools, including after reboot. OpenCode watches changes automatically; Claude may require a fresh session. Codex requires one-time review/trust after installation changes its definitions. No coding tool is launched at computer startup.

For manual installation instead, the following generated snippets remain available:

Generated snippets print JSON with your clone's absolute paths. **Merge the relevant entries into your existing configuration**, preserving other plugins/hooks. Do not redirect these commands onto an existing settings file and overwrite it. These packages are not published on npm.

All snippets carry the selected private credential directory, including OpenCode's plugin options. Use `--config-dir /absolute/private/path` when generating a snippet for a non-default directory.

### OpenCode V2

```sh
npm run --silent collector -- config --tool opencode
```

Merge the `plugins` entry into `~/.config/opencode/opencode.json` or `.jsonc`, or the corresponding `$XDG_CONFIG_HOME` location. Keep the published `$schema`.

The local package is `plugins/opencode`, with its default export at `dist/index.js`. The root install supplies the pinned `@opencode/plugin` **2.3.2** SDK. Configure the **directory/package**, not a copied manifest without its bundle.

Configuration reloads automatically; `/reload` forces a reload. Do not restart the shared OpenCode service just to apply a plugin change.

The plugin consumes one ordered live stream of started/ended/failed steps and compactions. Primary requests correlate `assistantMessageID` with the exact dispatched model. Compactions use the saved completed/failed compaction message's identity and reported counters/cost. It never uploads cumulative `session.usage.updated` totals. If a primary start wasn't observed, the model remains unknown rather than being guessed from a later session selection. Usage-bearing failed requests are included.

Input comes from the full model request's reported usage, including tool-driven continuations—not the length of the user's prompt. **In** includes all input classified as uncached, including system instructions and tool answers. Context classified as a cache read or write stays in **Cached**, regardless of its source. The collector never reads prompt/system/tool contents to estimate or relabel counts. A tool answer contributes when it is sent in a model request, not merely because a tool ran.

#### Import existing OpenCode history

Installing the live plugin does **not** import earlier sessions. If the dashboard is much smaller than your local totals, use the explicit saved-request importer. After updating an older collector, rebuild it and use **`/reload`** in OpenCode before importing so the live collector uses the same message identities.

```sh
npm run collectors:build
# In OpenCode: /reload
npm run opencode:import -- --dry-run
npm run opencode:import -- --since 2026-11-01
# Repeating the same import must not add those requests again.
npm run opencode:import -- --since 2026-11-01
```

Keep OpenCode V2 running. The importer discovers its existing local service and authentication using the pinned native client; it does not start/restart the service or change provider credentials. Dry run makes **no Supabase requests**, writes nothing, and prints exact saved In/Out/Cached totals, including requests that may already be uploaded.

Without `--since`, all available saved history is considered. Optional `--session-id SESSION_ID` selects one session; `--since`/`--until` accept UTC dates or timestamps with an explicit timezone. Bounds are start-inclusive/end-exclusive. `--config-dir /absolute/private/path` selects the collector account. Use a bounded date range and flush between ranges if a large backfill exceeds the private queue limit.

The real import uses the signed-in collector's **owner-only** usage reads to reconcile existing uploads and pending metrics, then sends only missing requests through authenticated ingestion. New live/imported completed primary and compaction requests share hashes of their immutable native message IDs. Paid failed primary attempts retain separate boundary identities because a retry may reuse the assistant ID and replace its projected counters. Older boundary-ID uploads are reconciled only when the hashed session, exact timestamp and every token category match uniquely; ambiguous/conflicting overlap is rejected instead of guessing. Existing records are not overwritten or discarded when they are absent from current local history. Retries, overlapping import windows and copied fork history must not inflate usage.

Only whitelisted reported counters, costs, models, timestamps and opaque identities are queued/uploaded. Prompt text, tool contents, native replies, compaction summaries and paths are not used to calculate counts and are not copied/uploaded. Running/partial messages are skipped. OpenCode **2.3.2** does not expose internal `session.usage.recorded` events through its public live stream; titles/transient generations without saved per-request records remain unavailable. Do not derive synthetic gap events from cumulative session totals.

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

Merge all entries into `$CODEX_HOME/hooks.json` (normally `~/.codex/hooks.json`), or a trusted project's `.codex/hooks.json`. Open **`/hooks`** in Codex and review/trust the exact new definitions. An untrusted hook does not run. Don't use a trust-bypass flag.

- **PreModelRequest and PostModelRequest must stay synchronous** (`async: false`). They only write local state/metrics, never wait on HTTP.
- Separate **background SessionStart and Stop** hooks upload queued metrics on startup and after turns.
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

Costs are decimal **USD**, not cents. Included/credit items may conceal costs as zero without a visibility marker; these are marked unavailable, not free. Reported costs are per-request usage costs, not reconciled invoices or prepaid top-up spending.

## 3. Automatic uploads after login/reboot (Linux)

After collector login and persistent tool installation:

```sh
npm run collector -- autostart enable
npm run collector -- autostart status
npm run collector -- status --refresh
```

`install --tool all --autostart` combines installation and scheduler enablement. `login --autostart` can enable it after a new browser sign-in. This requires Linux's systemd **user** manager; no root privileges, machine-wide service, lingering, coding-tool launch or extra model request is created.

The matching `burnyourmoneywithslop-flush.service`/`.timer` files live under `~/.config/systemd/user` (or `$XDG_CONFIG_HOME/systemd/user`). The enabled timer starts when your user logs in after reboot. It retries pending uploads every minute after the previous attempt finishes; it also recovers after network outages/suspend. Each run is limited to five batches and uses the same private account-scoped queue and locked token refresh as tool hooks.

The credential directory is supplied explicitly in installed hooks and startup units, so it does not depend on your login shell exporting `BYM_CONFIG_DIR`. Keep the clone and Node binary at stable paths; re-run installation after moving/upgrading them. Existing same-named unmanaged units are not overwritten.

Only queued metrics trigger token renewal; an empty timer does not keep an unused session alive indefinitely. An expired access token is refreshed on the next upload. If the refresh token/session is revoked or expires under project policies, metrics remain queued until you run `collector login` again. Website and collector sessions are separate; the website uses persisted automatic refresh while visible/on return.

To turn off the scheduler, run `npm run collector -- autostart disable`. This does not remove your tool hooks, credentials or queued metrics. On macOS/Windows the saved tool hooks still reactivate after tool restart, but this Linux scheduler is not installed; use tool-start/turn uploads or manual `flush` there. Cursor still requires explicit supported billing exports.

## 4. Verify and retry

```sh
npm run collector -- status
npm run collector -- status --refresh
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
