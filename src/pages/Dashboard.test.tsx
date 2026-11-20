import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import { loadGlobalRanking, loadUsage, type UsageSummary } from '@/lib/data'

const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'friend', user_metadata: { user_name: 'friend' } }, loading: false }) }))
vi.mock('@/contexts/SupabaseContext', () => ({ useSupabase: () => ({ isDemoMode: false, supabase: client }) }))
vi.mock('@/lib/data', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/data')>(),
  loadUsage: vi.fn(), loadSubscriptions: vi.fn().mockResolvedValue([]), loadCustomSubscriptions: vi.fn().mockResolvedValue([]),
  loadGlobalRanking: vi.fn().mockResolvedValue({ members: [], totalMembers: 0 }),
}))

const month = new Date().toISOString().slice(0, 7)
const usage: UsageSummary[] = [
  { user_id: 'friend', month: `${month}-01Z`, tool: 'codex', total_tokens: 1245543, total_tokens_exact: '1245543', input_tokens: '1234567', output_tokens: '456', reasoning_tokens: '20', cache_read_tokens: '10000', cache_write_tokens: '500', real_cost_usd: 20, total_estimated_cost: 1, unknown_cost_events: 1 },
  { user_id: 'friend', month: `${month}-01Z`, tool: 'opencode', total_tokens: 2120, total_tokens_exact: '2120', input_tokens: '2000', output_tokens: '100', reasoning_tokens: '0', cache_read_tokens: '20', cache_write_tokens: '0', real_cost_usd: 20, total_estimated_cost: 2, unknown_cost_events: 0 },
]
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadUsage).mockResolvedValue(usage)
  vi.mocked(loadGlobalRanking).mockResolvedValue({ members: [], totalMembers: 0 })
})
afterEach(cleanup)

async function renderDashboard() {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  await screen.findByText('Exact Token Statistics')
}

