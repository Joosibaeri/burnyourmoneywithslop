import { Link, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DollarSign, Activity, Users, ArrowLeft, ExternalLink, Calendar } from 'lucide-react'
import { useSupabase } from '@/contexts/SupabaseContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatNumber, formatCurrencyPrecise as formatCurrency, getMockStats, getMockMonthlyData } from '@/lib/utils'
import { useCallback, useState } from 'react'
import { aggregateUsage, getDemoGroups, githubLogin as getGithubLogin, loadGroups, loadUsage, type GroupData, type ProfileRecord } from '@/lib/data'
import { useAsyncData } from '@/hooks/useAsyncData'

export function Profile({ username }: { username: string }) {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const { isDemoMode, supabase } = useSupabase()
  const viewerId = currentUser?.id

  const load = useCallback(async () => {
    if (isDemoMode) {
      const demoGroups = getDemoGroups()
      const member = demoGroups.flatMap(group => group.members).find(member => member.login.toLowerCase() === username.toLowerCase())
      const monthly = getMockMonthlyData()
      return {
        profile: { id: member?.id ?? 'demo', github_login: username, display_name: member?.name === 'you' ? 'Demo User' : member?.name ?? username, avatar_url: member?.avatar ?? '', stats_public: true, created_at: null } as ProfileRecord,
        stats: { totalSpent: monthly.reduce((sum, month) => sum + month.spent + month.estimated, 0), totalTokens: monthly.reduce((sum, month) => sum + month.tokens, 0), totalEstimated: 0, unknownCostEvents: 0, toolBreakdown: getMockStats().toolBreakdown.map(tool => ({ ...tool, unknownCostEvents: 0 })), monthlyData: monthly },
        groups: demoGroups.filter(group => group.members.some(member => member.login.toLowerCase() === username.toLowerCase())), monthlyData: monthly,
      }
    }
    if (!/^[a-z\d][a-z\d-]{0,38}$/i.test(username)) return null
    const { data, error: profileError } = await supabase.from('profiles').select('id, github_login, display_name, avatar_url, stats_public, created_at').eq('github_login', username.toLowerCase()).maybeSingle()
    if (profileError) throw new Error(profileError.message)
    if (!data) return null
    const [usage, visibleGroups] = await Promise.all([
      loadUsage(supabase, [data.id]),
      viewerId ? loadGroups(supabase, viewerId) : Promise.resolve([]),
    ])
    const summary = aggregateUsage(usage)
    return { profile: data as ProfileRecord, stats: summary, monthlyData: summary.monthlyData.slice(-12), groups: visibleGroups.filter(group => group.members.some(member => member.id === data.id)) }
  }, [username, viewerId, isDemoMode, supabase])
  const { data, loading, error } = useAsyncData(`profile:${username.toLowerCase()}:${viewerId ?? 'anonymous'}:${isDemoMode}`, load)
  const { profile, stats, groups, monthlyData } = data ?? { profile: null, stats: null, groups: [], monthlyData: [] }
  const isOwnProfile = isDemoMode ? getGithubLogin(currentUser).toLowerCase() === username.toLowerCase() : !!viewerId && viewerId === profile?.id

  if (error) return <Card><CardTitle>Could not load profile</CardTitle><p role="alert">{error}</p></Card>

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: 16 }}>Profile not found</h1>
        <p style={{ color: 'var(--fg-muted)', marginBottom: 24 }}>No user found with username @{username}</p>
        {isOwnProfile && (
          <Button onClick={() => navigate('/onboarding')}>
            Complete your profile
          </Button>
        )}
      </div>
    )
  }

  const githubLogin = profile.github_login || username
  const githubName = profile.display_name || githubLogin
  const avatarUrl = profile.avatar_url || `https://github.com/${githubLogin}.png`
  const totalCost = (stats?.totalSpent ?? 0) + (stats?.totalEstimated ?? 0)
  const totalTokens = stats?.totalTokens || 0
  const statsVisible = profile.stats_public || isOwnProfile || !!currentUser && groups.some(group => group.members.some(member => member.id === currentUser.id))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> Home
        </Button>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 4 }}>
            {githubName}
          </h1>
          <p style={{ color: 'var(--fg-muted)' }}>
            @{githubLogin} · {isOwnProfile ? 'Your profile' : 'Public profile'}
          </p>
        </div>
      </div>

      {isDemoMode && <p style={{ marginBottom: 20, color: 'var(--fg-muted)' }}>Demo profile—sample data only.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        {/* Profile Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardContent style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
              <img
                src={avatarUrl}
                alt={githubLogin}
                style={{ width: 100, height: 100, borderRadius: '50%', border: '3px solid var(--accent)' }}
              />
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{githubName}</h2>
                <p style={{ color: 'var(--accent)', fontSize: '1.125rem', fontWeight: 500 }}>@{githubLogin}</p>
              </div>
              <a
                href={`https://github.com/${githubLogin}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)', fontSize: '0.875rem', textDecoration: 'none' }}
              >
                <ExternalLink size={16} />
                <span>View on GitHub</span>
              </a>
              {isOwnProfile && (
                <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
                  Edit Profile
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <StatItem icon={DollarSign} label="Cost" value={statsVisible ? formatCurrency(totalCost) : 'Private'} color="var(--accent)" />
              <StatItem icon={Activity} label="Total Tokens" value={statsVisible ? formatNumber(totalTokens) : 'Private'} color="#60a5fa" />
              <StatItem icon={Users} label={isOwnProfile ? 'Groups' : 'Shared Groups'} value={String(groups.length)} color="#22c55e" />
              <StatItem icon={Calendar} label="Member Since" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'} color="#c084fc" />
              {statsVisible && !!stats?.unknownCostEvents && <p style={{ fontSize: '0.8125rem', color: 'var(--fg-muted)' }}>{stats.unknownCostEvents} requests have unavailable pricing; displayed cost is partial.</p>}
            </CardContent>
          </Card>

          {isOwnProfile && (
            <Card style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent)' }}>
              <CardHeader>
                <CardTitle>Profile Visibility</CardTitle>
                <CardDescription>
                   <span style={{ color: 'var(--accent)' }}>{profile.stats_public ? 'Your statistics are public' : 'Statistics are private except to group members'}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p style={{ color: 'var(--accent)', fontSize: '0.875rem' }}>
                   Profile: <Link to={`/@${githubLogin}`}>/@{githubLogin}</Link>. <Link to="/settings">Manage visibility in Settings</Link>.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <CardTitle>Monthly Cost</CardTitle>
                  <CardDescription>Combined usage and subscription costs by month</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {statsVisible ? <ProfileCostChart data={monthlyData} /> : <p>Statistics are private. Join a group together to compare usage.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tools</CardTitle>
              <CardDescription>Tokens and costs per tool; subscription cost is split evenly across tools</CardDescription>
            </CardHeader>
            <CardContent>
              {statsVisible ? <ProfileToolBreakdown tools={stats?.toolBreakdown ?? []} /> : <p>Statistics are private.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                   <CardTitle>{isOwnProfile ? 'Groups' : 'Shared Private Groups'}</CardTitle>
                   <CardDescription>Only groups you belong to are visible</CardDescription>
                </div>
                {isOwnProfile && (
                  <Button variant="outline" size="sm" onClick={() => navigate('/groups')}>
                    Manage Groups
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {groups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fg-muted)' }}>
                  <Users size={32} style={{ marginBottom: 12, color: 'var(--fg-subtle)' }} />
                   <p style={{ marginBottom: 16 }}>{isOwnProfile ? 'You haven\'t joined any groups yet' : 'Group membership is private. No shared groups are visible.'}</p>
                  {isOwnProfile && (
                    <Button onClick={() => navigate('/groups')}>
                      <Users size={18} /> Create or Join a Group
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                   {groups.map(group => (
                    <Link key={group.id} to={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        padding: '16px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'all var(--transition)',
                      }}>
                        <h4 style={{ fontWeight: 600, marginBottom: 8 }}>{group.name}</h4>
                        <p style={{ color: 'var(--fg-muted)', fontSize: '0.8125rem', marginBottom: 12 }}>{group.description}</p>
                        <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
                          <span><Users size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {group.memberCount} members</span>
                          <span><DollarSign size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {formatCurrency(group.totalSpent)} cost this month</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isOwnProfile && (
            <Card>
              <CardHeader>
                <CardTitle>Add Friends</CardTitle>
                <CardDescription>Invite friends to compare usage</CardDescription>
              </CardHeader>
              <CardContent>
                <FriendInviteForm groups={groups} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function StatItem({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
      <div style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}15`,
        borderRadius: 'var(--radius-sm)',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>{label}</div>
        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{value}</div>
      </div>
    </div>
  )
}

function ProfileCostChart({ data }: { data: Array<{ month: string; spent: number; tokens: number; estimated: number }> }) {
  if (!data.length) return <p style={{ color: 'var(--fg-muted)' }}>No usage recorded yet.</p>
  const maxSpent = Math.max(...data.map(d => d.spent + d.estimated), 1)
  const height = 200
  const paddingTop = 20
  const paddingBottom = 30
  const chartHeight = height - paddingTop - paddingBottom
  const barWidth = 40
  const gap = (data.length > 1) ? (500 - barWidth * data.length) / (data.length - 1) : 0

  return (
    <div>
      <svg width="100%" height={height} viewBox="0 0 580 200" style={{ display: 'block' }} aria-label="Cost by month">
        <defs>
          <linearGradient id="spentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.8} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.2} />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const x = i * (barWidth + gap) + 40
          const costHeight = ((d.spent + d.estimated) / maxSpent) * chartHeight
          const y = height - paddingBottom - costHeight

          return (
            <g key={d.month}>
              <rect
                x={x + barWidth / 4}
                y={y}
                width={barWidth / 2}
                height={costHeight}
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
          <span>Cost</span>
        </div>
      </div>
    </div>
  )
}

function ProfileToolBreakdown({ tools }: { tools: Array<{ name: string; tokens: number; cost: number; color: string; unknownCostEvents?: number }> }) {
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

function FriendInviteForm({ groups }: { groups: GroupData[] }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
  const [message, setMessage] = useState('')
  const group = groups.find(group => group.id === groupId)
  const inviteLink = group?.inviteCode ? `${window.location.origin}/invite/${encodeURIComponent(group.inviteCode)}` : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setMessage('Invite link copied. Share it with your friend; they must confirm joining.') }
    catch { setMessage('Could not copy. Select and copy the link manually.') }
  }
  if (!groups.length) return <p><Link to="/groups?create=1">Create a group</Link> to get a private invitation link for your friends.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <select aria-label="Group to invite friends to" value={groupId} onChange={event => { setGroupId(event.target.value); setMessage('') }}>
        {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Friend invitation link" readOnly value={inviteLink} onFocus={event => event.target.select()} style={{ flex: 1, minWidth: 0, padding: 12 }} />
        <Button onClick={copy} disabled={!inviteLink}>Copy Invite</Button>
      </div>
      {message && <p role="status">{message}</p>}
      <p style={{ color: 'var(--fg-subtle)', fontSize: '0.75rem' }}>No automatic notification is sent. Anyone with this link can join after signing in, so share it privately.</p>
    </div>
  )
}
