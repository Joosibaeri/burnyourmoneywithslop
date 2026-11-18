import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { getDemoGroups } from '@/lib/data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function Invite() {
  const { code } = useParams<{ code: string }>()
  const { user, loading } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    if (!user || !code) return
    setJoining(true)
    setError(null)
    try {
      let groupId: string
      if (isDemoMode) {
        const group = getDemoGroups().find(group => group.inviteCode === code)
        if (!group) throw new Error('Invalid demo invite code.')
        groupId = group.id
      } else {
        const { data, error: joinError } = await supabase.rpc('join_group', { p_invite_code: code })
        if (joinError) throw new Error(joinError.message)
        if (typeof data !== 'string') throw new Error('The group could not be joined.')
        groupId = data
      }
      navigate(`/groups/${groupId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the group.')
    } finally { setJoining(false) }
  }

  return (
    <div style={{ maxWidth: 540, margin: '40px auto' }}>
      <Card>
        <CardHeader>
          <CardTitle>Join a private group</CardTitle>
          <CardDescription>You’ve been invited to compare AI usage with friends.</CardDescription>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p>Joining lets group members see your token totals, estimated costs, and real subscription spending—even when your statistics are private. Prompts, code, transcripts, and receipts remain private.</p>
          <p style={{ color: 'var(--fg-muted)' }}>Only join if you trust the person who shared this link. You can leave the group later.</p>
          {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
          {loading ? <p>Checking sign-in…</p> : user ? (
            <Button onClick={handleJoin} loading={joining} disabled={joining || !code}>Join Group</Button>
          ) : (
            <Link to="/login" state={{ returnTo: `/invite/${code}` }}><Button>Sign in with GitHub to continue</Button></Link>
          )}
          {isDemoMode && <p style={{ color: 'var(--fg-muted)' }}>Demo only; no membership is saved to Supabase.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