describe('exact dashboard statistics and filters', () => {
  it('defaults personal counts, history and the comparison preview to In + Out', async () => {
    await renderDashboard()
    expect(screen.getByRole('combobox', { name: 'Token metric' })).toHaveValue('input_output')
    expect(within(screen.getByText('Selected Tokens').parentElement!).getByText('1,237,143')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'In + Out tokens by UTC month' })).toBeInTheDocument()
    await waitFor(() => expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, month, 'input_output', 5))
  })
  it('shows every exact token category and removes the active-tools and groups tiles/query', async () => {
    await renderDashboard()
    const definitions = screen.getByLabelText('Exact token statistics')
    for (const [label, count] of [
      ['In tokens', '1,236,567'], ['Out tokens', '576'], ['In + Out tokens', '1,237,143'], ['Cached + In + Out tokens', '1,247,663'],
      ['Cached tokens', '10,520'], ['Cache read tokens', '10,020'], ['Cache write tokens', '500'], ['Reasoning tokens', '20'],
    ]) expect(within(within(definitions).getByText(label).parentElement!).getByText(count)).toBeInTheDocument()
    expect(within(definitions).getByText('556 output + 20 reasoning')).toBeInTheDocument()
    expect(screen.getByText(/In counts uncached input sent to the model/)).toHaveTextContent('tool answers')
    expect(screen.getByText(/Total = Cached \+ In \+ Out/)).toHaveTextContent('each category is counted once')
    expect(screen.queryByText('Uncached input tokens')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Uncached input' })).not.toBeInTheDocument()
    expect(screen.queryByText('Active Tools')).not.toBeInTheDocument()
    expect(screen.queryByText('Groups', { exact: true })).not.toBeInTheDocument()
    expect(client.from).not.toHaveBeenCalled()
    expect(loadUsage).toHaveBeenCalledWith(client, ['friend'])
    expect(screen.getByText('$20.00')).toBeInTheDocument()
    expect(within(screen.getByText('Combined Cost').parentElement!).getByText('$23.00')).toBeInTheDocument()
    expect(screen.getByText(/Model estimates are incomplete/)).toBeInTheDocument()
  })

  it.each([['input', '1,236,567', 'In'], ['output', '576', 'Out'], ['input_output', '1,237,143', 'In + Out'], ['total', '1,247,663', 'Cached + In + Out']] as const)('applies the %s filter to the selected total, monthly counts, tool table and global preview', async (metric, count, label) => {
    await renderDashboard()
    fireEvent.change(screen.getByRole('combobox', { name: 'Token metric' }), { target: { value: metric } })
    const selected = screen.getByText('Selected Tokens').parentElement!
    expect(within(selected).getByText(count)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: `${label} tokens by UTC month` })).toBeInTheDocument()
    const monthly = screen.getByRole('region', { name: 'Exact monthly token counts' })
    expect(within(monthly).getByText(count)).toBeInTheDocument()
    const tools = screen.getByRole('region', { name: 'Exact tool token counts' })
    expect(within(tools).getAllByRole('columnheader')[1]).toHaveTextContent(`${label} tokens`)
    await waitFor(() => expect(loadGlobalRanking).toHaveBeenLastCalledWith(client, month, metric, 5))
  })

  it('never abbreviates or rounds counters above Number.MAX_SAFE_INTEGER', async () => {
    vi.mocked(loadUsage).mockResolvedValue([{ ...usage[0], input_tokens: '9007199254740993', output_tokens: '0', reasoning_tokens: '0', cache_read_tokens: '0', cache_write_tokens: '0' }])
    await renderDashboard()
    expect(within(screen.getByText('Selected Tokens').parentElement!).getByText('9,007,199,254,740,993')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Exact token statistics')).getAllByText('9,007,199,254,740,993')).toHaveLength(3)
  })

  it('keeps cached-only context out of In in statistics, history and tools without claiming no usage', async () => {
    vi.mocked(loadUsage).mockResolvedValue([{ ...usage[0], input_tokens: '0', output_tokens: '0', reasoning_tokens: '0' }])
    await renderDashboard()
    fireEvent.change(screen.getByRole('combobox', { name: 'Token metric' }), { target: { value: 'input' } })
    expect(within(screen.getByText('Selected Tokens').parentElement!).getByText('0')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Exact monthly token counts' })).getByText('0')).toBeInTheDocument()
    const toolRow = within(screen.getByRole('region', { name: 'Exact tool token counts' })).getByRole('rowheader', { name: 'Codex' }).parentElement!
    expect(toolRow.querySelector('td.selected-metric')).toHaveTextContent('0')
    expect(screen.queryByText(/No usage recorded this month/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Token metric' }), { target: { value: 'cached' } })
    expect(within(screen.getByText('Selected Tokens').parentElement!).getByText('10,500')).toBeInTheDocument()
    expect(screen.queryByText(/No usage recorded this month/)).not.toBeInTheDocument()
  })

  it('does not describe a missing output category as an empty usage account', async () => {
    vi.mocked(loadUsage).mockResolvedValue([{ ...usage[0], output_tokens: '0', reasoning_tokens: '0' }])
    await renderDashboard()
    fireEvent.change(screen.getByRole('combobox', { name: 'Token metric' }), { target: { value: 'output' } })
    expect(within(screen.getByText('Selected Tokens').parentElement!).getByText('0')).toBeInTheDocument()
    expect(screen.queryByText(/No usage recorded this month/)).not.toBeInTheDocument()
  })

  it('keeps ranking failures separate from usable personal statistics and offers a retry', async () => {
    vi.mocked(loadGlobalRanking).mockRejectedValueOnce(new Error('Temporary ranking failure')).mockResolvedValueOnce({ members: [], totalMembers: 0 })
    await renderDashboard()
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary ranking failure')
    expect(screen.getByLabelText('Exact token statistics')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry ranking' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
