import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { useGroups } from '@/hooks/useGroups'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ComparisonControls } from '@/components/UsageControls'
import { ComparisonTable } from '@/components/ComparisonTable'
import { TokenStats, TokenDefinitions } from '@/components/TokenStats'
import { ArrowLeft, Users, DollarSign, Activity, TrendingUp, Share2, Copy, Check, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { formatCurrencyPrecise as formatCurrency } from '@/lib/utils'
import { comparisonStatsForMonth, getDemoGroups, groupMembersForMonth, recentUsageMonths, setDemoGroups, type GroupData } from '@/lib/data'
import { comparisonLabel, comparisonRatio, comparisonValue, formatComparisonValue, rankMembers, sumComparisonStats, type ComparisonMetric, type ComparisonStats } from '@/lib/comparison'
import { DEFAULT_TOKEN_METRIC, formatTokenCount, tokenValue } from '@/lib/tokens'

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const { groups, loading, error, reload } = useGroups(id)
  const group = groups.find(g => g.id === id)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [metric, setMetric] = useState<ComparisonMetric>(DEFAULT_TOKEN_METRIC)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  if (loading) return <p role="status">Loading group…</p>
  if (error) return <Card><p role="alert">Could not load group: {error}</p><Button onClick={reload}>Retry</Button></Card>
  if (!group) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: 16 }}>Group not found or membership required</h1>
        <Button variant="outline" onClick={() => navigate('/groups')}>
          <ArrowLeft size={18} /> Back to Groups
        </Button>
      </div>
    )
  }

  const isMember = group.members.some(m => m.id === user?.id)
  const isOwner = group.ownerId === user?.id
  const sortedMembers = rankMembers(groupMembersForMonth(group, month), metric)
  const groupStats = sumComparisonStats(sortedMembers)
  const selectedUser = sortedMembers.find(member => member.id === user?.id)

  const inviteLink = `${window.location.origin}/invite/${encodeURIComponent(group.inviteCode ?? '')}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopiedLink(true)
      setActionError(null)
    } catch { setActionError('Could not copy the link. Select and copy it manually below.') }
  }

  const handleShare = async () => {
    if (!navigator.share) { await handleCopyLink(); return }
    try { await navigator.share({ title: group.name, url: inviteLink }) }
    catch (err) { if (!(err instanceof DOMException && err.name === 'AbortError')) setActionError('Could not share the invitation.') }
  }

  const removeMember = async (memberId: string) => {
    if (!window.confirm(memberId === user?.id ? 'Leave this group and stop sharing private statistics with its members?' : 'Remove this member from the group?')) return
    setSaving(true)
    setActionError(null)
    try {
      if (isDemoMode) {
        setDemoGroups(getDemoGroups().map(g => g.id === group.id ? { ...g, members: g.members.filter(m => m.id !== memberId), memberCount: g.memberCount - 1 } : g))
      } else {
        const { data, error: deleteError } = await supabase.from('group_members').delete()
          .eq('group_id', group.id).eq('user_id', memberId).select('user_id')
        if (deleteError) throw new Error(deleteError.message)
        if (!data?.length) throw new Error('The membership could not be removed.')
      }
      if (memberId === user?.id) navigate('/groups')
      else reload()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Could not remove member.') }
    finally { setSaving(false) }
  }

  const deleteGroup = async () => {
    if (!isOwner || !window.confirm(`Permanently delete “${group.name}” and its memberships? Usage records will not be deleted.`)) return
    setSaving(true)
    try {
      if (isDemoMode) setDemoGroups(getDemoGroups().filter(g => g.id !== group.id))
      else {
        const { data, error: deleteError } = await supabase.from('groups').delete().eq('id', group.id).select('id')
        if (deleteError) throw new Error(deleteError.message)
        if (!data?.length) throw new Error('The group could not be deleted.')
      }
      navigate('/groups')
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Could not delete group.') }
    finally { setSaving(false) }
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

      {actionError && <p role="alert" style={{ marginBottom: 20, color: 'var(--danger)' }}>{actionError}</p>}
      {isDemoMode && <p style={{ marginBottom: 20, color: 'var(--fg-muted)' }}>Demo group; no changes are sent to Supabase.</p>}

      <Card style={{ marginBottom: 24 }}>
        <ComparisonControls month={month} metric={metric} onMonthChange={setMonth} onMetricChange={setMetric} />
        <TokenDefinitions />
        {selectedUser && <p className="metric-help">Your rank: <strong>#{selectedUser.rank}</strong> of {sortedMembers.length} · {comparisonLabel(metric)} · {month === 'all' ? 'All recorded months' : `${month} UTC`}</p>}
      </Card>

      <div className="usage-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <div className="card-heading">
                <div>
                  <CardTitle>Leaderboard</CardTitle>
                  <CardDescription>Ranked by {comparisonLabel(metric)} · {month === 'all' ? 'All time' : `${month} UTC`} · Ties share a rank</CardDescription>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 size={16} /> Share
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyLink} aria-label="Copy invitation link">
                    {copiedLink ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ComparisonTable members={sortedMembers} metric={metric} currentUserId={user?.id} onMetricChange={setMetric} label="Group leaderboard exact statistics" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Comparison</CardTitle>
              <CardDescription>{comparisonLabel(metric)} trends across every group member · Latest 12 months{month === 'all' ? '' : ` ending ${month}`}</CardDescription>
            </CardHeader>
            <CardContent>
              <GroupTrendChart group={group} month={month} metric={metric} />
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
              <MemberList members={group.members} currentUserId={user?.id || ''} ownerId={group.ownerId} isOwner={isOwner} onRemove={removeMember} saving={saving} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Group Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <StatRow label="Total Group Spending" value={formatCurrency(groupStats.spent)} icon={DollarSign} color="var(--accent)" />
                <StatRow label="Total Tokens Used" value={formatTokenCount(tokenValue(groupStats.tokenTotals, 'total'))} icon={Activity} color="#60a5fa" />
                <StatRow label="Average per Member" value={formatCurrency(groupStats.spent / Math.max(group.memberCount, 1))} icon={TrendingUp} color="#22c55e" />
                <StatRow label="Estimated Model Cost" value={`${formatCurrency(groupStats.estimated)}${groupStats.unknownCostEvents ? ' (partial)' : ''}`} icon={DollarSign} color="#60a5fa" />
                <StatRow label="Active Tools" value={`${new Set(group.members.flatMap(m => m.tools)).size} of 4`} icon={Users} color="#c084fc" />
                <TokenStats tokens={groupStats.tokenTotals} selectedMetric={metric === 'spent' || metric === 'estimated' ? undefined : metric} />
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
          {isOwner ? <Button variant="danger" onClick={deleteGroup} disabled={saving}>Delete Group</Button>
            : isMember && <Button variant="outline" onClick={() => user && removeMember(user.id)} disabled={saving}>Leave Group</Button>}
        </div>
      </div>

      {showInviteModal && (
        <Modal onClose={() => setShowInviteModal(false)} title="Invite Member">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem' }}>
              Share this private invitation link yourself. Your friend signs in with GitHub and confirms before joining. No email or GitHub notification is sent.
            </p>
            <input aria-label="Invitation link" value={inviteLink} readOnly onFocus={event => event.target.select()} style={{ width: '100%', padding: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <Button variant="outline" onClick={handleCopyLink}><Copy size={18} /> {copiedLink ? 'Copied!' : 'Copy Invite Link'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function GroupTrendChart({ group, month, metric }: { group: GroupData; month: string; metric: ComparisonMetric }) {
  const members = group.members
  const colors = ['var(--accent)', '#60a5fa', '#22c55e', '#c084fc', '#f97316', '#ef4444']
  const colorAt = (index: number) => colors[index] ?? `hsl(${index * 137.5 % 360} 70% 65%)`
  if (!members.some(member => member.monthlyUsage.length)) return <p className="metric-help">No monthly usage recorded yet.</p>
  const now = month === 'all' ? new Date() : new Date(`${month}-01T00:00:00Z`)
  const trend = recentUsageMonths([], 12, now).map(row => ({ month: row.month, values: Object.fromEntries(members.map(member => [member.id, comparisonStatsForMonth(member.monthlyUsage, row.month)])) }))
  const values = trend.flatMap(row => Object.values(row.values))
  const max = values.reduce<ComparisonStats>((max, value) => comparisonValue(value, metric) > comparisonValue(max, metric) ? value : max, values[0])
  const xAt = (index: number) => 40 + index / Math.max(trend.length - 1, 1) * 500

  return (
    <div>
      <svg width="100%" height="200" viewBox="0 0 580 200" role="img" aria-label={`Group ${comparisonLabel(metric)} by UTC month`}>
        <text x="40" y="14" fill="var(--fg-subtle)" fontSize="10">{formatComparisonValue(max, metric)}</text>
        <line x1="40" x2="540" y1="170" y2="170" stroke="var(--border)" />
        {members.map((member, memberIndex) => {
          const points = trend.map((row, index) => `${xAt(index)},${170 - comparisonRatio(row.values[member.id], max, metric) * 145}`).join(' ')

          return (
            <g key={member.id}>
              <polyline points={points} fill="none" stroke={colorAt(memberIndex)} strokeWidth={2} />
              {trend.map((row, index) => <circle key={row.month} cx={xAt(index)} cy={170 - comparisonRatio(row.values[member.id], max, metric) * 145} r={3} fill={colorAt(memberIndex)}>
                <title>@{member.login}: {formatComparisonValue(row.values[member.id], metric)} · {comparisonLabel(metric)} in {row.month}</title>
              </circle>)}
            </g>
          )
        })}
        {trend.map((month, index) => <text key={month.month} x={xAt(index)} y={193} textAnchor="middle" fill="var(--fg-subtle)" fontSize="10">{month.month}</text>)}
      </svg>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '8px 16px',
        paddingTop: 8,
        fontSize: '0.7rem',
      }}>
        {members.map((member, i) => (
          <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fg-muted)' }}>
            <div style={{ width: 10, height: 10, background: colorAt(i), borderRadius: 2 }} />
            <span>{member.name === 'you' ? 'You' : `@${member.login}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberList({ members, currentUserId, ownerId, isOwner, onRemove, saving }: { members: GroupData['members']; currentUserId: string; ownerId?: string; isOwner: boolean; onRemove: (memberId: string) => Promise<void>; saving: boolean }) {
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
                <Link to={`/@${member.login}`} style={{ fontWeight: 500 }}>{member.name === 'you' ? 'You' : member.name}</Link>
                {isCurrentUser && <Badge variant="accent" size="sm">You</Badge>}
                {member.id === ownerId && <Badge variant="info" size="sm">Owner</Badge>}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
                @{member.login} · {member.tools.join(', ') || 'No tools connected'}
              </div>
            </div>
            {!isCurrentUser && isOwner && (
              <Button variant="ghost" size="sm" onClick={() => onRemove(member.id)} disabled={saving} aria-label={`Remove @${member.login}`}>
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
