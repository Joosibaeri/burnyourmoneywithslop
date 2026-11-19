# Hosted backend and GitHub OAuth

The existing production project is **`skvbxlhnjnksmzdnchlu`**, at https://skvbxlhnjnksmzdnchlu.supabase.co. Friends only use GitHub sign-in and collector login; they do not create Supabase projects.

## GitHub OAuth registration

**Already configured and verified on 2026-11-19:** GitHub authentication is enabled in the production project. Do not register another app or replace its secret just to start using the website. The following values are the reference setup for an administrator rebuilding the integration.

Open https://github.com/settings/applications/new and enter:

| Field | Exact value |
| --- | --- |
| Application name | `Burn Your Money With Slop` |
| Homepage URL | `https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz` |
| Authorization callback URL | `https://skvbxlhnjnksmzdnchlu.supabase.co/auth/v1/callback` |
| Enable Device Flow | **Off** |

Register the application and generate a client secret. In [Supabase Auth → Providers](https://supabase.com/dashboard/project/skvbxlhnjnksmzdnchlu/auth/providers), enable **GitHub**, enter its Client ID and Client Secret, and save.

**The OAuth secret belongs only in Supabase's provider configuration.** It is not a GitHub Actions `VITE_…` secret, browser setting, tool environment variable or collector credential. Do not commit it or send it in chat. GitHub OAuth app registration is a manual settings flow, not the previously suggested OAuth-registration API.

The GitHub callback above is Supabase's callback, not the website's `/auth/callback`. After GitHub/Supabase complete authentication, Supabase returns a PKCE code to the website or the collector.

## Hosted Auth settings

`deploy/production/supabase/config.toml` declares only these application settings:

- Site URL: `https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz`
- Website redirect: production `/auth/callback`
- Development redirects: `http://localhost:5173/auth/callback` and `http://127.0.0.1:5173/auth/callback`
- Collector redirect: `http://127.0.0.1:48173/auth/callback/*` (only the random-state path segment is wildcarded)
- Email/password and anonymous sign-in disabled

Only the collector callback uses HTTP, on a loopback-only listener. Supabase requests and production website authentication require HTTPS. The verifier stays in the collector's memory; refreshable session credentials are private on disk. Website and collector sessions are independent.

## Administrator deployment

The repository pins Supabase CLI **3.2.0**. Use the local binary after `npm ci`, and consult `--help` before adapting commands. V3 defaults database operations to local; hosted operations require an explicit `--remote` and mutations require `--yes`.

Use a scoped Supabase access token limited to this project and the required permissions when automating deployment. Never store it in this public repository or any `VITE_…` variable.

```sh
# Review the actual SQL and tests before applying the migration.
npm run typecheck
npm test -- --reporter=dot
deno check --frozen --config supabase/functions/ingest-usage/deno.json supabase/functions/ingest-usage/index.ts

# Preview database changes; skip unrelated local Vault configuration.
./node_modules/.bin/supabase db push --remote=skvbxlhnjnksmzdnchlu --dry-run --skip-vault --yes
./node_modules/.bin/supabase db push --remote=skvbxlhnjnksmzdnchlu --skip-vault --yes

# Push only the partial hosted Auth file, not a developer's whole local config.
./node_modules/.bin/supabase config diff --workdir deploy/production --remote=skvbxlhnjnksmzdnchlu
./node_modules/.bin/supabase config push --workdir deploy/production --remote=skvbxlhnjnksmzdnchlu --yes

# Deploy only this function, without Docker.
./node_modules/.bin/supabase functions deploy ingest-usage --remote=skvbxlhnjnksmzdnchlu --use-api --no-verify-jwt=false --yes
```

`--no-verify-jwt=false` explicitly keeps the platform JWT verifier enabled, including when a developer's local config disables it. The current platform supports both legacy and asymmetric signing keys. Its compatibility check can still admit API-key-only calls, so the pinned `withSupabase({ auth: 'user' })` wrapper also validates the caller's user session inside the function. Database operations retain that caller's RLS. An anon/publishable key alone cannot insert events. Keep both layers, never remove the user-authentication wrapper, and do not use a service-role ingestion client.

Do not run the initial SQL manually through the dashboard and then also apply it with the CLI; migration history must match. Do not rerun the initial schema destructively. The partial production config leaves undeclared hosted settings—including GitHub provider credentials—unchanged. Local user configuration in `supabase/config.toml` is separate and must be preserved.

## Frontend configuration

The Actions repository secrets are:

```dotenv
VITE_SUPABASE_URL=https://skvbxlhnjnksmzdnchlu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Get the publishable key from [API Keys](https://supabase.com/dashboard/project/skvbxlhnjnksmzdnchlu/settings/api-keys). `VITE_SUPABASE_ANON_KEY` remains a legacy fallback. These values are intentionally public in the browser and in `collector-config.json`; secret/service-role keys are rejected. Browser storage cannot override deployment-managed configuration.

Local development can use those public values in untracked `.env.local`. `localhost:5173` is a secure browser context for testing while a custom-domain certificate is pending. Production website sign-in must wait for valid TLS; see [CUSTOM_DOMAIN.md](CUSTOM_DOMAIN.md).

## Schema/access model

- `profiles`: public GitHub display identity, public-statistics toggle; users cannot rewrite another GitHub identity.
- `groups`/`group_members`: member-only reads; creation enrolls the owner; the invite RPC only enrolls its authenticated caller after explicit website confirmation.
- `user_subscriptions`: owner-only rows with retained historical periods; `set_subscription` edits the current UTC month.
- `custom_subscriptions`: owner-only named plans with stable logical IDs and retained price periods. `set_custom_subscription` adds/edits a plan for the current UTC month or stops future tracking. Each custom plan is counted once per used month across its covered tools; its name and raw records remain private.
- `usage_events`: owner-only metrics with mandatory opaque `event_id`; uniqueness is `(user_id, tool, event_id)`. Only `model_request` events are accepted—no cumulative/session summaries or arbitrary metadata.
- `monthly_usage_summary`: controlled aggregates, visible for public statistics, the owner, or consenting shared-group members. Raw events/invoices are never exposed through it. Real costs repeat per tool in this view; count once per **user/month**, then sum group members separately.
- Token category columns (`input_tokens`, `output_tokens`, `reasoning_tokens`, `cache_read_tokens`, `cache_write_tokens`) and `total_tokens_exact` are aggregate **decimal strings**, preserving integers through JSON beyond `2^53 - 1`. The original aggregate columns remain for older clients. **In** is the full request's **uncached** `input_tokens`, including prompts, system instructions, conversation context and tool answers—not a prompt-text-only count. **Cached** includes both cache types and stays separate from In. Stored output excludes separately reported reasoning; **Out** includes both. **Total = Cached + In + Out**, counting each disjoint category once.
- `get_global_ranking(p_month, p_metric, p_limit, p_offset)`: security-invoker, public-statistics-only ranking of users with recorded usage. A null month selects all time; otherwise months are UTC. All categories/spending/estimates are ranked numerically before paging (1–100 rows), with tied values sharing ranks. Private owner/shared-group aggregates are explicitly excluded even for signed-in callers.
- `usage-data`: private receipt bucket, with owner-folder insert/select/update/delete policies. Receipt replacement requires all three write/read policies. No receipt contents are published.

RLS and explicit grants are separate requirements. Do not “fix” permissions by granting arbitrary membership inserts, profile identity updates, or broad table access. Privileged helpers are in an unexposed private schema with explicit visibility/ownership checks and restricted execution; the public view is security-invoker.

The follow-up `lock_down_application_grants` migration explicitly revokes permissive inherited table privileges before granting the intended operations/columns. Applying only the initial schema is insufficient on a project with default `ALL` grants. Local tests simulate those hosted defaults and apply every migration in order. Project-wide default privileges and unrelated objects are left unchanged.

The `custom_subscriptions` migration also removes inherited grants on its new table and extends monthly totals without changing existing catalogue prices or authentication settings. Deploy migrations before publishing the UI that uses their RPCs.

Migration `20261119135309_token_breakdowns_and_global_ranking` appends exact counters to the existing security-invoker view and adds the public-only ranking RPC. It preserves raw-event/billing/receipt restrictions and all existing Auth configuration. For this migration, use `supabase db push --remote=skvbxlhnjnksmzdnchlu --skip-vault --yes`; do not push the local user-edited hosted configuration.

The interim `20261119143534_inclusive_model_input_tokens` migration is superseded by `20261119145203_separate_cached_and_uncached_input`, which keeps all clean model input in `input`, leaves both cache categories in `cached`, and removes the redundant `uncached_input` ranking metric. Both files are retained to match deployed migration history. View/RPC counter columns, stored events, spending, permissions and Auth configuration remain unchanged; no historical re-upload or token reclassification is required.

Ingestion accepts 1–500 events and at most 1 MiB. Supplied user IDs, prompt/code/snapshot/transcript fields and arbitrary metadata are discarded. Caller identity comes from authentication, never from a payload field.

## Verification

1. Inspect migrations and security/performance/health advisors after deployment.
2. With only the publishable key, anonymous ingestion must return **401**. Public profiles/allowed aggregates are readable, but raw events, subscriptions and receipts are not.
3. Once GitHub OAuth is configured, test website sign-in and direct `/auth/callback` loading. Confirm your GitHub avatar/name/username.
4. Run collector login, a new tool request and `flush`. Refresh the website; repeat `flush` and confirm totals don't increase.
5. Select a shared plan covering two tools and verify one monthly charge. Test an invoice override and historical month retention.
6. Create an invitation, sign in as another user, and explicitly confirm joining. Declining/loading an invite must not enroll anyone.
7. Disable public statistics and verify anonymous visitors cannot see them, while consenting group members still can. Raw invoices/receipts remain owner-only.
8. Check **In**, **Out**, **In + Out** and **Cached + In + Out** on the dashboard and in a group. In must use the complete uncached request counter, including any uncached system/tool context, without adding cache reads or writes. Cached must remain separate; the combined total counts each category once. There must be no extra Uncached input field. Visit `/ranking` anonymously, check month/all-time filters, and confirm private users are excluded even when signed in as a shared-group member.

Authenticated website/collector end-to-end verification requires the manually registered GitHub OAuth app. Passing local schema/collector tests is not a substitute for that final check.
