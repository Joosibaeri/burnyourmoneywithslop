import type { Counters } from './events'

// USD/1M tokens, checked 2026-11-18 against the providers' pricing documentation.
// These are standard token-price estimates, never invoices. Speed, residency,
// provider discounts, and server-side tool charges are not inferred from hooks.
type Rates = readonly [input: number, output: number, read: number]
const claude: Record<string, Rates> = {
  'claude-fable-5-2': [8, 40, 0.2], 'claude-mythos-5-2': [8, 40, 0.2],
  'claude-fable-5-1': [10, 50, 0.25], 'claude-mythos-5-1': [10, 50, 0.25],
  'claude-fable-5': [10, 50, 1], 'claude-mythos-5': [10, 50, 1],
  'claude-opus-5-5': [4, 20, 0.2], 'claude-opus-5': [5, 25, 0.5],
  'claude-opus-4-8': [5, 25, 0.5], 'claude-opus-4-7': [5, 25, 0.5],
  'claude-opus-4-6': [5, 25, 0.5], 'claude-opus-4-5': [5, 25, 0.5],
  'claude-opus-4-1': [15, 75, 1.5], 'claude-opus-4': [15, 75, 1.5],
  'claude-sonnet-5-5': [2, 10, 0.1], 'claude-sonnet-5': [2, 10, 0.2],
  'claude-sonnet-4-6': [3, 15, 0.3], 'claude-sonnet-4-5': [3, 15, 0.3],
  'claude-sonnet-4': [3, 15, 0.3],
  'claude-haiku-5-5': [0.1, 0.5, 0.01], 'claude-haiku-4-5': [1, 5, 0.1],
}
const openai: Record<string, Rates> = {
  'gpt-6.2-astra': [8, 40, 0.4], 'gpt-6.2-sol': [2, 10, 0.1],
  'gpt-6-astra': [10, 50, 1], 'gpt-6.1-sol': [2, 10, 0.1],
  'gpt-6.1-terra': [1, 5, 0.05], 'gpt-6-luna': [0.1, 0.5, 0.01],
  'gpt-6-sol': [2, 10, 0.2], 'gpt-5.6-sol': [4, 20, 0.4],
  'gpt-5.6-terra': [2, 12, 0.2], 'gpt-5.6-luna': [0.2, 1.2, 0.02],
  'gpt-5.5': [5, 30, 0.5], 'gpt-5.5-pro': [30, 180, 0],
  'gpt-5.4': [2.5, 15, 0.25], 'gpt-5.4-pro': [30, 180, 0],
  'gpt-5.4-mini': [0.75, 4.5, 0.075], 'gpt-5.4-nano': [0.2, 1.25, 0.02],
  'gpt-5.3-codex': [1.75, 14, 0.175], 'gpt-5.2': [1.75, 14, 0.175],
  'gpt-5.2-pro': [21, 168, 0], 'gpt-5.1': [1.25, 10, 0.125],
  'gpt-5': [1.25, 10, 0.125], 'gpt-5-mini': [0.25, 2, 0.025],
  'gpt-5-nano': [0.05, 0.4, 0.005], 'gpt-5-pro': [15, 120, 0],
  'gpt-4.1': [2, 8, 0.5], 'gpt-4.1-mini': [0.4, 1.6, 0.1],
  'gpt-4o': [2.5, 10, 1.25], 'gpt-4o-mini': [0.15, 0.6, 0.075],
  'o3': [2, 8, 0.5], 'o3-pro': [20, 80, 0],
}

function lookup(model: string, rates: Record<string, Rates>): { id: string; rates: Rates } | null {
  // Only documented model IDs and their dated snapshots. Unknown future models
  // and third-party aliases must not silently inherit a made-up default price.
  const id = model.replace(/(?:-\d{8}|-\d{4}-\d{2}-\d{2})$/, '')
  return Object.hasOwn(rates, id) ? { id, rates: rates[id] } : null
}

export function estimateClaudeCost(model: string, tokens: Counters, hourWrites = 0): number {
  if (!Number.isSafeInteger(hourWrites) || hourWrites < 0 || hourWrites > tokens.cache_write_tokens) throw new Error('Invalid cache-write breakdown')
  const known = lookup(model, claude)
  if (!known) return 0
  const [input, output, read] = known.rates
  const prompt = tokens.input_tokens + tokens.cache_read_tokens + tokens.cache_write_tokens
  const longMultiplier = known.id === 'claude-haiku-5-5' && prompt > 100_000 ? 5 : 1
  return longMultiplier * (tokens.input_tokens * input + tokens.cache_read_tokens * read +
    (tokens.cache_write_tokens - hourWrites) * input * 1.25 + hourWrites * input * 2 +
    (tokens.output_tokens + tokens.reasoning_tokens) * output) / 1_000_000
}

export function hasClaudePrice(model: string): boolean { return lookup(model, claude) !== null }
export function hasCodexPrice(model: string): boolean { return lookup(model, openai) !== null }

export function estimateCodexCost(model: string, tokens: Counters): number {
  const known = lookup(model, openai)
  if (!known) return 0
  const [input, output, read] = known.rates
  const prompt = tokens.input_tokens + tokens.cache_read_tokens + tokens.cache_write_tokens
  const long = prompt > 272_000 && /^gpt-(?:6(?:\.|-)|5\.(?:6-|5(?:-|$)|4(?:-pro)?$))/.test(known.id)
  // Hooks don't expose cache-write TTL; use the documented shorter TTL rate.
  return (tokens.input_tokens * input * (long ? 2 : 1) + tokens.cache_read_tokens * read * (long ? 2 : 1) +
    tokens.cache_write_tokens * input * 1.25 * (long ? 2 : 1) +
    (tokens.output_tokens + tokens.reasoning_tokens) * output * (long ? 1.5 : 1)) / 1_000_000
}
