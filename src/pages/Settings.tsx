import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CustomSubscriptionForm } from '@/components/CustomSubscriptionForm'
import { GitBranch, Key, AlertCircle, HelpCircle, ExternalLink, Trash2, Edit2, Unlock, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import { SUBSCRIPTION_CATALOG, calculateMonthlySubscriptionCost, formatCurrencyPrecise as fmtCurrency } from '@/lib/utils'
import { githubLogin as getGithubLogin, loadCustomSubscriptions, loadSubscriptions, saveCustomSubscription, saveSubscription, subscriptionTools, TOOLS, type CustomSubscriptionRecord, type CustomSubscriptionSelection, type SubscriptionSelection } from '@/lib/data'
import { COLLECTORS, COLLECTOR_QUICKSTART } from '@/lib/collectors'

const SETTINGS_TABS = [
  { id: 'account', label: 'Account', icon: GitBranch },
  { id: 'subscriptions', label: 'Subscriptions', icon: Key },
  { id: 'plugins', label: 'Collectors', icon: HelpCircle },
] as const

function activeCustomSelections(records: CustomSubscriptionRecord[]): CustomSubscriptionSelection[] {
  return records.filter(sub => sub.active).map(sub => ({ subscriptionId: sub.subscription_id,
    name: sub.name, monthlyPrice: Number(sub.monthly_price_usd), tools: sub.tools }))
}

export function Settings() {
  const { user, session, signOut } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const userId = user?.id
  const [params, setParams] = useSearchParams()
  const activeTab = SETTINGS_TABS.find(tab => tab.id === params.get('tab'))?.id ?? 'account'
  const [subscriptions, setSubscriptions] = useState<SubscriptionSelection[]>(isDemoMode ? [
    { catalogId: 'claude-pro', tierId: 'pro', tools: subscriptionTools('claude-pro') },
    { catalogId: 'cursor', tierId: 'premium', tools: subscriptionTools('cursor') },
    { catalogId: 'opencode', tierId: 'free', tools: subscriptionTools('opencode') },
  ] : [])
  const [customSubscriptions, setCustomSubscriptions] = useState<CustomSubscriptionSelection[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isDemoMode)
  const [error, setError] = useState<string | null>(null)
  const [statsPublic, setStatsPublic] = useState(true)

  const fetchSubscriptions = async () => (await loadSubscriptions(supabase, user!.id)).filter(sub => sub.active).map(sub => ({
    catalogId: sub.catalog, tierId: sub.tier, customPrice: sub.custom_price_usd == null ? undefined : Number(sub.custom_price_usd), tools: sub.tools.length ? sub.tools : subscriptionTools(sub.catalog),
  }))

  useEffect(() => {
    if (isDemoMode || !userId) return
    let active = true
    Promise.all([
      loadSubscriptions(supabase, userId),
      loadCustomSubscriptions(supabase, userId),
      supabase.from('profiles').select('stats_public').eq('id', userId).single(),
    ]).then(([records, customRecords, profile]) => {
      if (!active) return
      if (profile.error) throw new Error(profile.error.message)
      setStatsPublic(profile.data.stats_public)
      setSubscriptions(records.filter(sub => sub.active).map(sub => ({ catalogId: sub.catalog, tierId: sub.tier, customPrice: sub.custom_price_usd == null ? undefined : Number(sub.custom_price_usd), tools: sub.tools.length ? sub.tools : subscriptionTools(sub.catalog) })))
      setCustomSubscriptions(activeCustomSelections(customRecords))
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load settings.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [supabase, isDemoMode, userId])

  const handleSaveSubscription = async (sub: SubscriptionSelection, active = true): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      if (isDemoMode) setSubscriptions(previous => [...previous.filter(old => old.catalogId !== sub.catalogId), ...(active ? [sub] : [])])
      else {
        await saveSubscription(supabase, sub, active)
        setSubscriptions(await fetchSubscriptions())
      }
      return true
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save subscription.'); return false }
    finally { setSaving(false) }
  }

  const handleVisibility = async (visible: boolean) => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      if (!isDemoMode) {
        const { error: updateError } = await supabase.from('profiles').update({ stats_public: visible }).eq('id', user.id).select('id').single()
        if (updateError) throw new Error(updateError.message)
      }
      setStatsPublic(visible)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update visibility.') }
    finally { setSaving(false) }
  }

  const handleSaveCustom = async (sub: CustomSubscriptionSelection, active = true): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      if (isDemoMode) {
        const saved = { ...sub, subscriptionId: sub.subscriptionId ?? crypto.randomUUID() }
        setCustomSubscriptions(previous => [...previous.filter(old => old.subscriptionId !== saved.subscriptionId), ...(active ? [saved] : [])])
      } else {
        await saveCustomSubscription(supabase, sub, active)
        setCustomSubscriptions(activeCustomSelections(await loadCustomSubscriptions(supabase, user!.id)))
      }
      return true
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save custom subscription.'); return false }
    finally { setSaving(false) }
  }

  const totalMonthlyCost = calculateMonthlySubscriptionCost(subscriptions) + customSubscriptions.reduce((sum, sub) => sum + sub.monthlyPrice, 0)

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 32 }}>Settings</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setParams({ tab: id })}
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

      {error && <p role="alert" style={{ marginBottom: 20, color: 'var(--danger)' }}>{error}</p>}
      {loading && <p role="status">Loading saved settings…</p>}
      {isDemoMode && <p style={{ marginBottom: 20, color: 'var(--fg-muted)' }}>Demo settings; subscription and visibility changes are not persisted.</p>}

      {activeTab === 'account' && <AccountSettings user={user} session={session} onSignOut={signOut} statsPublic={statsPublic} onVisibilityChange={handleVisibility} saving={saving || loading} />}
      {activeTab === 'subscriptions' && <SubscriptionSettings
        subscriptions={subscriptions}
        onSave={handleSaveSubscription}
        customSubscriptions={customSubscriptions}
        onSaveCustom={handleSaveCustom}
        saving={saving || loading}
        totalMonthlyCost={totalMonthlyCost}
      />}
      {activeTab === 'plugins' && <PluginSettings />}
    </div>
  )
}

