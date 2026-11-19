# Burn Your Money With Slop

Compare AI coding tokens and recorded subscription spending with friends. Public GitHub identities and statistics, consent-based private groups, and metrics-only collectors.

[![Deploy](https://github.com/Joosibaeri/burnyourmoneywithslop/actions/workflows/deploy.yml/badge.svg)](https://github.com/Joosibaeri/burnyourmoneywithslop/actions/workflows/deploy.yml)

**Website:** https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz

## Start tracking

1. Sign in on the website with GitHub.
2. In **Settings → Subscriptions**, select plans you actually pay for. Enter your monthly invoice amount/share when the catalogue price isn't right.
   For another provider or plan, choose **Add custom subscription** and enter its name, monthly USD price and covered tools. You can edit it or stop tracking without erasing older months.
3. Install collectors on each machine with Node.js **22 or newer**:

```sh
git clone https://github.com/Joosibaeri/burnyourmoneywithslop.git
cd burnyourmoneywithslop
npm ci
npm run collectors:build
npm run collector -- login
npm run collector -- install --tool all
```

Collector login opens GitHub in your browser and saves a separate refreshable Supabase session privately on your machine. Friends don't need their own Supabase project, privileged key, or OAuth secret.

The installer backs up existing global configuration and merges only this collector's settings, preserving comments and other plugins/hooks. Installed collectors reactivate when you start their tools, including after reboot. Review changed Codex hooks in **`/hooks`** once; trust persists afterward.

On Linux with systemd, enable automatic pending-metric uploads after login/reboot:

```sh
npm run collector -- autostart enable
npm run collector -- autostart status
```

This user timer retries queued uploads every minute without starting coding tools or creating AI requests. It starts when you log in after reboot, not before login, and retries after network outages. Empty queues do not renew an idle session. Use `autostart disable` to turn it off. A combined install is also available: `npm run collector -- install --tool all --autostart`.

For manual setup instead, generate a tool-specific snippet and **merge** it into your existing configuration:

```sh
npm run --silent collector -- config --tool opencode
npm run --silent collector -- config --tool claude-code
npm run --silent collector -- config --tool codex
```

See [the installation guide](docs/PLUGIN_INSTALL.md) for configuration locations, hook trust, supported versions, Cursor imports, and verification. These packages are built from this repository; they are **not published npm packages**.

## Supported collection

| Tool | Source | Important limits |
| --- | --- | --- |
| OpenCode V2 | Ordered `session.step.started`, `.ended`, `.failed` events | Live steps only; exact dispatched model retained; cumulative session totals ignored |
| Claude Code | Local assistant/subagent transcript counters via Stop, StopFailure, SubagentStop, SessionStart and SessionEnd | Best-effort transcript snapshots can lag; explicit local imports recover late entries |
| Codex | Paired synchronous PreModelRequest/PostModelRequest hooks, background Stop upload | One durable identity per live attempt, including retries and subagents; not arbitrary historical hook replay |
| Cursor | Documented `/v2/teams/billing-items` JSON exports | Explicit importing-user filter; requires a Team API export; ordinary dashboard CSVs and transcripts aren't guessed |

Retries use stable opaque event IDs and never add usage twice. Identical genuine requests remain separate. Input/cache and output/reasoning counters are disjoint; reasoning already included in a provider's output counter isn't counted again.

```sh
npm run collector -- status
npm run collector -- status --refresh
npm run collector -- flush
npm run collector -- logout
```

Failed uploads stay in a private, account-scoped local queue. Logging into another account does not upload the previous account's queue. Logout revokes the collector session, not the website's session, and leaves pending metrics private on disk.

The Session panel's expiry is the short-lived **Supabase access token**, not the GitHub OAuth app secret. The website persists its session and refreshes it while active/on return; collectors independently refresh their private session before uploading. If a refresh session is revoked, expires under configured inactivity/time limits, or credentials are removed, sign in again. Pending collector metrics are retained. `status --refresh` verifies renewal without displaying tokens.

## Spending model

- **Real spending** is your recorded subscription/invoice price, not an inferred API bill. You select the paid plans and may override their prices, including tax, discounts, additional charges, or your share of a team invoice.
- A subscription shared across tools counts **once per user per UTC calendar month with relevant recorded usage**. Group totals sum each member independently.
- Custom plans have their own stable identities and follow the same rules. Two distinct custom subscriptions may share a name; each counts separately. Avoid tracking the same invoice through both a catalogue entry and a custom plan.
- Selections and price edits apply to the **current UTC calendar month**. Older subscription records are retained. Stopping tracking does not cancel a provider subscription.
- Catalogue prices are monthly USD prices; use a monthly-equivalent amount for annual plans. For shared team invoices, record your share—not the full invoice on every member's account.
- **Model estimates** remain separate. OpenCode/Cursor reported model costs and Claude/Codex standard token-price estimates are not actual invoice charges. Unknown models and hidden Cursor costs are marked unavailable, and the UI labels estimates as partial.
- Speed/residency premiums, discounts, tools, prepaid top-ups and API charges are not automatically reconciled. Add actual billed amounts through your invoice-price override if appropriate. This is a self-reported comparison dashboard, not a financial statement.

The catalogue includes Claude Pro/Max, ChatGPT allowance tiers, current and legacy Cursor plans, and OpenCode's free client, Go, Go Plus and Go Teams. A free client does **not** mean its paid API usage is free. Prices were checked on **2026-11-18**; provider limits and prices can change.

## Token filters and rankings

- The dashboard shows exact, unabridged token counts. Its **Token metric** filter updates the selected total, monthly token history, tool breakdown and global-ranking preview.
- **In** = all **uncached** input sent to the model: your prompts, system instructions, conversation context and tool answers. It is not limited to the text you type. **Cached** stays separate and includes both cache reads and writes; there is no extra Uncached input field.
- **Out** = output including separately reported reasoning. **In + Out** excludes cache. **Cached + In + Out** includes every category exactly once. Cache-read, cache-write and reasoning counts are also available separately as breakdowns, not extra totals.
- Counters come from full request usage, not from measuring prompt/tool text. Providers can report system/tool context as cached; those tokens stay in Cached regardless of their source. Stored counters and ranking definitions remain disjoint: `input_tokens` excludes both cache types and `output_tokens` excludes separately reported reasoning. No contents are read or re-uploaded to reconstruct missing categories.
- Counts reflect recorded provider counters, not reconstructed missing usage. Aggregate counters travel as decimal strings and are summed as integers, so large totals remain exact beyond JavaScript's safe-number limit.
- Group leaderboards and monthly trends can compare each token category, real spending or model estimates. Choose a UTC month or **All time**; tied values share a rank.
- [Global Ranking](https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz/ranking) is public without sign-in and includes only users with public statistics and recorded usage in the selected period. Private statistics never appear there, including for their owner or shared-group friends. Ranking happens before pagination.

## Privacy and groups

- Uploaded usage contains only token counters, an estimated/reported model cost and its source, model identifier, timestamp, and opaque hashed event/session IDs. **No prompts, code, file contents, transcripts, repository paths or GitHub provider tokens are uploaded.** Claude reads existing transcripts locally; it does not copy or modify them.
- GitHub name, username and avatar are public. Aggregate statistics are public **by default**; disable public statistics in Settings to share them only with yourself and groups you joined.
- Raw events and subscription records are owner-only. Receipt storage is private and owner-scoped; receipt contents are never part of public statistics.
- Custom subscription names, tool coverage and price-period records are owner-only too; only their spending contribution is included in allowed aggregates.
- Creating a group enrolls its creator only. Friends must sign in and explicitly confirm joining via an invitation link. Owners cannot enroll arbitrary users or rewrite membership identities.
- Keep invitation links private. Anyone who has one can choose to join; no email/GitHub notification is sent automatically.
- Publishable/legacy anon keys are public client configuration. **Secret/service-role keys and GitHub OAuth secrets must never be put in frontend or collector configuration.**

## Development

```sh
npm ci
npm run dev                 # http://localhost:5173
npm run typecheck           # website, Vite config and every collector
npm run lint                # website lint checks
npm test -- --reporter=dot  # collector fixtures, PKCE, billing and Postgres/RLS tests
npm run build              # website + collector bundles
npm run preview
deno check --frozen --config supabase/functions/ingest-usage/deno.json supabase/functions/ingest-usage/index.ts
```

Without frontend configuration, local development uses clearly labelled sample data. To use the hosted project, put its **public** configuration in untracked `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://skvbxlhnjnksmzdnchlu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

`VITE_SUPABASE_ANON_KEY` is supported as a legacy fallback. Deployment-managed configuration cannot be overridden by browser storage. The Vite build publishes `collector-config.json` containing public configuration only, plus `/auth/callback/index.html`, `/ranking/index.html` and a SPA `404.html`.

Database tests execute the actual migration in local Postgres/WASM (PGlite), including RLS, consent, deduplication and monthly billing. Docker-backed Supabase development is optional and requires access to Docker.

### Dependency audit

As of 2026-11-18, `npm audit --omit=dev` is clean. The full development tree still reports 24 moderate advisories inherited through the pinned OpenCode SDK/npm toolchain (not the deployed browser bundle). Safe audit remediation was previewed; no forced downgrades or incompatible glob/minimatch overrides were applied. Recheck upstream fixes before upgrading.

## Deployment and remaining administration

Pushes to `master` run tests, build, and deploy a Pages artifact through **GitHub Actions**. This is **not** a `gh-pages` branch deployment. Only the website is deployed by that workflow; Supabase migrations and ingestion are deployed separately with the pinned CLI.

- [Supabase and exact GitHub OAuth setup](docs/SUPABASE_SETUP.md)
- [Custom domain, DNS and HTTPS](docs/CUSTOM_DOMAIN.md)
- [Collector installation and imports](docs/PLUGIN_INSTALL.md)
- [Deployment checks and remaining manual steps](docs/DEPLOYMENT_STATUS.md)

GitHub OAuth credentials must be registered with GitHub and saved in **Supabase Auth → Providers → GitHub**. A valid custom-domain certificate is required before production website sign-in. Never bypass TLS verification to make login work.

## Layout

```text
src/                          React website, billing helpers and UI tests
plugins/shared/               Private credentials, locking, metrics and transport
plugins/collector/            Browser PKCE login and configuration CLI
plugins/{opencode,claude-code,codex,cursor}/
supabase/migrations/          Schema, RLS, controlled aggregates and billing history
supabase/functions/ingest-usage/  Caller-authenticated ingestion
deploy/production/supabase/   Partial hosted Auth configuration
docs/                         Setup and verification guides
```

MIT — see [LICENSE](LICENSE). Repository and website remain public.
