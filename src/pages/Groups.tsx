import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { useGroups } from '@/hooks/useGroups'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Plus, Lock, ArrowRight, TrendingUp, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { formatCurrencyPrecise as formatCurrency } from '@/lib/utils'
import { getDemoGroups, setDemoGroups, githubLogin, inviteCodeFromInput, type GroupData } from '@/lib/data'
import { sumComparisonStats } from '@/lib/comparison'
import { emptyTokenTotals, formatTokenCount, tokenValue } from '@/lib/tokens'

export function Groups() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const { groups, loading, error, reload } = useGroups()
  const [params] = useSearchParams()
  const [showCreateModal, setShowCreateModal] = useState(params.get('create') === '1')
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim() || !user) return
    setCreating(true)
    setActionError(null)
    try {
      let groupId: string
      if (isDemoMode) {
        groupId = `demo-${Date.now()}`
        setDemoGroups([{
          id: groupId, name: newGroupName.trim(), description: newGroupDesc.trim(), ownerId: user.id,
          inviteCode: `demo-invite-${groupId}`, memberCount: 1, totalSpent: 0, totalTokens: 0, yourRank: 1,
          members: [{ id: user.id, name: 'You', login: githubLogin(user), avatar: '', spent: 0, estimated: 0, tokens: 0, tokenTotals: emptyTokenTotals(), unknownCostEvents: 0, tools: [], monthlyUsage: [] }],
        }, ...getDemoGroups()])
      } else {
        const { data, error: createError } = await supabase.from('groups')
          .insert({ name: newGroupName.trim(), description: newGroupDesc.trim() || null, owner_id: user.id }).select('id').single()
        if (createError) throw new Error(createError.message)
        groupId = data.id
      }
      navigate(`/groups/${groupId}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create the group.')
    } finally { setCreating(false) }
  }

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault()
    const code = inviteCodeFromInput(inviteInput)
    if (!code) {
      setActionError('Enter a valid invite code or an /invite/ link.')
      return
    }
    navigate(`/invite/${encodeURIComponent(code)}`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8 }}>Groups</h1>
          <p style={{ color: 'var(--fg-muted)' }}>
            Compare usage with friends in private groups
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" onClick={() => { setActionError(null); setShowJoinModal(true) }}><UserPlus size={18} /> Join Group</Button>
          <Button onClick={() => { setActionError(null); setShowCreateModal(true) }}><Plus size={18} /> Create Group</Button>
        </div>
      </div>

      {isDemoMode && <p style={{ marginBottom: 16, color: 'var(--fg-muted)' }}>Sample groups; demo changes last only until reload.</p>}
      {error && <p role="alert">Could not load groups: {error} <Button variant="outline" onClick={reload}>Retry</Button></p>}
      {loading ? <p role="status">Loading groups…</p> : !error && groups.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '60px 40px' }}>
          <div style={{
            width: 80, height: 80,
            margin: '0 auto 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-bg)',
            border: '1px solid var(--accent)',
            borderRadius: '50%',
            fontSize: '2rem',
          }}>👥</div>
          <CardTitle>No groups yet</CardTitle>
          <CardDescription>
            Create a private group to compare AI usage and cost with friends.
            Group membership is private. Members can compare usage summaries even when public statistics are disabled.
          </CardDescription>
          <div style={{ maxWidth: 400, margin: '0 auto 24px' }}>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus size={18} /> Create Your First Group
            </Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}

      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)} title="Create New Group">
          <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              label="Group Name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g., The Token Burners"
              required
              maxLength={100}
              autoFocus
            />
            <Input
              label="Description (optional)"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              placeholder="What's this group about?"
              maxLength={1000}
            />
            {actionError && <p role="alert" style={{ color: 'var(--danger)' }}>{actionError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={creating} disabled={creating}>
                <Plus size={18} /> Create Group
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {showJoinModal && <Modal onClose={() => setShowJoinModal(false)} title="Join a Group">
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Invite link or code" value={inviteInput} onChange={e => setInviteInput(e.target.value)} required autoFocus />
          <p style={{ color: 'var(--fg-muted)' }}>You’ll review the sharing permissions before joining.</p>
          {actionError && <p role="alert" style={{ color: 'var(--danger)' }}>{actionError}</p>}
          <Button type="submit">Review Invitation</Button>
        </form>
      </Modal>}
    </div>
  )
}

function GroupCard({ group }: { group: GroupData }) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <CardTitle>{group.name}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </div>
          <Badge variant="info" size="sm">
            <Lock size={12} style={{ marginRight: 4 }} /> Private
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
          <StatMini title="Members" value={group.memberCount} />
          <StatMini title="Cost" value={formatCurrency(group.totalSpent)} />
          <StatMini title="In + Out Tokens" value={formatTokenCount(tokenValue(sumComparisonStats(group.members).tokenTotals, 'input_output'))} />
        </div>
        <div style={{
          padding: '12px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
            <TrendingUp size={16} color="var(--success)" />
            <span>Your rank: <strong>#{group.yourRank}</strong> of {group.memberCount} · In + Out</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Link to={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
          <Button variant="outline" style={{ width: '100%', justifyContent: 'center' }}>
            View Details <ArrowRight size={16} />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}

function StatMini({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--fg-subtle)', fontSize: '0.75rem', fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--fg)' }}>{value}</div>
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
