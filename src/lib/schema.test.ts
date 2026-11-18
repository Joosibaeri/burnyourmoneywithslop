// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SUBSCRIPTION_CATALOG } from './utils'

const alice = '00000000-0000-0000-0000-000000000001'
const bob = '00000000-0000-0000-0000-000000000002'
const stranger = '00000000-0000-0000-0000-000000000003'
const groupId = '10000000-0000-0000-0000-000000000001'
const bobCustomId = '20000000-0000-0000-0000-000000000002'
let db: PGlite

// Run the actual migration against local Postgres/WASM, with minimal Supabase schemas.
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    -- Match permissive hosted defaults so explicit GRANTs cannot mask a failure
    -- to revoke inherited privileges (especially UPDATE/TRUNCATE/INSERT).
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1) - 1];
    $$;
    grant usage on schema storage to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `)
  const migrations = new URL('../../supabase/migrations/', import.meta.url)
  for (const file of (await readdir(migrations)).filter(name => /^\d+_.*\.sql$/.test(name)).sort()) {
    await db.exec(await readFile(new URL(file, migrations), 'utf8'))
  }
  await db.exec(`
    insert into auth.users values
      ('${alice}', '{"user_name":"alice","full_name":"Alice Example"}'),
      ('${bob}', '{"preferred_username":"bob"}'),
      ('${stranger}', '{"login":"stranger"}');
    update public.profiles set stats_public = false where id = '${bob}';
    insert into public.groups (id, name, owner_id, invite_code)
      values ('${groupId}', 'Friends', '${alice}', 'test-invite');
    insert into public.group_members (group_id, user_id) values ('${groupId}', '${bob}');
    insert into public.user_subscriptions (user_id, catalog, tier, custom_price_usd, tools, started_at) values
      ('${alice}', 'chatgpt', 'plus', 25, '{codex,opencode}', '2026-11-01Z'),
      ('${alice}', 'cursor', 'premium', null, '{cursor}', '2026-11-01Z');
    insert into public.user_subscriptions (user_id, catalog, tier, tools, active, started_at, ended_at) values
      ('${alice}', 'claude-pro', 'pro', '{claude-code}', false, '2026-10-01Z', '2026-11-01Z');
    insert into public.custom_subscriptions (subscription_id,user_id,name,monthly_price_usd,tools,started_at)
      values ('${bobCustomId}','${bob}','Private custom plan',9,'{cursor}','2026-11-01Z');
    insert into public.usage_events (user_id, tool, event_type, event_id, input_tokens, output_tokens, session_id, occurred_at) values
      ('${alice}', 'codex', 'model_request', repeat('a', 64), 100, 20, repeat('a', 64), '2026-11-15T12:00:00Z'),
      ('${alice}', 'opencode', 'model_request', repeat('b', 64), 200, 30, repeat('b', 64), '2026-11-15T12:01:00Z'),
      ('${alice}', 'claude-code', 'model_request', repeat('c', 64), 50, 10, repeat('c', 64), '2026-10-15T12:00:00Z'),
      ('${bob}', 'cursor', 'model_request', repeat('d', 64), 500, 50, repeat('d', 64), '2026-11-15T12:00:00Z');
    insert into storage.objects (bucket_id, name) values
      ('usage-data', '${alice}/receipt.pdf'), ('usage-data', '${bob}/receipt.pdf');
  `)
}, 30000)

afterAll(async () => { await db?.close() })

async function asUser<T>(userId: string | null, action: (client: PGlite) => Promise<T>): Promise<T> {
  await db.exec('begin')
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
    await db.exec(`set local role ${userId ? 'authenticated' : 'anon'}`)
    return await action(db)
  } finally {
    await db.exec('rollback')
  }
}

describe('production schema and access control', () => {
  it('creates public GitHub profiles on signup', async () => {
    const result = await asUser(null, client => client.query('select github_login, display_name, stats_public from public.profiles order by github_login'))
    expect(result.rows[0]).toEqual({ github_login: 'alice', display_name: 'Alice Example', stats_public: true })
    expect(result.rows).toHaveLength(3)
  })

  it('does not expose raw events or receipts to anonymous visitors', async () => {
    await expect(asUser(null, client => client.query('select * from public.usage_events'))).rejects.toThrow(/permission denied/)
    await expect(asUser(null, client => client.query('select * from storage.objects'))).rejects.toThrow(/permission denied/)
  })

  it('exposes public aggregates, not private profile statistics', async () => {
    const result = await asUser(null, client => client.query<{ user_id: string }>('select * from public.monthly_usage_summary'))
    expect(result.rows).toHaveLength(3)
    expect(result.rows.every(row => row.user_id === alice)).toBe(true)
  })

  it('allows shared-group comparisons but keeps other raw events private', async () => {
    const aggregate = await asUser(alice, client => client.query<{ user_id: string }>('select * from public.monthly_usage_summary'))
    expect(aggregate.rows.some(row => row.user_id === bob)).toBe(true)
    const raw = await asUser(alice, client => client.query<{ user_id: string }>('select * from public.usage_events'))
    expect(raw.rows).toHaveLength(3)
    expect(raw.rows.every(row => row.user_id === alice)).toBe(true)
    const unrelated = await asUser(stranger, client => client.query<{ user_id: string }>('select * from public.monthly_usage_summary'))
    expect(unrelated.rows.some(row => row.user_id === bob)).toBe(false)
  })

  it('reads group memberships without recursive policies', async () => {
    const members = await asUser(bob, client => client.query('select * from public.group_members'))
    expect(members.rows).toHaveLength(2)
    const groups = await asUser(stranger, client => client.query('select * from public.groups'))
    expect(groups.rows).toHaveLength(0)
  })

  it('automatically adds the creator as the group owner', async () => {
    await asUser(stranger, async client => {
      const created = await client.query<{ id: string }>("insert into public.groups (name, owner_id) values ('New group', $1) returning id", [stranger])
      const result = await client.query('select user_id, role from public.group_members where group_id = $1', [created.rows[0].id])
      expect(result.rows).toEqual([{ user_id: stranger, role: 'owner' }])
    })
  })

  it('requires an actual invite code and cannot self-promote to owner', async () => {
    await expect(asUser(stranger, client => client.query("insert into public.group_members (group_id, user_id, role) values ($1, $2, 'owner')", [groupId, stranger]))).rejects.toThrow(/permission denied/)
    await expect(asUser(stranger, client => client.query("select public.join_group('incorrect')"))).rejects.toThrow('Invalid invite code')
    await expect(asUser(null, client => client.query("select public.join_group('test-invite')"))).rejects.toThrow(/permission denied/)
    await asUser(stranger, async client => {
      await client.query("select public.join_group('test-invite')")
      await client.query("select public.join_group('test-invite')")
      const result = await client.query('select role from public.group_members where user_id = $1', [stranger])
      expect(result.rows).toEqual([{ role: 'member' }])
    })
  })

  it('does not let owners enroll users without consent or reassign membership identities', async () => {
    await expect(asUser(alice, client => client.query('insert into public.group_members (group_id, user_id) values ($1, $2)', [groupId, stranger]))).rejects.toThrow(/permission denied/)
    await expect(asUser(alice, client => client.query('update public.group_members set user_id = $1 where group_id = $2 and user_id = $3', [stranger, groupId, bob]))).rejects.toThrow(/permission denied/)
    await expect(asUser(alice, client => client.query("update public.profiles set github_login = 'someone-else' where id = $1", [alice]))).rejects.toThrow(/permission denied/)
    await expect(asUser(alice, client => client.query('update public.profiles set github_id = 1234 where id = $1', [alice]))).rejects.toThrow(/permission denied/)
  })

  it('revokes inherited table-wide writes, truncation, and server-field inserts', async () => {
    for (const table of ['profiles', 'groups', 'group_members', 'user_subscriptions', 'custom_subscriptions', 'usage_events']) {
      const result = await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated',$1,'TRUNCATE') as allowed", [`public.${table}`])
      expect(result.rows[0].allowed).toBe(false)
    }
    await expect(asUser(alice, client => client.query('update public.usage_events set input_tokens = 999 where user_id = $1', [alice]))).rejects.toThrow(/permission denied/)
    await expect(asUser(alice, client => client.query("insert into public.usage_events (user_id,tool,event_type,event_id,received_at,occurred_at) values ($1,'codex','model_request',repeat('f',64),now(),now())", [alice]))).rejects.toThrow(/permission denied/)
  })

  it('rejects cross-user writes and negative token counts', async () => {
    await expect(asUser(alice, client => client.query("insert into public.usage_events (user_id, tool, event_type, event_id, occurred_at) values ($1, 'codex', 'model_request', repeat('f',64), now())", [bob]))).rejects.toThrow(/row-level security/)
    await expect(asUser(alice, client => client.query("insert into public.usage_events (user_id, tool, event_type, event_id, input_tokens, occurred_at) values ($1, 'codex', 'model_request', repeat('f',64), -1, now())", [alice]))).rejects.toThrow(/check constraint/)
  })

  it('deduplicates retried usage events', async () => {
    const result = await asUser(alice, client => client.query(`
      insert into public.usage_events (user_id, tool, event_type, event_id, input_tokens, output_tokens, occurred_at)
      values ($1, 'codex', 'model_request', repeat('a',64), 100, 20, '2026-11-18T13:00:00Z')
      on conflict (user_id, tool, event_id) do nothing returning id
    `, [alice]))
    expect(result.rows).toHaveLength(0)
  })

  it('preserves identical genuine requests with different event IDs', async () => {
    const result = await asUser(alice, client => client.query(`
      insert into public.usage_events (user_id, tool, event_type, event_id, input_tokens, output_tokens, session_id, occurred_at)
      values ($1, 'codex', 'model_request', repeat('f',64), 100, 20, repeat('a',64), '2026-11-15T12:00:00Z')
      on conflict (user_id, tool, event_id) do nothing returning id
    `, [alice]))
    expect(result.rows).toHaveLength(1)
  })

  it('retains the ten-decimal precision of reported billing-item costs', async () => {
    await asUser(alice, async client => {
      const result = await client.query<{ estimated_cost_usd: string }>("insert into public.usage_events (user_id,tool,event_type,event_id,estimated_cost_usd,occurred_at) values ($1,'cursor','model_request',repeat('f',64),0.0000000001,now()) returning estimated_cost_usd", [alice])
      expect(result.rows[0].estimated_cost_usd).toBe('0.0000000001')
    })
  })

  it('does not store arbitrary metadata or raw session identifiers', async () => {
    await expect(asUser(alice, client => client.query("insert into public.usage_events (user_id,tool,event_type,event_id,session_id,occurred_at) values ($1,'codex','model_request',repeat('f',64),'raw-session',now())", [alice]))).rejects.toThrow(/check constraint/)
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='usage_events'")
    expect(columns.rows.map(row => row.column_name)).not.toContain('metadata')
  })

  it('keeps SQL catalogue prices aligned with the website, including Go and legacy Cursor plans', async () => {
    for (const catalog of SUBSCRIPTION_CATALOG) for (const tier of catalog.tiers) {
      await asUser(stranger, async client => {
        await client.query("insert into public.user_subscriptions (user_id,catalog,tier,tools,started_at) values ($1,$2,$3,'{codex}',date_trunc('month',now()))", [stranger, catalog.id, tier.id])
        await client.query("insert into public.usage_events (user_id,tool,event_type,event_id,occurred_at) values ($1,'codex','model_request',repeat('e',64),now())", [stranger])
        const result = await client.query<{ cost: string }>('select public.calculate_monthly_real_cost($1,(now() at time zone \'UTC\')::date) as cost', [stranger])
        expect(Number(result.rows[0].cost), `${catalog.id}/${tier.id}`).toBe(tier.price)
      })
    }
  })

  it('edits this UTC month atomically without erasing historical subscription records', async () => {
    await asUser(alice, async client => {
      await client.query("select public.set_subscription('chatgpt','plus',31,'{codex,opencode}',true)")
      await client.query("select public.set_subscription('chatgpt','pro-100',37,'{codex,opencode}',true)")
      const active = await client.query<{ custom_price_usd: string; tier: string }>("select custom_price_usd,tier from public.user_subscriptions where catalog='chatgpt' and active")
      expect(active.rows).toEqual([{ custom_price_usd: '37.00', tier: 'pro-100' }])
      const historical = await client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1,'2026-10-01') as cost", [alice])
      expect(Number(historical.rows[0].cost)).toBe(20)
    })
  })

  it('counts shared subscriptions once, overrides prices, and ignores unused subscriptions', async () => {
    const result = await asUser(alice, client => client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1, '2026-11-01') as cost", [alice]))
    expect(Number(result.rows[0].cost)).toBe(25)
    const unused = await asUser(alice, client => client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1, '2026-12-01') as cost", [alice]))
    expect(Number(unused.rows[0].cost)).toBe(0)
  })

  it('retains historical spending after a subscription ends', async () => {
    const result = await asUser(alice, client => client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1, '2026-10-01') as cost", [alice]))
    expect(Number(result.rows[0].cost)).toBe(20)
  })

  it('cannot read another user’s subscriptions through the cost RPC', async () => {
    const result = await asUser(stranger, client => client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1, '2026-11-01') as cost", [alice]))
    expect(Number(result.rows[0].cost)).toBe(0)
  })

  it('keeps custom subscription names/prices owner-only, even inside shared groups', async () => {
    await expect(asUser(null, client => client.query('select * from public.custom_subscriptions'))).rejects.toThrow(/permission denied/)
    const privateRows = await asUser(alice, client => client.query('select name from public.custom_subscriptions'))
    expect(privateRows.rows).toHaveLength(0)
    const ownRows = await asUser(bob, client => client.query('select name from public.custom_subscriptions'))
    expect(ownRows.rows).toEqual([{ name: 'Private custom plan' }])
    const comparison = await asUser(alice, client => client.query<{ real_cost_usd: string }>('select real_cost_usd from public.monthly_usage_summary where user_id=$1', [bob]))
    expect(Number(comparison.rows[0].real_cost_usd)).toBe(9)
  })

  it('rejects cross-user custom plan writes, reassignment and RPC edits', async () => {
    await expect(asUser(alice, client => client.query("insert into public.custom_subscriptions (user_id,name,monthly_price_usd,tools) values ($1,'Foreign plan',1,'{codex}')", [bob]))).rejects.toThrow(/row-level security/)
    await expect(asUser(bob, client => client.query('update public.custom_subscriptions set user_id=$1', [alice]))).rejects.toThrow(/row-level security/)
    await expect(asUser(alice, client => client.query("select public.set_custom_subscription($1,'Foreign plan',1,'{codex}',true)", [bobCustomId]))).rejects.toThrow('Custom subscription not found')
    await expect(asUser(null, client => client.query("select public.set_custom_subscription(null,'Anonymous plan',1,'{codex}',true)"))).rejects.toThrow(/permission denied/)
  })

  it('counts each custom subscription once per used month, not once per tool or name', async () => {
    await asUser(alice, async client => {
      await client.query("insert into public.custom_subscriptions (user_id,name,monthly_price_usd,tools,started_at) values ($1,'Same name',12.50,'{codex,opencode}','2026-11-01Z'),($1,'Same name',7,'{codex}','2026-11-01Z'),($1,'Unused plan',99,'{cursor}','2026-11-01Z')", [alice])
      const cost = await client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1,'2026-11-01') as cost", [alice])
      expect(Number(cost.rows[0].cost)).toBe(44.5) // existing $25 + $12.50 + $7; unused $99 excluded
      const rows = await client.query<{ real_cost_usd: string }>("select real_cost_usd from public.monthly_usage_summary where user_id=$1 and month='2026-11-01Z'", [alice])
      expect(rows.rows).toHaveLength(2)
      expect(rows.rows.every(row => Number(row.real_cost_usd) === 44.5)).toBe(true)
      const unusedMonth = await client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1,'2026-12-01') as cost", [alice])
      expect(Number(unusedMonth.rows[0].cost)).toBe(0)
    })
  })

  it('retains historical custom prices and reuses the current UTC month on repeated edits', async () => {
    await asUser(alice, async client => {
      const created = await client.query<{ subscription_id: string }>("insert into public.custom_subscriptions (user_id,name,monthly_price_usd,tools,started_at) values ($1,'Old name',9,'{codex}',date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' - interval '1 month') returning subscription_id", [alice])
      const id = created.rows[0].subscription_id
      await client.query("insert into public.usage_events (user_id,tool,event_type,event_id,occurred_at) values ($1,'codex','model_request',repeat('e',64),date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' - interval '1 day')", [alice])
      const before = await client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1,((now() at time zone 'UTC')::date - interval '1 month')::date) as cost", [alice])
      await client.query("select public.set_custom_subscription($1,'New name',20,'{codex,opencode}',true)", [id])
      await client.query("select public.set_custom_subscription($1,'Updated name',21,'{codex,opencode}',true)", [id])
      const periods = await client.query<{ name: string; monthly_price_usd: string; active: boolean }>('select name,monthly_price_usd,active from public.custom_subscriptions where subscription_id=$1 order by started_at', [id])
      expect(periods.rows).toEqual([{ name: 'Old name', monthly_price_usd: '9.00', active: false }, { name: 'Updated name', monthly_price_usd: '21.00', active: true }])
      const after = await client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1,((now() at time zone 'UTC')::date - interval '1 month')::date) as cost", [alice])
      expect(after.rows).toEqual(before.rows)
    })
  })

  it('stops future custom counting without cancelling or erasing recorded periods', async () => {
    await asUser(alice, async client => {
      const created = await client.query<{ id: string }>("select public.set_custom_subscription(null,'Extra plan',5,'{codex}',true) as id")
      const id = created.rows[0].id
      await client.query("insert into public.usage_events (user_id,tool,event_type,event_id,occurred_at) values ($1,'codex','model_request',repeat('e',64),greatest(date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',now()-interval '1 second'))", [alice])
      const before = await client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1,(now() at time zone 'UTC')::date) as cost", [alice])
      await client.query("select public.set_custom_subscription($1,'Extra plan',5,'{codex}',false)", [id])
      const after = await client.query<{ cost: string }>("select public.calculate_monthly_real_cost($1,(now() at time zone 'UTC')::date) as cost", [alice])
      expect(after.rows).toEqual(before.rows)
      const saved = await client.query<{ active: boolean; ended: boolean }>('select active,ended_at is not null as ended from public.custom_subscriptions where subscription_id=$1', [id])
      expect(saved.rows).toEqual([{ active: false, ended: true }])
    })
  })

  it.each([
    [null, 1, ['codex']], ['', 1, ['codex']], ['x'.repeat(101), 1, ['codex']],
    ['Plan', -1, ['codex']], ['Plan', 1.123, ['codex']], ['Plan', 100_000_000, ['codex']],
    ['Plan', 1, []], ['Plan', 1, ['unknown']], ['Plan', 1, null],
  ])('validates custom fields at the database boundary (%s, %s, %j)', async (name, price, tools) => {
    await expect(asUser(alice, client => client.query('select public.set_custom_subscription(null,$1,$2,$3,true)', [name, price, tools]))).rejects.toThrow()
  })

  it('permits receipt replacement but not moving a receipt to another user', async () => {
    await asUser(alice, async client => {
      const result = await client.query("update storage.objects set name = $1 where name = $2 returning name", [`${alice}/updated.pdf`, `${alice}/receipt.pdf`])
      expect(result.rows).toHaveLength(1)
    })
    await expect(asUser(alice, client => client.query('update storage.objects set name = $1 where name = $2', [`${bob}/stolen.pdf`, `${alice}/receipt.pdf`]))).rejects.toThrow(/row-level security/)
  })
})
