# Supabase Setup Guide

This guide walks you through setting up Supabase for **Burn Your Money With Slop** to enable real usage tracking, private groups, and persistent data.

## Prerequisites

- A GitHub account (for OAuth)
- A Supabase account (free tier works)

---

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose your organization
4. Enter project details:
   - **Name**: `burnyourmoneywithslop` (or your preferred name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
5. Click **Create new project**
6. Wait for provisioning (~2 minutes)

---

## 2. Get Your Project Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://abcdefghijklmnop.supabase.co`)
   - **anon/public key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

---

## 3. Enable GitHub OAuth

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Find **GitHub** and click to expand
3. Toggle **Enabled** ON
4. You'll need a GitHub OAuth App - create one:

### Create GitHub OAuth App

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `Burn Your Money With Slop`
   - **Homepage URL**: `https://burnyourmoneywithslop.joosibaeri.xyz` (or your custom domain)
   - **Authorization callback URL**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
     - Find your project ref in the Supabase URL: `https://<ref>.supabase.co`
   - **Enable Device Flow**: Unchecked
4. Click **Register application**
5. Copy **Client ID**
6. Click **Generate a new client secret** and copy it
7. Back in Supabase, paste **Client ID** and **Client Secret**
8. Click **Save**

---

## 4. Run Database Migrations

### Option A: Using Supabase CLI (Recommended)

```bash
# Install CLI
npm install -g supabase@latest

# Login
supabase login

# Link to your project
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push --remote --yes
```

### Option B: Using Supabase Dashboard

1. Go to **SQL Editor** in Supabase dashboard
2. Copy the contents of `supabase/migrations/20261117000001_initial_schema.sql`
3. Paste and run
4. Verify tables created in **Table Editor**

---

## 5. Configure Storage Bucket (for billing receipts)

1. Go to **Storage** in Supabase dashboard
2. Click **Create bucket**
3. Settings:
   - **Name**: `usage-data`
   - **Public bucket**: OFF (private)
4. Click **Create bucket**
5. Set up RLS policies (SQL Editor):

```sql
-- Allow authenticated users to upload their own files
create policy "Users can upload own files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'usage-data' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

-- Allow users to read their own files
create policy "Users can read own files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'usage-data' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);
```

---

## 6. Deploy Edge Function

```bash
# Deploy the ingest-usage function
supabase functions deploy ingest-usage --remote --yes
```

Or via Dashboard:
1. Go to **Edge Functions**
2. Click **Create a new function**
3. Name: `ingest-usage`
4. Paste the contents of `supabase/functions/ingest-usage/index.ts`
5. Add `import_map.json` content
6. Deploy

---

## 7. Configure Environment Variables

### For Local Development

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### For GitHub Pages Deployment

1. Go to your GitHub repo: `https://github.com/Joosibaeri/burnyourmoneywithslop`
2. **Settings** → **Secrets and variables** → **Actions**
3. Add these **Repository secrets**:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key

---

## 8. Verify Everything Works

1. Run locally: `npm run dev`
2. Sign in with GitHub
3. Check **Settings** → **Supabase** tab - should show "Connected"
4. Install a plugin (see [PLUGIN_INSTALL.md](./PLUGIN_INSTALL.md))
5. Use an AI tool - check Supabase **Table Editor** → `usage_events` for data

---

## Troubleshooting

### "Connection failed" in Settings

- Verify Project URL and Anon Key are correct
- Check Supabase project is not paused
- Ensure GitHub OAuth is enabled in Supabase

### No data in usage_events

- Check Edge Function logs: `supabase functions logs ingest-usage`
- Verify plugin is installed and running
- Check browser console for errors

### RLS Policy Errors

Run in SQL Editor:
```sql
-- Check current policies
select * from pg_policies where schemaname = 'public';

-- Grant explicit access (required in Supabase v3+)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.user_subscriptions to authenticated;
grant select, insert on public.usage_events to authenticated;
grant select on public.monthly_usage_summary to authenticated;
```

---

## Security Notes

- Never commit `.env.local` or share your `service_role` key
- The `anon` key is safe to use in frontend code
- RLS policies ensure users only see their own data
- Groups are private - only members can view group data
- Subscription data is per-user and never shared

---

## Next Steps

- [Custom Domain Setup](./CUSTOM_DOMAIN.md)
- [Plugin Installation Guide](./PLUGIN_INSTALL.md)
- [API Reference](./API_REFERENCE.md)