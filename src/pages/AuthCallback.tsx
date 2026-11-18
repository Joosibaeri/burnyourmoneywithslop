import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSupabase } from '@/contexts/SupabaseContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { AUTH_RETURN_TO, internalReturnTo } from '@/lib/auth-redirect'

export function AuthCallback() {
  const { supabase, isDemoMode } = useSupabase()
  const navigate = useNavigate()
  const started = useRef(false)
  const [parameters] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return { code: params.get('code'), flowId: params.get('sb_flow_id'), missingError: params.get('error_description') || 'No authorization code received. Please sign in again.' }
  })
  const [error, setError] = useState<string | null>(isDemoMode || parameters.code ? null : parameters.missingError)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (isDemoMode) {
      navigate('/', { replace: true })
      return
    }
    const { code, flowId } = parameters
    if (!code) return
    supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined).then(({ error: authError }) => {
      window.history.replaceState(null, '', window.location.pathname)
      if (authError) setError(authError.message)
      else {
        const returnTo = internalReturnTo(window.sessionStorage.getItem(AUTH_RETURN_TO))
        window.sessionStorage.removeItem(AUTH_RETURN_TO)
        navigate(returnTo, { replace: true })
      }
    }).catch(() => {
      window.history.replaceState(null, '', window.location.pathname)
      setError('Could not complete sign-in. Please try again.')
    })
  }, [supabase, isDemoMode, navigate, parameters])

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 24 }}>
      <Card>
        <CardHeader><CardTitle>{error ? 'Sign-in failed' : 'Completing GitHub sign-in…'}</CardTitle></CardHeader>
        <CardContent>
          {error ? <><p role="alert">{error}</p><Link to="/login">Return to sign-in</Link></> : <p>Please wait.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
