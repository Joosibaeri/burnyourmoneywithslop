import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from './AuthContext'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), onChange: null as null | ((event: string, session: Session | null) => void) }))
const client = { auth: {
  getSession: mocks.getSession, refreshSession: mocks.refreshSession,
  onAuthStateChange: (callback: (event: string, session: Session | null) => void) => { mocks.onChange = callback; return { data: { subscription: { unsubscribe: vi.fn() } } } },
} }
vi.mock('./SupabaseContext', () => ({ useSupabase: () => ({ isDemoMode: false, supabase: client }) }))

function session(expires: number): Session {
  return { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expires,
    user: { id: 'test-user', app_metadata: { provider: 'github' }, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-18T12:00:00Z' } }
}
function Probe() { const auth = useAuth(); return <span data-testid="expiry">{auth.session?.expires_at ?? 'none'}</span> }
beforeEach(() => { mocks.onChange = null; mocks.getSession.mockReset(); mocks.refreshSession.mockReset() })
afterEach(cleanup)

describe('refreshable website sessions', () => {
  it('updates the displayed expiry when the SDK automatically refreshes its access token', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session(100) } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    expect(screen.getByTestId('expiry')).toHaveTextContent('100')
    act(() => mocks.onChange!('TOKEN_REFRESHED', session(200)))
    expect(screen.getByTestId('expiry')).toHaveTextContent('200')
  })
  it('does not overwrite a refreshed session with an older initial-session response', async () => {
    let resolve!: (result: { data: { session: Session } }) => void
    mocks.getSession.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<AuthProvider><Probe /></AuthProvider>)
    act(() => mocks.onChange!('TOKEN_REFRESHED', session(300)))
    await act(async () => { resolve({ data: { session: session(100) } }) })
    expect(screen.getByTestId('expiry')).toHaveTextContent('300')
  })
})