function AccountSettings({ user, session, onSignOut, statsPublic, onVisibilityChange, saving }: { user: User | null; session: Session | null; onSignOut: () => Promise<void>; statsPublic: boolean; onVisibilityChange: (visible: boolean) => Promise<void>; saving: boolean }) {
  const githubLogin = getGithubLogin(user) || 'user'
  const githubName = user?.user_metadata?.name || user?.user_metadata?.full_name || githubLogin
  const avatarUrl = user?.user_metadata?.avatar_url || `https://github.com/${githubLogin}.png`
  const [error, setError] = useState<string | null>(null)
  const handleSignOut = async () => {
    try { await onSignOut() } catch { setError('Could not sign out. Please try again.') }
  }

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
                Signed in via GitHub • {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown sign-up date'}
              </p>
            </div>
          </div>

          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={statsPublic} onChange={event => onVisibilityChange(event.target.checked)} disabled={saving} />
            <span><strong>Public usage statistics</strong><br />Public by default. Disable to share aggregates only with your private groups. GitHub identity stays public; raw events and receipts are always private.</span>
          </label>

          <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <h4 style={{ fontWeight: 600, marginBottom: 12 }}>Session</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: '0.8125rem' }}>
              <div><span style={{ color: 'var(--fg-subtle)' }}>Provider:</span> <span style={{ fontWeight: 500 }}>GitHub OAuth</span></div>
              <div><span style={{ color: 'var(--fg-subtle)' }}>Access token expires:</span> <span style={{ fontWeight: 500 }}>{session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A'}</span></div>
              <div><span style={{ color: 'var(--fg-subtle)' }}>User ID:</span> <span style={{ fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{user?.id}</span></div>
            </div>
            <p style={{ marginTop: 12, fontSize: '0.8125rem', color: 'var(--fg-muted)' }}>This short-lived access token refreshes automatically while the website is active, and when you return to it. It is not your GitHub OAuth app secret. If the refresh session is revoked or expires, sign in again. Collectors keep a separate refreshable session and preserve pending metrics.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session Controls</CardTitle>
          <CardDescription>Manage your authenticated sessions</CardDescription>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '16px', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Sign Out Everywhere</h4>
                <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem' }}>
                  Revoke session refresh on all devices, including collectors. Existing access tokens expire normally; sign in again to continue syncing.
                </p>
              </div>
              <Button variant="danger" onClick={handleSignOut}>
                <Unlock size={18} /> Sign Out
              </Button>
            </div>
          </div>

          {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function SubscriptionSettings({
  subscriptions,
  onSave,
  customSubscriptions,
  onSaveCustom,
  saving,
  totalMonthlyCost,
}: {
  subscriptions: SubscriptionSelection[]
  onSave: (sub: SubscriptionSelection, active?: boolean) => Promise<boolean>
  customSubscriptions: CustomSubscriptionSelection[]
  onSaveCustom: (sub: CustomSubscriptionSelection, active?: boolean) => Promise<boolean>
  saving: boolean
  totalMonthlyCost: number
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [customPrice, setCustomPrice] = useState('')
  const [priceError, setPriceError] = useState<string | null>(null)
  const [editingCustom, setEditingCustom] = useState<CustomSubscriptionSelection | null | undefined>(undefined)

  const handleTierChange = async (catalogId: string, tierId: string) => {
    const sub = subscriptions.find(sub => sub.catalogId === catalogId)
    await onSave({ catalogId, tierId, tools: sub?.tools ?? subscriptionTools(catalogId) })
  }

  const handleCustomPrice = async (catalogId: string) => {
    const sub = subscriptions.find(sub => sub.catalogId === catalogId)
    const price = Number(customPrice)
    if (!sub || !customPrice.trim() || !Number.isFinite(price) || price < 0 || price > 99_999_999.99) {
      setPriceError('Enter a valid, non-negative invoice amount in USD.')
      return
    }
    if (await onSave({ ...sub, customPrice: price })) {
      setEditingId(null)
      setCustomPrice('')
      setPriceError(null)
    }
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
              <div style={{ color: 'var(--fg-subtle)', fontSize: '0.875rem' }}>Selected Plan Prices</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 20 }}>Selections and invoice-price edits apply to the current UTC calendar month. Older months are retained. The prices below are not spending until relevant usage is recorded.</p>
          <section aria-label="Custom subscriptions" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <h3>Custom subscriptions</h3>
              <Button variant="outline" disabled={saving} onClick={() => setEditingCustom(null)}><Plus size={16} /> Add custom subscription</Button>
            </div>
            {editingCustom !== undefined && <CustomSubscriptionForm key={editingCustom?.subscriptionId ?? 'new'} subscription={editingCustom ?? undefined} saving={saving} onSave={onSaveCustom} onCancel={() => setEditingCustom(undefined)} />}
            {!customSubscriptions.length && <p style={{ color: 'var(--fg-muted)' }}>Add a plan that isn't in the catalogue, with your own name, monthly price and covered tools.</p>}
            <div style={{ display: 'grid', gap: 12 }}>{customSubscriptions.map(sub => <div key={sub.subscriptionId} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div><h4>{sub.name} <Badge size="sm">Custom</Badge></h4><p style={{ color: 'var(--fg-muted)', fontSize: '0.8125rem' }}>{sub.tools.map(tool => TOOLS[tool]?.name ?? tool).join(', ')}</p></div>
                <strong>{fmtCurrency(sub.monthlyPrice)}/mo</strong>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Button variant="ghost" size="sm" aria-label={`Edit ${sub.name}`} disabled={saving} onClick={() => setEditingCustom(sub)}><Edit2 size={14} /> Edit</Button>
                <Button variant="ghost" size="sm" aria-label={`Stop tracking ${sub.name}`} disabled={saving} onClick={async () => { if (await onSaveCustom(sub, false) && editingCustom?.subscriptionId === sub.subscriptionId) setEditingCustom(undefined) }}><Trash2 size={14} /> Stop Tracking</Button>
              </div>
            </div>)}</div>
            <p style={{ color: 'var(--fg-muted)', fontSize: '0.8125rem', marginTop: 12 }}>Track the same invoice using either a catalogue plan or a custom plan, not both. Stopping tracking retains history and does not cancel your provider's subscription.</p>
          </section>
          <h3 style={{ marginBottom: 16 }}>Catalogue subscriptions</h3>
          {priceError && <p role="alert" style={{ color: 'var(--danger)', marginBottom: 16 }}>{priceError}</p>}
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
                           disabled={saving}
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
                        <Button size="sm" onClick={() => handleCustomPrice(catalog.id)} disabled={saving}>Save Invoice Price</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setCustomPrice('') }}>Cancel</Button>
                      </div>
                    )}
                    {!editingId && sub && (
                      <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setEditingId(catalog.id); setCustomPrice(sub.customPrice === undefined ? '' : String(sub.customPrice)); setPriceError(null) }}>
                        <Edit2 size={14} /> Custom Price
                      </Button>
                    )}
                  </div>

                  {sub && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <span style={{ fontSize: '0.8125rem' }}>Tools covered:</span>
                    {Object.entries(TOOLS).map(([toolId, tool]) => <label key={toolId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
                      <input type="checkbox" checked={sub.tools.includes(toolId)} disabled={saving} onChange={event => {
                        const selected = event.target.checked ? [...sub.tools, toolId] : sub.tools.filter(tool => tool !== toolId)
                        if (!selected.length) { setPriceError('Select at least one tool covered by the subscription.'); return }
                        void onSave({ ...sub, tools: selected })
                      }} />
                      {tool.name}
                    </label>)}
                    <Button variant="ghost" size="sm" disabled={saving} onClick={() => onSave(sub, false)}><Trash2 size={14} /> Stop Tracking</Button>
                  </div>}

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
                      <Button variant="ghost" size="sm" disabled={saving} onClick={() => handleTierChange(catalog.id, activeTier.id)}>
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
                <li>Stop Tracking ends future counting; it does not cancel your provider’s subscription</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PluginSettings() {
  const plugins = COLLECTORS

  return (
    <div>
      <Card style={{ marginBottom: 24 }}><CardHeader><CardTitle>Sign in once per machine</CardTitle><CardDescription>Use Node.js 22 or newer. Run the commands below from your clone.</CardDescription></CardHeader><CardContent>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 16 }}>{COLLECTOR_QUICKSTART}</pre>
        <p>Collector sign-in is separate from the website. Credentials are stored in a private local directory and refresh automatically. No OAuth secrets, prompts, code or transcripts belong in tool configuration.</p>
        <p style={{ marginTop: 12 }}><code>npm run collector -- status</code> checks local sign-in; <code>npm run collector -- status --refresh</code> verifies token renewal. The installer preserves existing settings and creates private backups. Codex requires one-time hook review.</p>
        <p style={{ marginTop: 12 }}><strong>Linux reboot/login autostart:</strong> after signing in, run <code>npm run collector -- autostart enable</code>. This installs a per-user systemd timer that retries private queued uploads every minute after login, including after reboot. It does not start the coding tools or create AI requests. <code>autostart status</code> verifies it; <code>autostart disable</code> turns it off.</p>
        <p style={{ marginTop: 12 }}>Short-lived access tokens refresh automatically on upload. Revoked/expired refresh sessions require collector login again; pending metrics are retained. Cursor still needs an explicit billing export, not a guessed live hook.</p>
        <a href="https://github.com/Joosibaeri/burnyourmoneywithslop/blob/master/docs/PLUGIN_INSTALL.md" target="_blank" rel="noopener noreferrer">Full installation and verification guide</a>
      </CardContent></Card>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20 }}>
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
                variant={plugin.id === 'cursor' ? 'info' : 'default'}
                size="sm"
              >
                {plugin.mode}
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
              <code>{plugin.command}</code>
            </div>
            <p style={{ color: 'var(--fg-muted)', fontSize: '0.8125rem' }}>{plugin.target}</p>
            <a href={`https://github.com/Joosibaeri/burnyourmoneywithslop/tree/master/plugins/${plugin.id}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" style={{ justifyContent: 'center' }}><ExternalLink size={16} /> View Collector Code</Button>
            </a>
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  )
}
