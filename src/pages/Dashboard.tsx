import { useAuth } from '@/contexts/AuthContext'
import { Link } from 'react-router-dom'
import { useSupabase } from '@/contexts/SupabaseContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Plus, TrendingUp, DollarSign, Users, Activity, Target, ArrowUpRight, User } from 'lucide-react'
import { useState, useEffect } from 'react'
import { formatNumber, formatCurrency, getMockStats, getMockMonthlyData } from '@/lib/utils'

export function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const { isDemoMode } = useSupabase()
  const [stats] = useState(getMockStats())
  const [monthlyData] = useState(getMockMonthlyData())
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month')

  useEffect(() => {
    if (!authLoading && !isDemoMode) {
      // TODO: Fetch real stats from Supabase
    }
  }, [authLoading, isDemoMode])

  const periodData = monthlyData.slice(- (selectedPeriod === 'month' ? 4 : selectedPeriod === 'quarter' ? 12 : 24))

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8 }}>
          Welcome back, {user?.user_metadata?.login || user?.email?.split('@')[0] || 'friend'} 👋
        </h1>
        <p style={{ color: 'var(--fg-muted)' }}>
          Here's your AI coding spending overview
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 20,
        marginBottom: 32,
      }}>
        <StatCard
          title="Total Spent"
          value={formatCurrency(stats.totalSpent)}
          change={stats.spentChange}
          icon={DollarSign}
          iconColor="var(--accent)"
          subtitle="This month"
        />
        <StatCard
          title="Total Tokens"
          value={formatNumber(stats.totalTokens)}
          change={stats.tokensChange}
          icon={Activity}
          iconColor="#60a5fa"
          subtitle="Input + Output"
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
                  <CardDescription>Real subscription costs + model usage estimates</CardDescription>
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
                  <CardDescription>Monthly recurring costs</CardDescription>
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
              <Button variant="outline" style={{ justifyContent: 'flex-start' }}>
                <Plus size={18} /> Create a Group
              </Button>
              <Button variant="ghost" style={{ justifyContent: 'flex-start' }}>
                <ArrowUpRight size={18} /> Invite Friends
              </Button>
              <Button variant="ghost" style={{ justifyContent: 'flex-start' }}>
                <Activity size={18} /> Connect a Tool
              </Button>
              <Link to={`/@${user?.user_metadata?.login || 'profile'}`} style={{ textDecoration: 'none' }}>
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
                    <a href="/settings" style={{ color: 'var(--accent)', fontWeight: 600 }}>Configure now →</a>
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
  const maxSpent = Math.max(...data.map(d => d.spent), 1)
  const height = 200
  const paddingTop = 20
  const paddingBottom = 30
  const chartHeight = height - paddingTop - paddingBottom
  const barWidth = 40
  const gap = (data.length > 1) ? (500 - barWidth * data.length) / (data.length - 1) : 0

  return (
    <div style={{ height, position: 'relative' }}>
      <svg width="100%" height="100%" style={{ display: 'block' }}>
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
                x={x}
                y={estimatedY}
                width={barWidth}
                height={estimatedHeight}
                fill="url(#estimatedGradient)"
                rx={4}
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
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
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        paddingTop: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
          <div style={{ width: 12, height: 12, background: 'url(#spentGradient)', borderRadius: 2 }} />
          <span>Real Cost</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
          <div style={{ width: 12, height: 12, background: 'url(#estimatedGradient)', borderRadius: 2 }} />
          <span>Estimated</span>
        </div>
      </div>
    </div>
  )
}

function ToolBreakdown({ tools }: { tools: Array<{ name: string; tokens: number; cost: number; color: string }> }) {
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
              <span style={{ color: 'var(--fg-muted)' }}>{formatCurrency(tool.cost)}</span>
            </div>
            <div style={{
              height: 6,
              background: 'var(--bg)',
              borderRadius: 3,
              overflow: 'hidden',
              marginTop: 4,
            }}>
              <div style={{
                width: `${(tool.tokens / totalTokens) * 100}%`,
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
              {((tool.tokens / totalTokens) * 100).toFixed(1)}%
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

function SubscriptionList({ subscriptions }: { subscriptions: Array<{ name: string; tier: string; cost: number; tools: string[]; active: boolean }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {subscriptions.map((sub) => (
        <div key={sub.name} style={{
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
        <span>Monthly Total</span>
        <span>{formatCurrency(subscriptions.filter(s => s.active).reduce((sum, s) => sum + s.cost, 0))}</span>
      </div>
    </div>
  )
}