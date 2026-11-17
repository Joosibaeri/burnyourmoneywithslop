import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { useSupabase } from './SupabaseContext'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGithub: () => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { supabase, isDemoMode } = useSupabase()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isDemoMode) {
      const demoUser: User = {
        id: 'demo-user-1',
        email: 'demo@burnyourmoneywithslop.xyz',
        user_metadata: { full_name: 'Demo User', avatar_url: '' },
        app_metadata: { provider: 'github' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User
      const demoSession: Session = {
        access_token: 'demo-token',
        refresh_token: 'demo-refresh',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: demoUser,
      }
      setUser(demoUser)
      setSession(demoSession)
      setLoading(false)
      return
    }

    const initAuth = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession()
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      setLoading(false)

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)
      })

      return () => subscription.unsubscribe()
    }

    initAuth()
  }, [supabase, isDemoMode])

  const signInWithGithub = useCallback(async () => {
    if (isDemoMode) {
      const demoUser: User = {
        id: 'demo-user-1',
        email: 'demo@burnyourmoneywithslop.xyz',
        user_metadata: { full_name: 'Demo User', avatar_url: '' },
        app_metadata: { provider: 'github' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User
      const demoSession: Session = {
        access_token: 'demo-token',
        refresh_token: 'demo-refresh',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: demoUser,
      }
      setUser(demoUser)
      setSession(demoSession)
      return { error: null }
    }

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
    await supabase.auth.signOut()
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