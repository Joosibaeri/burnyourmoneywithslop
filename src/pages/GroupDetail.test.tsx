import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupDetail } from './GroupDetail'
import { emptyMonthlyUsage, type GroupData } from '@/lib/data'
import { emptyTokenTotals, tokenValue } from '@/lib/tokens'

vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useParams: () => ({ id: 'friends' }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dan' } }) }))
vi.mock('@/contexts/SupabaseContext', () => ({ useSupabase: () => ({ isDemoMode: false, supabase: {} }) }))
vi.mock('@/hooks/useGroups', () => ({ useGroups: () => ({ groups: [group], loading: false, error: null, reload: vi.fn() }) }))

const currentMonth = new Date().toISOString().slice(0, 7)
const group: GroupData = {
  id: 'friends', name: 'Friends', description: 'Compare everything', ownerId: 'dan', inviteCode: 'secret-invite', memberCount: 7, totalSpent: 260, totalTokens: 0, yourRank: 1,
  members: [
    ['dan', 40000n, 100n, 20n, 0n, 80], ['erin', 1000n, 50000n, 500n, 100n, 70],
    ['finn', 39000n, 25000n, 50n, 1000n, 60], ['gina', 900n, 900n, 0n, 500000n, 50],
    ['fifth', 0n, 0n, 0n, 0n, 0], ['sixth', 0n, 0n, 0n, 0n, 0], ['seventh', 0n, 0n, 0n, 0n, 0],
  ].map(([id, input, output, reasoning, cacheRead, spent]) => {
    const tokens = { input: input as bigint, output: output as bigint, reasoning: reasoning as bigint, cacheRead: cacheRead as bigint, cacheWrite: 0n }
    return {
      id: id as string, name: id as string, login: id as string, avatar: '', spent: spent as number, estimated: 1, tokenTotals: tokens, tokens: Number(tokenValue(tokens, 'total')), unknownCostEvents: 0, tools: [],
      monthlyUsage: [
        { month: currentMonth, spent: spent as number, estimated: 1, tokenTotals: tokens, tokens: Number(tokenValue(tokens, 'total')), unknownCostEvents: 0 },
        { ...emptyMonthlyUsage('2025-01'), spent: id === 'gina' ? 1000 : 0, tokenTotals: id === 'gina' ? { ...emptyTokenTotals(), input: 100000n } : emptyTokenTotals() },
      ],
    }
  }),
}
afterEach(cleanup)

function renderGroup() { render(<MemoryRouter><GroupDetail /></MemoryRouter>) }
function leaderboardRows() { return within(screen.getByRole('region', { name: 'Group leaderboard exact statistics' })).getAllByRole('row').slice(1) }

describe('independent group comparisons', () => {
  it('defaults the leaderboard and comparison chart to In + Out, excluding cache', () => {
    renderGroup()
    expect(screen.getByRole('combobox', { name: 'Compare by' })).toHaveValue('input_output')
    expect(within(leaderboardRows()[0]).getByRole('link', { name: 'finn' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Group In + Out tokens by UTC month' })).toBeInTheDocument()
  })
  it.each([['cost', 'dan', 'Cost'], ['input', 'dan', 'In tokens'], ['output', 'erin', 'Out tokens'], ['input_output', 'finn', 'In + Out tokens'], ['total', 'gina', 'Cached + In + Out tokens'], ['cached', 'gina', 'Cached tokens'], ['reasoning', 'erin', 'Reasoning tokens']] as const)('re-ranks every member and the trend chart by %s', (metric, top, label) => {
    renderGroup()
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare by' }), { target: { value: metric } })
    expect(within(leaderboardRows()[0]).getByRole('link', { name: top })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: `Group ${label} by UTC month` })).toBeInTheDocument()
    expect(leaderboardRows()).toHaveLength(7)
  })

  it('shows exact comparisons for all fields and does not truncate chart participation to five members', () => {
    renderGroup()
    const table = screen.getByRole('region', { name: 'Group leaderboard exact statistics' })
    for (const label of ['In tokens', 'Out tokens', 'In + Out tokens', 'Cached + In + Out tokens', 'Cached tokens', 'Cache read tokens', 'Cache write tokens', 'Reasoning tokens', 'Cost']) expect(within(table).getByRole('button', { name: `Rank by ${label}` })).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: 'Rank by Uncached input tokens' })).not.toBeInTheDocument()
    expect(within(leaderboardRows()[1]).getByText('50,500')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Group In + Out tokens by UTC month' }).querySelectorAll('polyline')).toHaveLength(7)
    expect(screen.getByLabelText('Exact token statistics')).toBeInTheDocument()
  })

  it('can compare historical UTC months and all time without reusing current-month totals', () => {
    renderGroup()
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare by' }), { target: { value: 'cost' } })
    fireEvent.change(screen.getByLabelText('UTC month'), { target: { value: '2025-01' } })
    expect(within(leaderboardRows()[0]).getByRole('link', { name: 'gina' })).toBeInTheDocument()
    expect(within(leaderboardRows()[0]).getByText('$1,000.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'All time' }))
    expect(screen.getByLabelText('UTC month')).toBeDisabled()
    expect(within(leaderboardRows()[0]).getByText('$1,051.00')).toBeInTheDocument()
    expect(screen.getByText(/Your rank:/)).toHaveTextContent('#2')
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
  })

  it('lets a column heading switch the ranking metric too', () => {
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'Rank by Cached + In + Out tokens' }))
    expect(screen.getByRole('combobox', { name: 'Compare by' })).toHaveValue('total')
    expect(within(leaderboardRows()[0]).getByRole('link', { name: 'gina' })).toBeInTheDocument()
  })
})
