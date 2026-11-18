# Deployment verification — 2026-11-18

## Backend deployed

- Project: `skvbxlhnjnksmzdnchlu`.
- Both migrations applied: `20261117000001_initial_schema` and `20261118184113_lock_down_application_grants`.
- `ingest-usage` is active with **platform JWT verification enabled** and an additional caller-scoped `auth: 'user'` wrapper. A publishable key alone and an invalid JWT both return **401**; OPTIONS succeeds with CORS headers.
- Anonymous profiles/controlled aggregates return 200. Raw usage, subscriptions, groups and membership reads return **401**.
- Hosted permission checks confirm: identity-column edits, membership reassignment/insertion, raw-event truncation and caller-supplied server timestamps are denied. Profile visibility and owner-scoped member-role edits retain their intended column grants.
- The receipt bucket is private. All application tables have RLS. There are no real users/events yet and no test data was left in production.
- Hosted Auth changed only email sign-in and collector redirects; nine undeclared remote properties were retained. GitHub remains disabled until you supply its OAuth app credentials.
- Security and health advisors are clear. Performance advisors contain only five [unused-index informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), expected for a new empty application. Retain the RLS/query indexes until real usage can be evaluated.

## Local verification

- **113 tests pass**, including actual Postgres/WASM migrations with permissive hosted-default grants, column permissions, RLS, consent, billing history, stable event identities, private queues, token refresh, PKCE and live onboarding.
- Website/collector typechecks, website lint, collector bundles, production Vite build and frozen Deno check pass.
- Production `collector-config.json`, callback index, SPA fallback and CNAME assets are verified. Only public Supabase configuration is included.
- A headless production-build smoke check passes for protected login, the public-statistics notice, direct callback loading, the public profile route and collector configuration, with no browser runtime errors. It does not pretend OAuth has been completed.
- Production dependency audit is clean. The development tree has 24 upstream moderate advisories; no forced dependency downgrades were applied.
- Local user work in `supabase/config.toml` and `supabase/.gitignore` is preserved, not included in the deployment commit.

## Required manual setup

### 1. Register and enable GitHub OAuth

At https://github.com/settings/applications/new:

- Name: `Burn Your Money With Slop`
- Homepage: `https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz`
- Callback: `https://skvbxlhnjnksmzdnchlu.supabase.co/auth/v1/callback`
- Device Flow: **off**

Save the Client ID/Secret only in [Supabase Auth → Providers → GitHub](https://supabase.com/dashboard/project/skvbxlhnjnksmzdnchlu/auth/providers), enable GitHub, and save. Never put the OAuth secret in frontend configuration or chat.

### 2. Complete Pages HTTPS provisioning

The CNAME resolves correctly to `joosibaeri.github.io`; no restrictive apex CAA record was found. However, the custom hostname still has a certificate mismatch. GitHub's HTTPS-enforcement API reports **“The certificate does not exist yet”**.

Open [repository Settings → Pages](https://github.com/Joosibaeri/burnyourmoneywithslop/settings/pages). Keep **GitHub Actions** as the source. If the successful DNS check is still followed by a missing certificate, remove and re-enter the same custom domain to restart certificate provisioning, then enable **Enforce HTTPS** once available. See [the domain guide](CUSTOM_DOMAIN.md).

Do not bypass TLS verification. Authenticated website/collector end-to-end verification remains pending until OAuth is configured; production website verification also needs valid TLS.

## Friends' setup afterward

Sign in, choose actual subscription/invoice prices, and follow [collector installation](PLUGIN_INSTALL.md). Configure a collector on each machine, then use a new request/import and `flush`. Cursor requires a documented Team v2 billing export, not an ordinary personal CSV or guessed session hook. Claude transcript collection is best effort; Codex requires the paired synchronous live hooks.
