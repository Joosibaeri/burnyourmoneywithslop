import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { ArrowLeft, Users, DollarSign, Activity, TrendingUp, Share2, Copy, Check, Trash2, UserPlus, Mail } from 'lucide-react'
import { useState } from 'react'
import { getMockGroups, formatNumber, formatCurrency } from '@/lib/utils'

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const groups = getMockGroups()
  const group = groups.find(g => g.id === id)

  if (!group) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: 16 }}>Group not found</h1>
        <Button variant="outline" onClick={() => navigate('/groups')}>
          <ArrowLeft size={18} /> Back to Groups
        </Button>
      </div>
    )
  }

  const isMember = group.members.some(m => m.id === user?.id)
  const sortedMembers = [...group.members].sort((a, b) => b.spent - a.spent)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  const inviteLink = `${window.location.origin}/invite/${group.id}`

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteLink)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    // TODO: Send invite via Supabase
    console.log('Inviting:', inviteEmail)
    setShowInviteModal(false)
    setInviteEmail('')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/groups')}>
          <ArrowLeft size={18} /> Back
        </Button>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 4 }}>{group.name}</h1>
          <p style={{ color: 'var(--fg-muted)' }}>{group.description}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <CardTitle>Leaderboard</CardTitle>
                  <CardDescription>Ranked by total spending this month</CardDescription>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="sm">
                    <Share2 size={16} /> Share
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyLink}>
                    {copiedLink ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Leaderboard members={sortedMembers} currentUserId={user?.id || '1'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Comparison</CardTitle>
              <CardDescription>Spending trends across the group</CardDescription>
            </CardHeader>
            <CardContent>
              <GroupTrendChart members={group.members} />
            </CardContent>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>{group.memberCount} people in this group</CardDescription>
                </div>
                {isMember && (
                  <Button variant="outline" size="sm" onClick={() => setShowInviteModal(true)}>
                    <UserPlus size={16} /> Invite
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <MemberList members={group.members} currentUserId={user?.id || '1'} isOwner={group.members[0].id === user?.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Group Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <StatRow label="Total Group Spending" value={formatCurrency(group.totalSpent)} icon={DollarSign} color="var(--accent)" />
                <StatRow label="Total Tokens Used" value={formatNumber(group.totalTokens)} icon={Activity} color="#60a5fa" />
                <StatRow label="Average per Member" value={formatCurrency(group.totalSpent / group.memberCount)} icon={TrendingUp} color="#22c55e" />
                <StatRow label="Active Tools" value={`${new Set(group.members.flatMap(m => m.tools)).size} of 4`} icon={Users} color="#c084fc" />
              </div>
            </CardContent>
          </Card>

          {isMember && (
            <Card style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent)' }}>
              <CardHeader>
                <CardTitle>Invite Link</CardTitle>
                <CardDescription>Share this link with friends to join the group</CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      fontSize: '0.875rem',
                      fontFamily: 'JetBrains Mono, monospace',
                      background: 'var(--bg)',
                      color: 'var(--fg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  />
                  <Button variant="outline" onClick={handleCopyLink} size="sm">
                    {copiedLink ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {showInviteModal && (
        <Modal onClose={() => setShowInviteModal(false)} title="Invite Member">
          <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem' }}>
              Enter their GitHub username or email. They'll get a notification to join.
            </p>
            <Input
              label="GitHub Username or Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="@username or email@example.com"
              required
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setShowInviteModal(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Mail size={18} /> Send Invite
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Leaderboard({ members, currentUserId }: { members: Array<{ id: string; name: string; login: string; avatar: string; spent: number; tokens: number; tools: string[] }>; currentUserId: string }) {
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map((member, index) => {
        const isCurrentUser = member.id === currentUserId
        return (
          <div
            key={member.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: isCurrentUser ? 'var(--accent-bg)' : 'var(--bg)',
              border: `1px solid ${isCurrentUser ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div style={{
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: index < 3 ? 'var(--accent-bg)' : 'var(--bg-elevated)',
              border: `1px solid ${index < 3 ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '50%',
              fontWeight: 700,
              fontSize: index < 3 ? '1rem' : '0.875rem',
              color: index < 3 ? 'var(--accent)' : 'var(--fg-muted)',
            }}>
              {index < 3 ? medals[index] : `#${index + 1}`}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <img
                src={member.avatar || `https://github.com/${member.login}.png`}
                alt=""
                style={{ width: 32, height: 32, borderRadius: '50%' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                  {member.name === 'you' ? 'You' : `@${member.login}`}
                  {isCurrentUser && <Badge variant="accent" size="sm" style={{ marginLeft: 8 }}>You</Badge>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
                  {member.tools.length > 0 ? member.tools.join(', ') : 'No tools connected'}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 24, textAlign: 'right' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--accent)' }}>{formatCurrency(member.spent)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>Spent</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: '#60a5fa' }}>{formatNumber(member.tokens)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>Tokens</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GroupTrendChart({ members }: { members: Array<{ id: string; name: string; login: string; avatar: string; spent: number; tokens: number; tools: string[] }> }) {
  const colors = ['var(--accent)', '#60a5fa', '#22c55e', '#c084fc', '#f97316', '#ef4444']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const maxSpent = Math.max(...members.flatMap(m => {
    const base = m.spent / 6
    return months.map(() => Math.floor(base * (0.7 + Math.random() * 0.6)))
  }), 1)

  return (
    <div style={{ height: 200, position: 'relative' }}>
      <svg width="100%" height="100%">
        <defs>
          {members.slice(0, 5).map((member, i) => (
            <linearGradient key={member.id} id={`trend-${member.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[i]} stopOpacity={0.6} />
              <stop offset="100%" stopColor={colors[i]} stopOpacity={0.1} />
            </linearGradient>
          ))}
        </defs>
        {members.slice(0, 5).map((member, memberIndex) => {
          const base = member.spent / 6
          const data = months.map((_, i) => Math.floor(base * (0.7 + Math.random() * 0.6) * (1 + i * 0.05)))
          const points = data.map((val, i) => {
            const x = 60 + (i / (months.length - 1)) * 400
            const y = 200 - 30 - (val / maxSpent) * 150
            return `${x},${y}`
          }).join(' ')

          return (
            <g key={member.id} opacity={member.name === 'you' ? 1 : 0.7}>
              <path
                d={`M${points} L${points.split(' ').reverse().map((p) => {
                  const [x] = p.split(',')
                  const y = 170
                  return `${x},${y}`
                }).join(' ')} Z`}
                fill={`url(#trend-${member.id})`}
              />
              <polyline
                points={points}
                fill="none"
                stroke={colors[memberIndex]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}
        {months.map((month, i) => {
          const x = 60 + (i / (months.length - 1)) * 400
          return (
            <text key={month} x={x} y={185} textAnchor="middle" fill="var(--fg-subtle)" fontSize="11" fontFamily="Space Grotesk">
              {month}
            </text>
          )
        })}
      </svg>
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '8px 16px',
        paddingTop: 8,
        fontSize: '0.7rem',
      }}>
        {members.slice(0, 5).map((member, i) => (
          <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fg-muted)' }}>
            <div style={{ width: 10, height: 10, background: colors[i], borderRadius: 2 }} />
            <span>{member.name === 'you' ? 'You' : `@${member.login}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberList({ members, currentUserId, isOwner }: { members: Array<{ id: string; name: string; login: string; avatar: string; spent: number; tokens: number; tools: string[] }>; currentUserId: string; isOwner: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map((member) => {
        const isCurrentUser = member.id === currentUserId
        return (
          <div
            key={member.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <img
              src={member.avatar || `https://github.com/${member.login}.png`}
              alt=""
              style={{ width: 32, height: 32, borderRadius: '50%' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>{member.name === 'you' ? 'You' : `@${member.login}`}</span>
                {isCurrentUser && <Badge variant="accent" size="sm">You</Badge>}
                {member.id === members[0].id && <Badge variant="info" size="sm">Owner</Badge>}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
                {member.tools.join(', ') || 'No tools connected'}
              </div>
            </div>
            {!isCurrentUser && isOwner && (
              <Button variant="ghost" size="sm">
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatRow({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ComponentType<{ size?: number; color?: string }>; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}15`,
        borderRadius: 'var(--radius-sm)',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.8125rem', color: 'var(--fg-muted)' }}>{label}</div>
        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{value}</div>
      </div>
    </div>
  )
}

function Modal({ isOpen = true, onClose, title, children }: { isOpen?: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        padding: 24,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--fg-muted)',
            background: 'transparent',
          }} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}