import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Ranking } from './Ranking'
import { loadGlobalRanking } from '@/lib/data'
import type { RankedMember } from '@/lib/comparison'
import { emptyTokenTotals } from '@/lib/tokens'

const client = vi.hoisted(() => ({}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('@/contexts/SupabaseContext', () => ({ useSupabase: () => ({ isDemoMode: false, supabase: client }) }))
vi.mock('@/lib/data', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/data')>(), loadGlobalRanking: vi.fn() }))

const month = new Date().toISOString().slice(0, 7)
const member: RankedMember = {
  id: 'public-friend', name: 'Public Friend', login: 'publicfriend', avatar: 'https://github.com/publicfriend.png', tools: [],
  spent: 20, estimated: 99, unknownCostEvents: 1, rank: 1,
  tokenTotals: { input: 9007199254740993n, output: 456n, reasoning: 20n, cacheRead: 1000n, cacheWrite: 500n },
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadGlobalRanking).mockResolvedValue({ members: [member], totalMembers: 1 })
})
afterEach(cleanup)

async function renderRanking(path = '/ranking') {
  render(<MemoryRouter initialEntries={[path]}><Ranking /></MemoryRouter>)
  await screen.findByRole('region', { name: 'Global leaderboard exact statistics' })
}

describe('public global ranking', () => {
  it('works without sign-in and displays exact counts, GitHub identity and partial model estimates', async () => {
    await renderRanking()
    expect(loadGlobalRanking).toHaveBeenCalledWith(client, month, 'total', 50, 0)
    expect(screen.getByRole('link', { name: 'Public Friend' })).toHaveAttribute('href', '/@publicfriend')
    expect(screen.getByText('@publicfriend')).toBeInTheDocument()
    expect(screen.getByText('9,007,199,254,740,993')).toBeInTheDocument()
    expect(screen.getByText(/In counts uncached input sent to the model/)).toHaveTextContent('tool answers')
    expect(screen.queryByRole('button', { name: 'Rank by Uncached input tokens' })).not.toBeInTheDocument()
    expect(screen.getByText(/partial/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByText('1 public user with recorded usage in this period')).toBeInTheDocument()
  })

  it.each(['input', 'output', 'input_output', 'total', 'cached', 'cache_read', 'cache_write', 'reasoning', 'spent', 'estimated'])('fetches an independently ranked %s leaderboard', async metric => {
    await renderRanking()
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare by' }), { target: { value: metric } })
    await waitFor(() => expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, month, metric, 50, 0))
  })

  it('supports linked filters, historical UTC months and explicit all-time ranking', async () => {
    await renderRanking('/ranking?month=2025-01&metric=input')
    expect(screen.getByRole('combobox', { name: 'Compare by' })).toHaveValue('input')
    expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, '2025-01', 'input', 50, 0)
    fireEvent.change(screen.getByLabelText('UTC month'), { target: { value: '2026-01' } })
    await waitFor(() => expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, '2026-01', 'input', 50, 0))
    fireEvent.click(screen.getByRole('checkbox', { name: 'All time' }))
    await waitFor(() => expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, 'all', 'input', 50, 0))
    expect(screen.getByLabelText('UTC month')).toBeDisabled()
  })

  it('keeps server ranks across pages and resets pagination when the metric changes', async () => {
    vi.mocked(loadGlobalRanking).mockResolvedValueOnce({ members: [member], totalMembers: 51 }).mockResolvedValueOnce({ members: [{ ...member, id: 'last', name: 'Last Friend', login: 'lastfriend', rank: 51, tokenTotals: emptyTokenTotals() }], totalMembers: 51 }).mockResolvedValue({ members: [member], totalMembers: 51 })
    await renderRanking()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('link', { name: 'Last Friend' })).toBeInTheDocument()
    expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, month, 'total', 50, 50)
    expect(screen.getByText('#51')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare by' }), { target: { value: 'output' } })
    expect(await screen.findByRole('link', { name: 'Public Friend' })).toBeInTheDocument()
    expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, month, 'output', 50, 0)
    expect(screen.getByText('Page 1')).toBeInTheDocument()
  })

  it('can switch metrics directly from exact-stat column headers', async () => {
    await renderRanking()
    fireEvent.click(screen.getByRole('button', { name: 'Rank by In + Out tokens' }))
    await waitFor(() => expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, month, 'input_output', 50, 0))
    const table = screen.getByRole('region', { name: 'Global leaderboard exact statistics' })
    expect(within(table).getAllByRole('columnheader')[2]).toHaveAttribute('aria-sort', 'descending')
  })

  it('shows retryable errors rather than an empty or stale successful leaderboard', async () => {
    vi.mocked(loadGlobalRanking).mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValueOnce({ members: [member], totalMembers: 1 })
    render(<MemoryRouter><Ranking /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary failure')
    expect(screen.queryByRole('region', { name: 'Global leaderboard exact statistics' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Public Friend' })).toBeInTheDocument()
  })
})
