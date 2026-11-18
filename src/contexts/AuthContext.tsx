import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { useSupabase } from './SupabaseContext'
import { AUTH_RETURN_TO, internalReturnTo } from '@/lib/auth-redirect'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGithub: (returnTo?: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function createDemoSession(): Session {
  const user = { id: '2', email: 'demo@burnyourmoneywithslop.xyz',
    user_metadata: { user_name: 'joosibaeri', full_name: 'Demo User', avatar_url: '' },
    app_metadata: { provider: 'github' }, aud: 'authenticated', created_at: new Date().toISOString() } as User
  return { access_token: 'demo-token', refresh_token: 'demo-refresh', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { supabase, isDemoMode } = useSupabase()
  const [session, setSession] = useState<Session | null>(() => isDemoMode ? createDemoSession() : null)
  const [user, setUser] = useState<User | null>(() => session?.user ?? null)
  const [loading, setLoading] = useState(!isDemoMode)

  useEffect(() => {
    if (isDemoMode) return

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (active) {
        setSession(newSession)
        setUser(newSession?.user ?? null)
      }
    })

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!active) return
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      setLoading(false)
    }).catch(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase, isDemoMode])

  const signInWithGithub = useCallback(async (returnTo = '/') => {
    if (isDemoMode) {
      const demoSession = createDemoSession()
      setUser(demoSession.user)
      setSession(demoSession)
      return { error: null }
    }

    if (!window.isSecureContext) {
      return { error: new AuthError('GitHub sign-in requires HTTPS. The custom-domain certificate is not ready yet.', 400) }
    }

    window.sessionStorage.setItem(AUTH_RETURN_TO, internalReturnTo(returnTo))
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'read:user user:email',
      },
    })
    return { error }
  }, [supabase, isDemoMode])

  const signOut = useCallback(async () => {
    if (isDemoMode) {
      setUser(null)
      setSession(null)
      return
    }
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) throw error
  }, [supabase, isDemoMode])

  const refreshSession = useCallback(async () => {
    if (isDemoMode) return
    await supabase.auth.refreshSession()
  }, [supabase, isDemoMode])

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signInWithGithub,
      signOut,
      refreshSession,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
