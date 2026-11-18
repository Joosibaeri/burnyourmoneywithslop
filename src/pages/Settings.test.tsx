import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Settings } from './Settings'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'friend', user_metadata: { user_name: 'friend', full_name: 'Friend' }, created_at: '2026-11-18T12:00:00Z' },
  session: null, signOut: vi.fn(),
}) }))
vi.mock('@/contexts/SupabaseContext', () => ({ useSupabase: () => ({ isDemoMode: true, supabase: {} }) }))
afterEach(cleanup)

function renderSettings(path = '/settings') {
  return render(<MemoryRouter initialEntries={[path]}><Settings /></MemoryRouter>)
}

describe('settings navigation', () => {
  it('keeps account, subscriptions and collectors without a Supabase tab or connection form', () => {
    renderSettings()
    for (const name of ['Account', 'Subscriptions', 'Collectors']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supabase' })).not.toBeInTheDocument()
    expect(screen.queryByText('Supabase Connection')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Project URL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Publishable Key/)).not.toBeInTheDocument()
  })

  it.each(['supabase', 'unknown'])('falls back to account settings for obsolete/invalid tab=%s links', tab => {
    renderSettings(`/settings?tab=${tab}`)
    expect(screen.getByText('Your GitHub account information')).toBeInTheDocument()
    expect(screen.queryByText('Supabase Connection')).not.toBeInTheDocument()
  })

  it('still switches between subscription and collector settings', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Subscriptions' }))
    expect(screen.getByText('Subscription Management')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Collectors' }))
    expect(screen.getByText('Sign in once per machine')).toBeInTheDocument()
  })
})
