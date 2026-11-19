# Deployment verification — 2026-11-19

## Production readiness

- The custom domain now has a valid certificate. HTTPS returns **200** with normal certificate verification, **Enforce HTTPS** is enabled, and HTTP redirects to HTTPS with **301**. No DNS reset or TLS bypass is needed.
- Supabase's public Auth settings now report **GitHub enabled** and email/anonymous sign-in disabled. The OAuth app credential setup is no longer a blocker; credentials remain in Supabase, not in this repository.
- All four application migrations are deployed, including custom subscriptions and exact token aggregates/global ranking. `ingest-usage` is active with platform JWT verification enabled. Health advisors are clear; the existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains, with password sign-in disabled.
- The collector session has been renewed through browser PKCE sign-in. `collector status --refresh` succeeds; there is no remaining collector-login blocker. Website and collector sessions remain separate.
- Live caller-authenticated checks pass for identity, the provisioned GitHub profile, dashboard aggregates, catalogue/custom subscription reads, and group/member/profile joins. Anonymous raw usage, billing and group reads remain denied. These read checks did not change billing, group membership or visibility, and submitted no fake metrics.
- Live browser smoke checks pass for protected login, the public-statistics notice, direct callback loading, the public GitHub profile, the mobile menu, HTTPS PKCE initiation and a safe invitation return path. Authorization was intercepted before contacting the OAuth endpoint; no browser sign-in or group join was simulated.
- The public repository's newer mobile-menu changes are retained. Deployment still uses `master` and the GitHub Actions Pages workflow, not a `gh-pages` branch.

## Exact token comparisons and global ranking

- Migration `20261119135309_token_breakdowns_and_global_ranking` is deployed. The monthly security-invoker view retains its original columns and adds exact decimal-string input/output/reasoning/cache-read/cache-write counters. No raw-event, invoice, receipt, membership or Auth settings were exposed or changed.
- The dashboard removes the **Active Tools** and **Groups** tiles and shows every token count without abbreviating/rounding it. **Token metric** updates the selected total, monthly token chart/table, tool table and public-ranking preview.
- **In** excludes cache; **Out** includes separately reported reasoning. **In + Out** excludes cache; **Cached + In + Out** counts every disjoint category once. Cached/read/write/reasoning filters and exact counts are available separately too.
- Group leaderboards and trends compare each category, recorded spending and model estimates for a selected UTC month or all time. Every member participates in the chart; ties share a rank. Recorded invoice totals are summed in cents so equivalent costs do not get different ranks from floating-point rounding.
- `/ranking` is public without sign-in. The invoker-scoped RPC explicitly excludes private statistics even for their owner/shared-group friends, ranks the complete public population before pagination and returns exact category strings. The build includes `/ranking/index.html` for direct Pages loading.
- **268 tests pass**, including independent metric sorting, exact counters above `2^53 - 1`, tie/pagination behavior, shared billing, private-user exclusion and dashboard/group/ranking UI controls. Typechecks, lint, production build, frozen Deno check and production dependency audit pass.
- Native hosted counter reconciliation and **20 anonymous ranking checks** (ten metrics × month/all time) pass, including per-user/month spending deduplication and raw-event/billing/group denials. No synthetic usage or billing was submitted.
- Desktop/mobile browser checks pass for both labelled demo data and the production build against live Supabase: public ranking, exact authenticated dashboard filters, consenting-group comparisons, no runtime errors and no page overflow. The authenticated check used an existing access token in a closed, isolated read-only context; it did not copy the collector refresh token, complete fresh OAuth or modify billing/visibility/membership.
- Both protected local Supabase files remain byte-for-byte unchanged and excluded from this update. The schema push used the explicit hosted project and `--skip-vault`; no hosted config push was performed.

## Collector restart/reboot and session renewal

- Persistent `collector install --tool all` setup now backs up and merges global OpenCode/Claude/Codex configuration, retaining comments, symlinks and other settings. Codex includes startup flushing and still requires one-time hook review after changes.
- Manually generated OpenCode snippets now retain the selected private credential directory too, matching the installer. Relative credential-directory arguments are rejected for all live collectors.
- Linux `collector autostart enable` installs a per-user systemd timer. It is enabled and active on the development machine, with successful queued-upload execution and original OpenCode settings verified intact. It resumes after user login following reboot, without launching coding tools or making model requests.
- **167 tests pass** with `npm test -- --reporter=dot --maxWorkers=2`, including idempotent installation, safe backups, scheduler escaping, explicit private-directory snippets, expired-access-token renewal, failed-refresh queue retention, and refreshed website expiry display. Website/collector typechecks, lint, the production build and the frozen Deno check also pass. Collector builds include a bundled CLI runtime check.
- An initial unbounded local test run encountered two Node **26.12.0** worker segfaults in V8's garbage collector, with no OOM evidence. The bounded-worker run passed without errors; the underlying runtime trigger is not established. No system/runtime settings were changed. Deployment CI uses Node 22.
- The installed OpenCode/Claude/Codex definitions point to the built clone and private credential directory; Codex Pre/Post hooks are synchronous. Credential permissions are **0700/0600**. The timer's latest execution succeeds, and a manual `collector flush` finds no pending metrics. Access tokens renew automatically; revoked/time-limited refresh sessions still require reauthentication.
- Cursor remains an explicit documented billing-export import. This change automates retrying pending metrics, not unsupported live Cursor collection.

