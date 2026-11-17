import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { GitBranch, Database, Key, Save, AlertCircle, HelpCircle, ExternalLink, Trash2, Edit2, Unlock } from 'lucide-react'
import { useState } from 'react'
import { SUBSCRIPTION_CATALOG, calculateMonthlySubscriptionCost, formatCurrency as fmtCurrency } from '@/lib/utils'

export function Settings() {
  const { user, session, signOut } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const [activeTab, setActiveTab] = useState<'account' | 'supabase' | 'subscriptions' | 'plugins'>('account')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [supabaseStatus, setSupabaseStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle')
  const [subscriptions, setSubscriptions] = useState<Array<{ catalogId: string; tierId: string; customPrice?: number }>>([
    { catalogId: 'claude-pro', tierId: 'pro' },
    { catalogId: 'cursor', tierId: 'premium' },
    { catalogId: 'opencode', tierId: 'free' },
  ])
  const [saving, setSaving] = useState(false)

  const tabs = [
    { id: 'account', label: 'Account', icon: GitBranch },
    { id: 'supabase', label: 'Supabase', icon: Database },
    { id: 'subscriptions', label: 'Subscriptions', icon: Key },
    { id: 'plugins', label: 'Plugins', icon: HelpCircle },
  ]

  const totalMonthlyCost = calculateMonthlySubscriptionCost(subscriptions)

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 32 }}>Settings</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: activeTab === id ? 'var(--bg)' : 'var(--fg-muted)',
              background: activeTab === id ? 'var(--accent)' : 'transparent',
              border: '1px solid var(--border)',
              transition: 'all var(--transition)',
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'account' && <AccountSettings user={user} session={session} onSignOut={signOut} />}
      {activeTab === 'supabase' && <SupabaseSettings
        isDemoMode={isDemoMode}
        supabaseUrl={supabaseUrl}
        setSupabaseUrl={setSupabaseUrl}
        supabaseKey={supabaseKey}
        setSupabaseKey={setSupabaseKey}
        supabaseStatus={supabaseStatus}
        setSupabaseStatus={setSupabaseStatus}
        saving={saving}
        setSaving={setSaving}
        supabase={supabase}
      />}
      {activeTab === 'subscriptions' && <SubscriptionSettings
        subscriptions={subscriptions}
        setSubscriptions={setSubscriptions}
        totalMonthlyCost={totalMonthlyCost}
      />}
      {activeTab === 'plugins' && <PluginSettings />}
    </div>
  )
}

