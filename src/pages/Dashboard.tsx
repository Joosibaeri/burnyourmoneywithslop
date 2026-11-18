import { useAuth } from '@/contexts/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import { useSupabase } from '@/contexts/SupabaseContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Plus, TrendingUp, DollarSign, Users, Activity, Target, ArrowUpRight, User } from 'lucide-react'
import { useCallback, useState } from 'react'
import { formatNumber, formatCurrencyPrecise as formatCurrency, getMockStats, getMockMonthlyData } from '@/lib/utils'
import { aggregateUsage, dashboardStats, emptyStats, githubLogin, loadCustomSubscriptions, loadSubscriptions, loadUsage, recentUsageMonths, type DisplaySubscription } from '@/lib/data'
import { useAsyncData } from '@/hooks/useAsyncData'

export function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const { isDemoMode, supabase } = useSupabase()
  const navigate = useNavigate()
  const userId = user?.id
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month')

  const load = useCallback(async () => {
    if (!userId) throw new Error('Sign in to load usage.')
    const [usage, subscriptions, customSubscriptions, membership] = await Promise.all([
      loadUsage(supabase, [userId]), loadSubscriptions(supabase, userId),
      loadCustomSubscriptions(supabase, userId),
      supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    if (membership.error) throw new Error(membership.error.message)
    return { stats: dashboardStats(usage, subscriptions, membership.count ?? 0, new Date(), customSubscriptions), monthlyData: aggregateUsage(usage).monthlyData }
  }, [supabase, userId])
  const { data, loading, error } = useAsyncData(authLoading || isDemoMode || !userId ? null : `dashboard:${userId}`, load)
  const stats = isDemoMode ? { ...getMockStats(), totalEstimated: 202, unknownCostEvents: 0 } : data?.stats ?? emptyStats()
  const monthlyData = isDemoMode ? getMockMonthlyData() : data?.monthlyData ?? []

  if (loading || authLoading) return <p role="status">Loading your usage…</p>
  if (error) return <Card><CardTitle>Could not load dashboard</CardTitle><p role="alert">{error}</p><Button onClick={() => window.location.reload()}>Retry</Button></Card>

  const periodData = isDemoMode ? monthlyData.slice(- (selectedPeriod === 'month' ? 1 : selectedPeriod === 'quarter' ? 3 : 12)) : recentUsageMonths(monthlyData, selectedPeriod === 'month' ? 1 : selectedPeriod === 'quarter' ? 3 : 12)

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8 }}>
          Welcome back, {githubLogin(user) || 'friend'} 👋
        </h1>
        <p style={{ color: 'var(--fg-muted)' }}>
          Here's your AI coding spending overview
        </p>
      </div>

      {!isDemoMode && stats.totalTokens === 0 && <p style={{ marginBottom: 24, color: 'var(--fg-muted)' }}>No usage recorded this month. <Link to="/settings?tab=subscriptions">Choose your subscriptions</Link> and <Link to="/settings?tab=plugins">install a tool collector</Link> to get started.</p>}
      {!!stats.unknownCostEvents && <p style={{ marginBottom: 24, color: 'var(--fg-muted)' }}>Model estimates are incomplete: {stats.unknownCostEvents} requests have missing or hidden cost. Unavailable pricing is not free usage.</p>}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 20,
        marginBottom: 32,
      }}>
        <StatCard
          title="Real Spending"
          value={formatCurrency(stats.totalSpent)}
          change={stats.spentChange}
          icon={DollarSign}
          iconColor="var(--accent)"
          subtitle="Recorded subscription/invoice prices · UTC month"
        />
        <StatCard
          title="Total Tokens"
          value={formatNumber(stats.totalTokens)}
          change={stats.tokensChange}
          icon={Activity}
          iconColor="#60a5fa"
          subtitle="All reported token categories"
        />
        <StatCard
          title="Active Tools"
          value={String(stats.activeTools)}
          change={null}
          icon={Target}
          iconColor="#c084fc"
          subtitle="Of 4 supported"
        />
        <StatCard
          title="Groups"
          value={String(stats.groupCount)}
          change={null}
          icon={Users}
          iconColor="#22c55e"
          subtitle={stats.groupCount === 1 ? 'group' : 'groups'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <CardTitle>Monthly Spending</CardTitle>
                  <CardDescription>Real subscription costs and model estimates shown separately</CardDescription>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['month', 'quarter', 'year'] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => setSelectedPeriod(period)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: selectedPeriod === period ? 'var(--bg)' : 'var(--fg-muted)',
                        background: selectedPeriod === period ? 'var(--accent)' : 'transparent',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SpendingChart data={periodData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <CardTitle>Tool Breakdown</CardTitle>
                  <CardDescription>Tokens and estimated costs per tool</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ToolBreakdown tools={stats.toolBreakdown} />
            </CardContent>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <CardTitle>Active Subscriptions</CardTitle>
                  <CardDescription>Selected prices; counted only in months with relevant usage</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SubscriptionList subscriptions={stats.subscriptions} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Button variant="outline" onClick={() => navigate('/groups?create=1')} style={{ justifyContent: 'flex-start' }}>
                <Plus size={18} /> Create a Group
              </Button>
              <Button variant="ghost" onClick={() => navigate('/groups')} style={{ justifyContent: 'flex-start' }}>
                <ArrowUpRight size={18} /> Invite Friends
              </Button>
              <Button variant="ghost" onClick={() => navigate('/settings?tab=plugins')} style={{ justifyContent: 'flex-start' }}>
                <Activity size={18} /> Connect a Tool
              </Button>
              <Link to={`/@${githubLogin(user) || 'joosibaeri'}`} style={{ textDecoration: 'none' }}>
                <Button variant="ghost" style={{ justifyContent: 'flex-start' }}>
                  <User size={18} /> View Your Profile
                </Button>
              </Link>
            </CardContent>
          </Card>

          {isDemoMode && (
            <Card style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent)' }}>
              <CardHeader>
                <CardTitle>Demo Mode</CardTitle>
                <CardDescription>
                  <span style={{ color: 'var(--accent)' }}>
                    Connect Supabase to start tracking real usage.{' '}
                    <a href="https://github.com/Joosibaeri/burnyourmoneywithslop#development" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>Configuration guide →</a>
                  </span>
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor,
  subtitle,
}: {
  title: string
  value: string
  change: { value: number; positive: boolean } | null
  icon: React.ComponentType<{ size?: number; color?: string }>
  iconColor: string
  subtitle: string
}) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ color: 'var(--fg-muted)', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 4 }}>
            {title}
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--fg)' }}>{value}</p>
          {subtitle && (
            <p style={{ color: 'var(--fg-subtle)', fontSize: '0.8125rem', marginTop: 4 }}>{subtitle}</p>
          )}
        </div>
        <div style={{
          width: 48, height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${iconColor}15`,
          borderRadius: 'var(--radius-sm)',
        }}>
          <Icon size={24} color={iconColor} />
        </div>
      </div>
      {change && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingUp
            size={14}
            color={change.positive ? 'var(--success)' : 'var(--danger)'}
          />
          <span style={{
            color: change.positive ? 'var(--success)' : 'var(--danger)',
            fontSize: '0.8125rem',
            fontWeight: 600,
          }}>
            {change.positive ? '+' : ''}{change.value.toFixed(1)}%
          </span>
          <span style={{ color: 'var(--fg-subtle)', fontSize: '0.8125rem' }}>vs last period</span>
        </div>
      )}
    </Card>
  )
}

function SpendingChart({ data }: { data: Array<{ month: string; spent: number; tokens: number; estimated: number }> }) {
  if (!data.length) return <p style={{ color: 'var(--fg-muted)' }}>No usage recorded yet.</p>
  const maxSpent = Math.max(...data.flatMap(d => [d.spent, d.estimated]), 1)
  const height = 200
  const paddingTop = 20
  const paddingBottom = 30
  const chartHeight = height - paddingTop - paddingBottom
  const barWidth = 40
  const gap = (data.length > 1) ? (500 - barWidth * data.length) / (data.length - 1) : 0

  return (
    <div>
      <svg width="100%" height={height} viewBox="0 0 580 200" style={{ display: 'block' }} aria-label="Real spending and estimated cost by month">
        <defs>
          <linearGradient id="spentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.8} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.2} />
          </linearGradient>
          <linearGradient id="estimatedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const x = i * (barWidth + gap) + 40
          const spentHeight = (d.spent / maxSpent) * chartHeight
          const estimatedHeight = (d.estimated / maxSpent) * chartHeight
          const y = height - paddingBottom - spentHeight
          const estimatedY = height - paddingBottom - estimatedHeight

          return (
            <g key={d.month}>
              <rect
                x={x + barWidth / 2}
                y={estimatedY}
                width={barWidth / 2 - 2}
                height={estimatedHeight}
                fill="url(#estimatedGradient)"
                rx={4}
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={x}
                y={y}
                width={barWidth / 2 - 2}
                height={spentHeight}
                fill="url(#spentGradient)"
                rx={4}
              />
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fill="var(--fg-subtle)"
                fontSize="11"
                fontFamily="Space Grotesk"
              >
                {d.month}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        paddingTop: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
          <div style={{ width: 12, height: 12, background: 'var(--accent)', borderRadius: 2 }} />
          <span>Real Cost</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
          <div style={{ width: 12, height: 12, background: '#60a5fa', borderRadius: 2 }} />
          <span>Estimated</span>
        </div>
      </div>
    </div>
  )
}

function ToolBreakdown({ tools }: { tools: Array<{ name: string; tokens: number; cost: number; color: string; unknownCostEvents?: number }> }) {
  if (!tools.length) return <p style={{ color: 'var(--fg-muted)' }}>No tool usage recorded yet.</p>
  const totalTokens = tools.reduce((sum, t) => sum + t.tokens, 0)
  const totalCost = tools.reduce((sum, t) => sum + t.cost, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tools.map((tool) => (
        <div key={tool.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 10, height: 10,
            background: tool.color,
            borderRadius: '50%',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ fontWeight: 500 }}>{tool.name}</span>
              <span style={{ color: 'var(--fg-muted)' }}>{formatCurrency(tool.cost)}{tool.unknownCostEvents ? ' (partial)' : ''}</span>
            </div>
            <div style={{
              height: 6,
              background: 'var(--bg)',
              borderRadius: 3,
              overflow: 'hidden',
              marginTop: 4,
            }}>
              <div style={{
                width: `${(tool.tokens / Math.max(totalTokens, 1)) * 100}%`,
                height: '100%',
                background: tool.color,
                borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 80 }}>
            <div style={{ fontSize: '0.8125rem', color: 'var(--fg-subtle)' }}>
              {formatNumber(tool.tokens)} tokens
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
              {((tool.tokens / Math.max(totalTokens, 1)) * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      ))}
      <div style={{
        marginTop: 8,
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        fontWeight: 600,
      }}>
        <span>Total</span>
        <span>{formatCurrency(totalCost)} · {formatNumber(totalTokens)} tokens</span>
      </div>
    </div>
  )
}

function SubscriptionList({ subscriptions }: { subscriptions: DisplaySubscription[] }) {
  if (!subscriptions.length) return <Link to="/settings?tab=subscriptions">Select your subscriptions</Link>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {subscriptions.map((sub) => (
        <div key={sub.id ?? sub.name} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{
            width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: sub.active ? 'var(--success-bg)' : 'var(--bg-elevated)',
            border: `1px solid ${sub.active ? 'var(--success)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
          }}>
            <span style={{
              fontSize: '1.25rem',
              color: sub.active ? 'var(--success)' : 'var(--fg-subtle)',
            }}>{sub.active ? '✓' : '○'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{sub.name}</span>
              <Badge variant="subscription" size="sm">{sub.tier}</Badge>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', marginTop: 2 }}>
              {sub.tools.join(', ')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>{formatCurrency(sub.cost)}/mo</div>
            <div style={{ fontSize: '0.75rem', color: sub.active ? 'var(--success)' : 'var(--fg-subtle)' }}>
              {sub.active ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>
      ))}
      <div style={{
        marginTop: 8,
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        fontWeight: 700,
        fontSize: '1rem',
      }}>
        <span>Selected Monthly Total</span>
        <span>{formatCurrency(subscriptions.filter(s => s.active).reduce((sum, s) => sum + s.cost, 0))}</span>
      </div>
    </div>
  )
}