## Custom-subscriptions update

- Migration `20261118204804_custom_subscriptions` adds private named plans and extends monthly spending without changing catalogue prices or authentication configuration.
- **147 tests pass**, including add/edit/stop UI flows, multiple custom plans, per-month/per-tool deduplication, ownership and historical-price retention. The Supabase settings tab remains removed.
- Native hosted Postgres checks also pass for creation, repeated edits, once-per-month counting, stopping tracking and cross-user denial. The verification transaction was rolled back; no test custom plans or usage were left behind, and existing catalogue rows were retained.
- Anonymous access to custom records and their write RPC is denied. Health advisors are clear. A pre-existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains; this feature does not alter your Auth settings.

## Initial backend deployment snapshot

- Project: `skvbxlhnjnksmzdnchlu`.
- Both migrations applied: `20261117000001_initial_schema` and `20261118184113_lock_down_application_grants`.
- `ingest-usage` is active with **platform JWT verification enabled** and an additional caller-scoped `auth: 'user'` wrapper. A publishable key alone and an invalid JWT both return **401**; OPTIONS succeeds with CORS headers.
- Anonymous profiles/controlled aggregates return 200. Raw usage, subscriptions, groups and membership reads return **401**.
- Hosted permission checks confirm: identity-column edits, membership reassignment/insertion, raw-event truncation and caller-supplied server timestamps are denied. Profile visibility and owner-scoped member-role edits retain their intended column grants.
- The receipt bucket is private. All application tables have RLS. At this initial snapshot there were no real users/events, and no test data was left in production.
- At this initial snapshot, hosted Auth changed only email sign-in and collector redirects; nine undeclared remote properties were retained. GitHub was still disabled then; it is now enabled as noted above.
- Security and health advisors are clear. Performance advisors contain only five [unused-index informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), expected for a new empty application. Retain the RLS/query indexes until real usage can be evaluated.

## Earlier baseline verification

- **113 tests pass**, including actual Postgres/WASM migrations with permissive hosted-default grants, column permissions, RLS, consent, billing history, stable event identities, private queues, token refresh, PKCE and live onboarding.
- Website/collector typechecks, website lint, collector bundles, production Vite build and frozen Deno check pass.
- Production `collector-config.json`, callback index, SPA fallback and CNAME assets are verified. Only public Supabase configuration is included.
- A headless production-build smoke check passes for protected login, the public-statistics notice, direct callback loading, the public profile route and collector configuration, with no browser runtime errors. It does not pretend OAuth has been completed.
- Production dependency audit is clean. The development tree has 24 upstream moderate advisories; no forced dependency downgrades were applied.
- Local user work in `supabase/config.toml` and `supabase/.gitignore` is preserved, not included in the deployment commit.

## Remaining user verification

### 1. Review Codex hooks once

Open **`/hooks`** in Codex and review/trust the newly installed definitions. Keep the paired PreModelRequest/PostModelRequest hooks synchronous. Trust and configuration persist across restarts; do not use a trust-bypass flag.

### 2. Confirm the website with your own billing choices

Sign in at [the production website](https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz) using GitHub. In **Settings → Subscriptions**, select the plans you actually pay for and enter your monthly invoice amount or your share of a team invoice. Use a custom subscription for an unlisted plan; do not record the same invoice twice.

Confirm your GitHub avatar/name/username, dashboard and group creation or existing group. Try each token filter, compare friends by the same category/UTC month, and check **Global Ranking**. Disabling public statistics removes you from that ranking but retains consenting-group comparisons. A shared subscription counts once per UTC month containing relevant recorded usage, so a selected plan without matching usage does not create spending. Share invitations privately; friends must sign in and explicitly click **Join Group**. Opening an invitation or signing in alone does not enroll anyone.

### 3. Confirm one new request/import and retry deduplication

Make one new request in a configured tool, or import your supported Cursor Team v2 billing export. Run from your clone:

```sh
npm run collector -- status --refresh
npm run collector -- flush
# Refresh the website and note its token totals, then retry:
npm run collector -- flush
```

The request's metrics should appear under the correct tool. Retrying the same uploaded events must not increase totals; additional genuine requests can. The timer may upload the request before your manual flush, so `Uploaded 0 metrics` alone is not a failure—check the dashboard. The already-enabled timer resumes queued uploads after login/reboot; there is no need to reinstall it or sign the collector in again while refresh succeeds.

OAuth registration, frontend secrets, hosted Auth redirects, DNS and TLS are already configured. Their reference instructions remain in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and [CUSTOM_DOMAIN.md](CUSTOM_DOMAIN.md); no infrastructure setup is currently blocked. Local user work in `supabase/config.toml` and `supabase/.gitignore` remains untouched and excluded from the deployment commit.

## Friends' setup afterward

Sign in, choose actual subscription/invoice prices, and follow [collector installation](PLUGIN_INSTALL.md). Configure a collector on each machine, then use a new request/import and `flush`. Cursor requires a documented Team v2 billing export, not an ordinary personal CSV or guessed session hook. Claude transcript collection is best effort; Codex requires the paired synchronous live hooks.