function AccountSettings({ user, session, onSignOut }: { user: any; session: any; onSignOut: () => void }) {
  const githubLogin = user?.user_metadata?.login || 'user'
  const githubName = user?.user_metadata?.name || user?.user_metadata?.full_name || githubLogin
  const avatarUrl = user?.user_metadata?.avatar_url || `https://github.com/${githubLogin}.png`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your GitHub account information</CardDescription>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <img
              src={avatarUrl}
              alt={githubLogin}
              style={{ width: 80, height: 80, borderRadius: '50%', border: '2px solid var(--accent)' }}
            />
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{githubName}</h3>
              <p style={{ color: 'var(--accent)', fontSize: '1rem', fontWeight: 500, marginTop: 4 }}>@{githubLogin}</p>
              <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem', marginTop: 4 }}>
                <a href={`https://github.com/${githubLogin}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  github.com/{githubLogin}
                </a>
              </p>
              <p style={{ color: 'var(--fg-subtle)', fontSize: '0.75rem', marginTop: 4 }}>
                Signed in via GitHub • {new Date(user?.created_at || Date.now()).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <h4 style={{ fontWeight: 600, marginBottom: 12 }}>Session</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: '0.8125rem' }}>
              <div><span style={{ color: 'var(--fg-subtle)' }}>Provider:</span> <span style={{ fontWeight: 500 }}>GitHub OAuth</span></div>
              <div><span style={{ color: 'var(--fg-subtle)' }}>Expires:</span> <span style={{ fontWeight: 500 }}>{session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A'}</span></div>
              <div><span style={{ color: 'var(--fg-subtle)' }}>User ID:</span> <span style={{ fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{user?.id}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '16px', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Sign Out Everywhere</h4>
                <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem' }}>
                  Sign out of all sessions on all devices. You'll need to sign in again.
                </p>
              </div>
              <Button variant="danger" onClick={onSignOut}>
                <Unlock size={18} /> Sign Out
              </Button>
            </div>
          </div>

          <div style={{ padding: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ fontWeight: 600, marginBottom: 4 }}>Delete Account</h4>
            <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem', marginBottom: 12 }}>
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <Button variant="danger" style={{ background: 'transparent', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              <Trash2 size={18} /> Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SupabaseSettings({
  isDemoMode,
  supabaseUrl,
  setSupabaseUrl,
  supabaseKey,
  setSupabaseKey,
  supabaseStatus,
  setSupabaseStatus,
  saving,
  setSaving,
  supabase,
}: {
  isDemoMode: boolean
  supabaseUrl: string
  setSupabaseUrl: (v: string) => void
  supabaseKey: string
  setSupabaseKey: (v: string) => void
  supabaseStatus: 'idle' | 'checking' | 'connected' | 'error'
  setSupabaseStatus: (v: 'idle' | 'checking' | 'connected' | 'error') => void
  saving: boolean
  setSaving: (v: boolean) => void
  supabase: any
}) {
  const handleTestConnection = async () => {
    setSupabaseStatus('checking')
    setSaving(true)
    try {
      if (!supabaseUrl || !supabaseKey) {
        setSupabaseStatus('error')
        return
      }
      const testClient = supabase.supabaseKey?.createClient || ((url: string, key: string) =>
        import('@supabase/supabase-js').then(m => m.createClient(url, key)))
      const client = await testClient(supabaseUrl, supabaseKey)
      const { error } = await client.from('profiles').select('count', { count: 'exact', head: true })
      if (error && error.code !== '42P01') throw error
      setSupabaseStatus('connected')
    } catch {
      setSupabaseStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    // In real app, save to localStorage or send to backend
    localStorage.setItem('supabase_url', supabaseUrl)
    localStorage.setItem('supabase_key', supabaseKey)
    setTimeout(() => {
      setSaving(false)
      setSupabaseStatus('idle')
      window.location.reload()
    }, 1000)
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <CardTitle>Supabase Connection</CardTitle>
              <CardDescription>
                Connect your Supabase project to enable real-time sync, private groups, and persistent data.
              </CardDescription>
            </div>
            {isDemoMode && (
              <Badge variant="accent" style={{ alignSelf: 'flex-start' }}>
                <AlertCircle size={14} style={{ marginRight: 4 }} /> Demo Mode
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input
              label="Project URL"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              helperText="Find this in Settings → API"
            />
            <Input
              label="Anon/Publishable Key"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              type="password"
              helperText="Find this in Settings → API"
            />
          </div>

          <div style={{
            padding: '20px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h4 style={{ fontWeight: 600, marginBottom: 4 }}>Connection Status</h4>
                <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem' }}>
                  {supabaseStatus === 'connected' && '✅ Connected and ready'}
                  {supabaseStatus === 'checking' && '🔄 Testing connection...'}
                  {supabaseStatus === 'error' && '❌ Connection failed — check credentials'}
                  {supabaseStatus === 'idle' && '⏸️ Not tested yet'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Button variant="outline" onClick={handleTestConnection} disabled={saving || !supabaseUrl || !supabaseKey}>
                  <Database size={18} /> Test Connection
                </Button>
                <Button onClick={handleSave} disabled={saving || !supabaseUrl || !supabaseKey} loading={saving}>
                  <Save size={18} /> Save & Reload
                </Button>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <h4 style={{ fontWeight: 600, marginBottom: 16 }}>Required Setup</h4>
            <SetupStep number={1} title="Enable GitHub Auth" description="In Supabase Dashboard → Authentication → Providers → GitHub, enable GitHub and add your OAuth credentials." />
            <SetupStep number={2} title="Run Migrations" description="Apply the database schema from <code>supabase/migrations/</code> using <code>supabase db push --remote --yes</code>." />
            <SetupStep number={3} title="Configure Storage" description="Create a private bucket named <code>usage-data</code> for billing receipts and exports." />
            <SetupStep number={4} title="Set Custom Domain" description="In GitHub Pages settings, add <code>burnyourmoneywithslop.joosibaeri.xyz</code> as a custom domain with CNAME to <code>joosibaeri.github.io</code>." />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SetupStep({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-bg)',
        border: '1px solid var(--accent)',
        borderRadius: '50%',
        fontWeight: 700,
        fontSize: '0.875rem',
        color: 'var(--accent)',
      }}>{number}</div>
      <div style={{ flex: 1 }}>
        <h5 style={{ fontWeight: 600, marginBottom: 4 }}>{title}</h5>
        <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: description }} />
      </div>
    </div>
  )
}

function SubscriptionSettings({
  subscriptions,
  setSubscriptions,
  totalMonthlyCost,
}: {
  subscriptions: Array<{ catalogId: string; tierId: string; customPrice?: number }>
  setSubscriptions: React.Dispatch<React.SetStateAction<Array<{ catalogId: string; tierId: string; customPrice?: number }>>>
  totalMonthlyCost: number
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [customPrice, setCustomPrice] = useState('')

  const handleTierChange = (catalogId: string, tierId: string) => {
    setSubscriptions(prev => prev.map(s => s.catalogId === catalogId ? { ...s, tierId, customPrice: undefined } : s))
  }

  const handleCustomPrice = (catalogId: string) => {
    const price = parseFloat(customPrice)
    if (!isNaN(price)) {
      setSubscriptions(prev => prev.map(s => s.catalogId === catalogId ? { ...s, customPrice: price } : s))
    }
    setEditingId(null)
    setCustomPrice('')
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <CardTitle>Subscription Management</CardTitle>
              <CardDescription>
                Track your actual monthly spending. One subscription shared across tools counts only once.
              </CardDescription>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{fmtCurrency(totalMonthlyCost)}/mo</div>
              <div style={{ color: 'var(--fg-subtle)', fontSize: '0.875rem' }}>Total Real Cost</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {SUBSCRIPTION_CATALOG.map(catalog => {
              const sub = subscriptions.find(s => s.catalogId === catalog.id)
              const activeTier = catalog.tiers.find(t => t.id === sub?.tierId) || catalog.tiers[0]
              const isCustom = sub?.customPrice !== undefined

              return (
                <div key={catalog.id} style={{
                  padding: '20px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 44, height: 44,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--accent-bg)',
                        border: '1px solid var(--accent)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '1.25rem',
                      }}>
                        {catalog.id === 'claude-pro' && '🤖'}
                        {catalog.id === 'cursor' && '📝'}
                        {catalog.id === 'chatgpt' && '💬'}
                        {catalog.id === 'opencode' && '⌨️'}
                      </div>
                      <div>
                        <h4 style={{ fontWeight: 600 }}>{catalog.name}</h4>
                        <p style={{ color: 'var(--fg-subtle)', fontSize: '0.8125rem' }}>{catalog.provider}</p>
                      </div>
                    </div>
                    <Badge variant={sub ? 'success' : 'default'} size="sm">
                      {sub ? 'Active' : 'Not Tracked'}
                    </Badge>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {catalog.tiers.map(tier => {
                      const isActive = sub?.tierId === tier.id
                      return (
                        <button
                          key={tier.id}
                          onClick={() => handleTierChange(catalog.id, tier.id)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            color: isActive ? 'var(--bg)' : 'var(--fg-muted)',
                            background: isActive ? 'var(--accent)' : 'transparent',
                            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                            transition: 'all var(--transition)',
                          }}
                        >
                          {tier.name} ${tier.price}/mo
                        </button>
                      )
                    })}
                    {editingId === catalog.id && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={customPrice}
                          onChange={(e) => setCustomPrice(e.target.value)}
                          placeholder="Custom price"
                          style={{
                            width: 120,
                            padding: '8px 12px',
                            fontSize: '0.8125rem',
                            background: 'var(--bg-card)',
                            color: 'var(--fg)',
                            border: '1px solid var(--accent)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        />
                        <Button size="sm" onClick={() => handleCustomPrice(catalog.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setCustomPrice('') }}>Cancel</Button>
                      </div>
                    )}
                    {!editingId && sub && (
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(catalog.id); setCustomPrice(String(sub.customPrice || '')) }}>
                        <Edit2 size={14} /> Custom Price
                      </Button>
                    )}
                  </div>

                  {isCustom && (
                    <div style={{
                      padding: '12px',
                      background: 'var(--accent-bg)',
                      border: '1px solid var(--accent)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={16} style={{ color: 'var(--accent)' }} />
                        <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                          Custom price: {fmtCurrency(sub.customPrice!)}/mo (overrides catalog)
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleTierChange(catalog.id, activeTier.id)}>
                        Reset to Catalog
                      </Button>
                    </div>
                  )}

                  {activeTier.features && (
                    <p style={{ color: 'var(--fg-subtle)', fontSize: '0.75rem', marginTop: 12 }}>
                      Includes: {activeTier.features.join(', ')}
                    </p>
                  )}
                </div>
              )
            })}

            <div style={{
              marginTop: 8,
              padding: '20px',
              background: 'var(--success-bg)',
              border: '1px solid var(--success)',
              borderRadius: 'var(--radius)',
            }}>
              <h4 style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>How It Works</h4>
              <ul style={{ color: 'var(--fg-muted)', fontSize: '0.875rem', lineHeight: 1.8, paddingLeft: 20 }}>
                <li>Subscriptions are counted once per calendar month containing recorded usage</li>
                <li>One subscription shared across tools (e.g., ChatGPT via Codex + OpenCode) counts only once</li>
                <li>Custom prices let you enter your actual invoice amount (taxes, discounts, etc.)</li>
                <li>Model-cost estimates remain separate from real subscription spending</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PluginSettings() {
  const plugins = [
    {
      id: 'opencode',
      name: 'OpenCode',
      icon: '⌨️',
      description: 'Official OpenCode plugin using session.usage.updated events',
      status: 'ready',
      install: 'opencode plugin install github.com/Joosibaeri/burnyourmoneywithslop/plugins/opencode',
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      icon: '🤖',
      description: 'Hook-based plugin using Stop event with OpenTelemetry export',
      status: 'ready',
      install: 'Copy .claude-plugin/ to ~/.claude/plugins/burnyourmoneywithslop/',
    },
    {
      id: 'cursor',
      name: 'Cursor',
      icon: '📝',
      description: 'Hook plugin using sessionEnd event to capture conversation metrics',
      status: 'ready',
      install: 'Copy .cursor-plugin/ to ~/.cursor/plugins/local/burnyourmoneywithslop/',
    },
    {
      id: 'codex',
      name: 'Codex',
      icon: '💬',
      description: 'Hook plugin using PostModelRequest to capture token_usage per attempt',
      status: 'ready',
      install: 'Add hooks to ~/.codex/hooks.json or .codex/hooks.json',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
      {plugins.map(plugin => (
        <Card key={plugin.id}>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 48, height: 48,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-bg)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '1.5rem',
              }}>{plugin.icon}</div>
              <div style={{ flex: 1 }}>
                <CardTitle>{plugin.name}</CardTitle>
                <CardDescription>{plugin.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge
                variant={plugin.status === 'ready' ? 'success' : plugin.status === 'beta' ? 'info' : 'default'}
                size="sm"
              >
                {plugin.status === 'ready' && 'Ready to Install'}
                {plugin.status === 'beta' && 'Beta'}
                {plugin.status === 'planned' && 'Planned'}
              </Badge>
            </div>
            <div style={{
              padding: '12px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--fg-muted)',
              overflow: 'auto',
            }}>
              {plugin.install}
            </div>
            <Button variant="outline" style={{ justifyContent: 'center' }}>
              <ExternalLink size={16} /> View Plugin Code
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}