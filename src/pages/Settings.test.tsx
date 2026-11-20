import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    expect(screen.getByRole('heading', { name: 'Collector installation' })).toBeInTheDocument()
    expect(screen.getByText('GET https://api.cursor.com/v2/teams/billing-items')).toBeInTheDocument()
    expect(screen.getByText(/Automatic uploads after login\/reboot/)).toBeInTheDocument()
  })

  it('adds, edits and stops tracking a custom plan without restoring the Supabase tab', async () => {
    renderSettings('/settings?tab=subscriptions')
    fireEvent.click(screen.getByRole('button', { name: 'Add custom subscription' }))
    const form = screen.getByRole('form', { name: 'Add custom subscription' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Subscription name' }), { target: { value: 'My custom AI plan' } })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Monthly price (USD)' }), { target: { value: '12.50' } })
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Codex' }))
    fireEvent.click(within(form).getByRole('checkbox', { name: 'OpenCode' }))
    fireEvent.submit(form)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit My custom AI plan' })).toBeInTheDocument())
    expect(screen.getByText('$62.50/mo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supabase' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit My custom AI plan' }))
    const editForm = screen.getByRole('form', { name: 'Edit custom subscription' })
    fireEvent.change(within(editForm).getByRole('spinbutton', { name: 'Monthly price (USD)' }), { target: { value: '15' } })
    fireEvent.submit(editForm)
    await waitFor(() => expect(screen.getByText('$65.00/mo')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking My custom AI plan' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit My custom AI plan' })).not.toBeInTheDocument())
    expect(screen.getByText('$50.00/mo')).toBeInTheDocument()
  })

  it('requires tool coverage before saving a custom subscription', () => {
    renderSettings('/settings?tab=subscriptions')
    fireEvent.click(screen.getByRole('button', { name: 'Add custom subscription' }))
    const form = screen.getByRole('form', { name: 'Add custom subscription' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Subscription name' }), { target: { value: 'My plan' } })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Monthly price (USD)' }), { target: { value: '10' } })
    fireEvent.submit(form)
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one supported tool')
    expect(screen.queryByRole('button', { name: 'Edit My plan' })).not.toBeInTheDocument()
  })
})
