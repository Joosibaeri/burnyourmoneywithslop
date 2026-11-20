import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Lock, Shield, BarChart2, DollarSign, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { internalReturnTo } from '@/lib/auth-redirect'

export function Login() {
  const { signInWithGithub, loading, user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const location = useLocation()
  const returnTo = internalReturnTo(location.state?.returnTo)

  if (user && !loading) return <Navigate to={returnTo} replace />

  const handleSignIn = async () => {
    setSigningIn(true)
    setError(null)
    try {
      const { error: authError } = await signInWithGithub(returnTo)
      if (authError) setError(authError.message)
    } catch {
      setError('Could not start GitHub sign-in. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 80, height: 80,
            margin: '0 auto 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-bg)',
            border: '1px solid var(--accent)',
            borderRadius: '16px',
            fontSize: '2.5rem',
          }}>💸</div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: 12 }}>
            Burn Your Money With Slop
          </h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: '1.125rem' }}>
            Compare AI coding usage with friends
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in with GitHub</CardTitle>
            <CardDescription>
              We use GitHub OAuth to authenticate. No passwords, just your GitHub account.
            </CardDescription>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Button
              onClick={handleSignIn}
              disabled={loading || signingIn}
              loading={loading || signingIn}
              style={{ justifyContent: 'center' }}
            >
              <GitBranch size={20} /> Continue with GitHub
            </Button>
            {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <Lock size={20} color="var(--fg-subtle)" />
              <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem', margin: 0 }}>
                GitHub identity and aggregate statistics are public by default; change visibility in Settings. Raw events, invoices and receipts stay private. <a href="https://github.com/Joosibaeri/burnyourmoneywithslop#privacy-and-groups" style={{ color: 'var(--accent)' }} target="_blank" rel="noopener noreferrer">Read privacy details</a>.
              </p>
            </div>
          </CardContent>
        </Card>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ color: 'var(--fg-subtle)', fontSize: '0.875rem', marginBottom: 16 }}>
            What you'll get
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <FeatureIcon icon={Shield} label="Private Groups" />
            <FeatureIcon icon={BarChart2} label="Usage Charts" />
            <FeatureIcon icon={DollarSign} label="Costs" />
          </div>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', color: 'var(--fg-subtle)', fontSize: '0.8125rem' }}>
          <p><a href="https://github.com/Joosibaeri/burnyourmoneywithslop#development" target="_blank" rel="noopener noreferrer">Explore the local demo</a> — production uses GitHub sign-in.</p>
        </div>
      </div>
    </div>
  )
}

function FeatureIcon({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 48, height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <Icon size={24} color="var(--accent)" />
      </div>
      <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{label}</span>
    </div>
  )
}
