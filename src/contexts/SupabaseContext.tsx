import { createContext, useContext, ReactNode, useMemo } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { isPublishableKey, storedClientConfig } from '@/lib/client-config'

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
    readonly VITE_SUPABASE_ANON_KEY: string
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

const storedConfig = storedClientConfig()
const deploymentConfigured = !!import.meta.env.VITE_SUPABASE_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || storedConfig.url
const SUPABASE_ANON_KEY = deploymentConfigured
  ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  : storedConfig.key

const isDemoMode = !SUPABASE_URL || !SUPABASE_ANON_KEY

let supabaseInstance: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    if (isDemoMode) {
      supabaseInstance = createClient(
        'https://demo.supabase.co',
        'demo-anon-key',
        { auth: { persistSession: false } }
      )
    } else {
      if (!isPublishableKey(SUPABASE_ANON_KEY)) throw new Error('Use a Supabase publishable key or legacy anon key, never a secret/service-role key.')
      supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
      })
    }
  }
  return supabaseInstance
}

interface SupabaseContextValue {
  supabase: SupabaseClient
  isDemoMode: boolean
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null)

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({
    supabase: getSupabaseClient(),
    isDemoMode,
  }), [])

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase() {
  const context = useContext(SupabaseContext)
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return context
}
