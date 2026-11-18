import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Onboarding } from './Onboarding'

const mocks = vi.hoisted(() => ({ demo: false, groupCount: 2, failure: false, subscriptions: vi.fn(), usage: vi.fn(), from: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'alice', user_metadata: { user_name: 'alice' } } }) }))
vi.mock('@/contexts/SupabaseContext', () => ({ useSupabase: () => ({ isDemoMode: mocks.demo, supabase: { from: mocks.from } }) }))
vi.mock('@/lib/data', async () => ({ ...await vi.importActual('@/lib/data'), loadSubscriptions: mocks.subscriptions, loadUsage: mocks.usage }))

beforeEach(() => {
  mocks.demo = false
  mocks.failure = false
  mocks.groupCount = 2
  mocks.subscriptions.mockResolvedValue([{ active: true }])
  mocks.usage.mockResolvedValue([{ tool: 'codex' }, { tool: 'opencode' }])
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'profiles' ? {
    single: async () => ({ data: mocks.failure ? null : { id: 'alice' }, error: mocks.failure ? { message: 'Backend unavailable' } : null }),
  } : Promise.resolve({ count: mocks.groupCount, error: null }) }) }))
})
afterEach(cleanup)

describe('live onboarding', () => {
  it('shows verified saved state without simulated-completion buttons', async () => {
    render(<Onboarding />)
    expect(await screen.findByText('Connection verified')).toBeInTheDocument()
    expect(screen.getByText('1 saved')).toBeInTheDocument()
    expect(screen.getByText('2 joined')).toBeInTheDocument()
    expect(screen.getByText('2 tools reporting')).toBeInTheDocument()
    expect(screen.queryByText(/Simulate|Added Mine \(Demo\)/)).not.toBeInTheDocument()
    expect(screen.getByText(/public by default/)).toBeInTheDocument()
  })
  it('refreshes from persisted state instead of marking a click as completed', async () => {
    render(<Onboarding />)
    await screen.findByText('1 saved')
    mocks.subscriptions.mockResolvedValue([])
    mocks.usage.mockResolvedValue([])
    mocks.groupCount = 0
    fireEvent.click(screen.getByRole('button', { name: 'Recheck saved setup' }))
    await waitFor(() => expect(screen.getByText('0 saved')).toBeInTheDocument())
    expect(screen.getByText('No usage received yet')).toBeInTheDocument()
  })
  it('reports backend errors without claiming a successful connection', async () => {
    mocks.failure = true
    render(<Onboarding />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Backend unavailable')
    expect(screen.queryByText('Connection verified')).not.toBeInTheDocument()
  })
  it('does not pretend a local demo has a working backend', () => {
    mocks.demo = true
    render(<Onboarding />)
    expect(screen.getByRole('status')).toHaveTextContent('local demo')
    expect(screen.queryByText('Connection verified')).not.toBeInTheDocument()
  })
})
