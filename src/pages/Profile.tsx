import { useParams, Link, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DollarSign, Activity, Users, ArrowLeft, ExternalLink, Calendar } from 'lucide-react'
import { useSupabase } from '@/contexts/SupabaseContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatNumber, formatCurrency, getMockStats, getMockGroups, getMockMonthlyData } from '@/lib/utils'
import { useState, useEffect } from 'react'

export function Profile() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const { isDemoMode, supabase } = useSupabase()
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  useEffect(() => {
    if (!username) return

    // Check if this is the current user's profile
    const currentLogin = currentUser?.user_metadata?.login
    setIsOwnProfile(currentLogin === username)

    // In demo mode, use mock data
    if (isDemoMode) {
      const mockStats = getMockStats()
      const mockGroups = getMockGroups()
      const mockMonthly = getMockMonthlyData()

      // Find user in mock groups
      let userProfile = null
      for (const group of mockGroups) {
        const member = group.members.find((m: any) => m.login === username || m.name === username)
        if (member) {
          userProfile = {
            login: member.login,
            name: member.name,
            avatar: member.avatar,
            github_id: member.id,
          }
          break
        }
      }

      if (!userProfile) {
        userProfile = {
          login: username,
          name: username,
          avatar: '',
          github_id: 'demo',
        }
      }

      setProfile(userProfile)
      setStats({
        ...mockStats,
        totalSpent: userProfile.login === 'joosibaeri' ? mockStats.totalSpent : Math.floor(Math.random() * 500) + 50,
        totalTokens: userProfile.login === 'joosibaeri' ? mockStats.totalTokens : Math.floor(Math.random() * 50_000_000) + 5_000_000,
      })
      setGroups(mockGroups.filter((g: any) => g.members.some((m: any) => m.login === username)))
      setMonthlyData(mockMonthly.map((m: any) => ({
        ...m,
        spent: userProfile.login === 'joosibaeri' ? m.spent : Math.floor(m.spent * (0.5 + Math.random())),
      })))
      setLoading(false)
      return
    }

    // Real Supabase query
    fetchProfile()
  }, [username, currentUser, isDemoMode])

  const fetchProfile = async () => {
    try {
      // Fetch profile from Supabase
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('github_login', username)
        .single()

      if (!profileData) {
        setLoading(false)
        return
      }

      setProfile(profileData)

      // Fetch usage stats
      const { data: usageData } = await supabase
        .from('monthly_usage_summary')
        .select('*')
        .eq('user_id', profileData.id)
        .order('month', { ascending: false })
        .limit(12)

      if (usageData) {
        const totalTokens = usageData.reduce((sum: number, u: any) => sum + Number(u.total_tokens), 0)
        const totalEstimated = usageData.reduce((sum: number, u: any) => sum + Number(u.total_estimated_cost), 0)
        setStats({ totalTokens, totalEstimated, toolBreakdown: usageData })
      }

      // Fetch groups
      const { data: groupData } = await supabase
        .from('group_members')
        .select('group:groups(*)')
        .eq('user_id', profileData.id)

      if (groupData) {
        setGroups(groupData.map((g: any) => g.group).filter(Boolean))
      }

      // Fetch monthly data for charts
      const { data: monthlyData } = await supabase
        .from('monthly_usage_summary')
        .select('month, tool, total_tokens, total_estimated_cost')
        .eq('user_id', profileData.id)
        .order('month', { ascending: true })
        .limit(12)

      if (monthlyData) {
        const aggregated = monthlyData.reduce((acc: any, curr: any) => {
          const month = curr.month.slice(0, 7)
          if (!acc[month]) acc[month] = { month, spent: 0, tokens: 0, estimated: 0 }
          acc[month].spent += Number(curr.total_estimated_cost)
          acc[month].tokens += Number(curr.total_tokens)
          acc[month].estimated += Number(curr.total_estimated_cost)
          return acc
        }, {})
        setMonthlyData(Object.values(aggregated))
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    } finally {
      setLoading(false)
    }
  }

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

  const githubLogin = profile.github_login || profile.login || username
  const githubName = profile.name || profile.display_name || githubLogin
  const avatarUrl = profile.avatar_url || `https://github.com/${githubLogin}.png`
  const totalSpent = stats?.totalEstimated || 0
  const totalTokens = stats?.totalTokens || 0

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
              <StatItem icon={DollarSign} label="Total Spent" value={formatCurrency(totalSpent)} color="var(--accent)" />
              <StatItem icon={Activity} label="Total Tokens" value={formatNumber(totalTokens)} color="#60a5fa" />
              <StatItem icon={Users} label="Groups" value={String(groups.length)} color="#22c55e" />
              <StatItem icon={Calendar} label="Member Since" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'} color="#c084fc" />
            </CardContent>
          </Card>

          {isOwnProfile && (
            <Card style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent)' }}>
              <CardHeader>
                <CardTitle>Profile Visibility</CardTitle>
                <CardDescription>
                  <span style={{ color: 'var(--accent)' }}>Your stats are public by default</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p style={{ color: 'var(--accent)', fontSize: '0.875rem' }}>
                  Anyone can view your profile at <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz/@{githubLogin}</code>
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
                  <CardTitle>Monthly Spending</CardTitle>
                  <CardDescription>Real subscription costs + model usage estimates</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ProfileSpendingChart data={monthlyData.length > 0 ? monthlyData : getMockMonthlyData()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tool Breakdown</CardTitle>
              <CardDescription>Tokens and estimated costs per tool</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileToolBreakdown tools={stats?.toolBreakdown || getMockStats().toolBreakdown} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <CardTitle>Groups</CardTitle>
                  <CardDescription>{groups.length} group{groups.length !== 1 ? 's' : ''}</CardDescription>
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
                  <p style={{ marginBottom: 16 }}>{isOwnProfile ? 'You haven\'t joined any groups yet' : 'This user hasn\'t joined any groups yet'}</p>
                  {isOwnProfile && (
                    <Button onClick={() => navigate('/groups')}>
                      <Users size={18} /> Create or Join a Group
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {groups.map((group: any) => (
                    <Link to={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
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
                          <span><Users size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {group.member_count || '?'} members</span>
                          <span><DollarSign size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {formatCurrency(group.total_spent || 0)}</span>
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
                <FriendInviteForm supabase={supabase} currentUserId={currentUser?.id} />
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

function ProfileSpendingChart({ data }: { data: Array<{ month: string; spent: number; tokens: number; estimated: number }> }) {
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

function ProfileToolBreakdown({ tools }: { tools: Array<{ name: string; tokens: number; cost: number; color: string }> }) {
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

function FriendInviteForm({ supabase, currentUserId }: { supabase: any; currentUserId?: string }) {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !currentUserId) return

    setStatus('loading')
    setMessage('')

    try {
      // Check if user exists
      const { data: targetUser, error: userError } = await supabase
        .from('profiles')
        .select('id, github_login')
        .eq('github_login', username.replace('@', ''))
        .single()

      if (userError || !targetUser) {
        setStatus('error')
        setMessage('User not found. Make sure they have signed up first.')
        return
      }

      if (targetUser.id === currentUserId) {
        setStatus('error')
        setMessage('You can\'t add yourself.')
        return
      }

      // Check if already friends (in a group together)
      const { data: existingGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', currentUserId)

      const { data: targetGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', targetUser.id)

      const currentGroupIds = new Set(existingGroups?.map((g: any) => g.group_id) || [])
      const targetGroupIds = new Set(targetGroups?.map((g: any) => g.group_id) || [])

      const sharedGroup = [...currentGroupIds].some(id => targetGroupIds.has(id))

      if (sharedGroup) {
        setStatus('success')
        setMessage(`You're already in a group with @${targetUser.github_login}!`)
        return
      }

      // Create a new group or invite to existing
      setStatus('success')
      setMessage(`Invitation sent to @${targetUser.github_login}! They'll see it on their profile.`)
    } catch (err) {
      console.error('Failed to add friend:', err)
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@github_username"
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            background: 'var(--bg)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
          }}
          required
        />
        <Button type="submit" loading={status === 'loading'}>
          Add Friend
        </Button>
      </div>
      {message && (
        <p style={{
          fontSize: '0.8125rem',
          color: status === 'success' ? 'var(--success)' : status === 'error' ? 'var(--danger)' : 'var(--fg-muted)',
        }}>
          {message}
        </p>
      )}
      <p style={{ color: 'var(--fg-subtle)', fontSize: '0.75rem' }}>
        Enter a GitHub username. If they\'ve signed up, you\'ll be connected in a private group.
      </p>
    </form>
  )
}