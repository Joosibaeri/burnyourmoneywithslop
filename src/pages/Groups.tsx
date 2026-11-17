import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Plus, Lock, ArrowRight, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { getMockGroups, formatNumber, formatCurrency } from '@/lib/utils'

export function Groups() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [groups] = useState(getMockGroups())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    const newGroup = {
      id: Date.now().toString(),
      name: newGroupName,
      description: newGroupDesc,
      memberCount: 1,
      totalSpent: 0,
      totalTokens: 0,
      yourRank: 1,
      members: [{
        id: user?.id || '1',
        name: user?.user_metadata?.login || 'you',
        login: user?.user_metadata?.login || 'you',
        avatar: '',
        spent: 0,
        tokens: 0,
        tools: [],
      }],
    }
    groups.unshift(newGroup)
    setShowCreateModal(false)
    setNewGroupName('')
    setNewGroupDesc('')
    navigate(`/groups/${newGroup.id}`)
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
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus size={18} /> Create Group
        </Button>
      </div>

      {groups.length === 0 ? (
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
            Create a private group to compare AI usage and spending with friends.
            Only group members can see each other's data.
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
              autoFocus
            />
            <Input
              label="Description (optional)"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              placeholder="What's this group about?"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Plus size={18} /> Create Group
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function GroupCard({ group }: { group: { id: string; name: string; description: string; memberCount: number; totalSpent: number; totalTokens: number; yourRank: number; members: Array<{ id: string; name: string; login: string; avatar: string; spent: number; tokens: number; tools: string[] }> } }) {
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
          <StatMini title="Total Spent" value={formatCurrency(group.totalSpent)} />
          <StatMini title="Total Tokens" value={formatNumber(group.totalTokens)} />
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
            <span>Your rank: <strong>#{group.yourRank}</strong> of {group.memberCount}</span>
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