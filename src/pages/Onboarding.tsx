import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Database, Key, Users, GitBranch } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { githubLogin, loadCustomSubscriptions, loadSubscriptions, loadUsage } from '@/lib/data'
import { COLLECTORS, COLLECTOR_QUICKSTART } from '@/lib/collectors'
import { useAsyncData } from '@/hooks/useAsyncData'

export function Onboarding() {
  const { user } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const [refresh, setRefresh] = useState(0)
  const userId = user?.id

  const load = useCallback(async () => {
    if (!userId) throw new Error('Sign in to check setup.')
    const [profile, subscriptions, customSubscriptions, usage, groups] = await Promise.all([
      supabase.from('profiles').select('id').eq('id', userId).single(),
      loadSubscriptions(supabase, userId), loadCustomSubscriptions(supabase, userId), loadUsage(supabase, [userId]),
      supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    if (profile.error || groups.error) throw new Error(profile.error?.message || groups.error?.message)
    return { connected: !!profile.data, subscriptions: subscriptions.filter(sub => sub.active).length + customSubscriptions.filter(sub => sub.active).length,
      groups: groups.count ?? 0, tools: [...new Set(usage.map(row => row.tool))] }
  }, [supabase, userId])
  const { data, loading, error } = useAsyncData(isDemoMode || !userId ? null : `setup:${userId}:${refresh}`, load)
  const saved = data ?? { connected: false, subscriptions: 0, groups: 0, tools: [] }

  return <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px' }}>
    <h1 style={{ marginBottom: 16 }}>Welcome, {githubLogin(user) || 'friend'}!</h1>
    <p style={{ color: 'var(--fg-muted)', marginBottom: 24 }}>Compare recorded AI usage and your subscription/invoice prices with friends. GitHub identity and aggregate statistics are public by default; raw events, invoices and receipts stay private. Group membership always requires confirmation.</p>
    {isDemoMode && <p role="status">This is a local demo. No connection or setup is being simulated as complete. <a href="https://github.com/Joosibaeri/burnyourmoneywithslop#development" target="_blank" rel="noopener noreferrer">Follow the configuration guide</a> to use live data.</p>}
    {loading && <p role="status">Checking your saved setup…</p>}
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    <div style={{ display: 'grid', gap: 20, margin: '24px 0' }}>
      <SetupCard title="GitHub and backend" icon={Database} complete={saved.connected} status={saved.connected ? 'Connection verified' : 'Not verified'}>
        <p>Your hosted connection is already configured. Friends only need GitHub sign-in, not a Supabase project or secret key.</p>
        <Link to="/settings?tab=account">Manage your GitHub account</Link>
      </SetupCard>
      <SetupCard title="Subscription prices" icon={Key} complete={saved.subscriptions > 0} status={`${saved.subscriptions} saved`}>
        <p>Choose only plans you pay for and enter invoice-price overrides if needed. A shared subscription counts once per UTC calendar month with relevant usage. API estimates are not actual charges.</p>
        <Link to="/settings?tab=subscriptions">Manage subscriptions</Link> · Free/API-only users can skip this.
      </SetupCard>
      <SetupCard title="Friend groups (optional)" icon={Users} complete={saved.groups > 0} status={`${saved.groups} joined`}>
        <p>Create a group or open an invite link and confirm joining. Membership is private; your statistics stay public unless you change visibility in Settings.</p>
        <Link to="/groups?create=1">Create or join a group</Link>
      </SetupCard>
      <SetupCard title="Tool collectors" icon={GitBranch} complete={saved.tools.length > 0} status={saved.tools.length ? `${saved.tools.length} tools reporting` : 'No usage received yet'}>
        <p>Use Node.js 22 or newer. Run these commands on each machine; the collector uses its own refreshable GitHub-authenticated session. Only whitelisted metrics, models, timestamps and opaque IDs are uploaded.</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '16px 0' }}>{COLLECTOR_QUICKSTART}</pre>
        {COLLECTORS.map(tool => <p key={tool.id} style={{ marginBottom: 8 }}><Badge variant={saved.tools.includes(tool.id) ? 'success' : 'default'} size="sm">{saved.tools.includes(tool.id) ? 'Usage received' : 'No usage yet'}</Badge> <strong>{tool.name}</strong> — {tool.mode}</p>)}
        <Link to="/settings?tab=plugins">View tool-specific setup</Link>
      </SetupCard>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Button variant="outline" disabled={loading || isDemoMode} onClick={() => setRefresh(value => value + 1)}>Recheck saved setup</Button>
      <Link to="/"><Button>Open dashboard</Button></Link>
    </div>
  </div>
}

function SetupCard({ title, icon: Icon, complete, status, children }: { title: string; icon: React.ComponentType<{ size?: number }>; complete: boolean; status: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle><Icon size={20} /> {title}</CardTitle><CardDescription><Badge variant={complete ? 'success' : 'default'}>{complete && <Check size={14} />} {status}</Badge></CardDescription></CardHeader><CardContent style={{ display: 'grid', gap: 12 }}>{children}</CardContent></Card>
}
