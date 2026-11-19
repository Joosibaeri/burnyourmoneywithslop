// Collector counters are disjoint: input excludes cache, output excludes
// separately reported reasoning. Keep integers exact; only charts use ratios.
export interface TokenTotals {
  input: bigint
  output: bigint
  reasoning: bigint
  cacheRead: bigint
  cacheWrite: bigint
}

export interface TokenCounterRecord {
  input_tokens: string | number
  output_tokens: string | number
  reasoning_tokens: string | number
  cache_read_tokens: string | number
  cache_write_tokens: string | number
}

export const TOKEN_METRICS = [
  { id: 'input', label: 'In', description: 'Uncached input tokens' },
  { id: 'output', label: 'Out', description: 'Output, including separately reported reasoning' },
  { id: 'input_output', label: 'In + Out', description: 'Uncached input + output (including reasoning)' },
  { id: 'total', label: 'Cached + In + Out', description: 'Cache reads + cache writes + input + output (including reasoning)' },
  { id: 'cached', label: 'Cached', description: 'Cache reads + cache writes' },
  { id: 'cache_read', label: 'Cache read', description: 'Reported cache-read input tokens' },
  { id: 'cache_write', label: 'Cache write', description: 'Reported cache-write input tokens' },
  { id: 'reasoning', label: 'Reasoning', description: 'Separately reported reasoning; already included in Out' },
] as const

export type TokenMetric = typeof TOKEN_METRICS[number]['id']

export function emptyTokenTotals(): TokenTotals {
  return { input: 0n, output: 0n, reasoning: 0n, cacheRead: 0n, cacheWrite: 0n }
}

export function parseTokenCount(value: string | number): bigint {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Token count is not an exact non-negative integer.')
  }
  if (!/^\d+$/.test(String(value))) throw new Error('Invalid token count.')
  return BigInt(value)
}

export function addTokenTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input, output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite,
  }
}

export function tokenTotalsFromRecord(row: TokenCounterRecord): TokenTotals {
  return {
    input: parseTokenCount(row.input_tokens), output: parseTokenCount(row.output_tokens),
    reasoning: parseTokenCount(row.reasoning_tokens),
    cacheRead: parseTokenCount(row.cache_read_tokens), cacheWrite: parseTokenCount(row.cache_write_tokens),
  }
}

export function tokenValue(tokens: TokenTotals, metric: TokenMetric): bigint {
  const out = tokens.output + tokens.reasoning
  const cached = tokens.cacheRead + tokens.cacheWrite
  switch (metric) {
    case 'input': return tokens.input
    case 'output': return out
    case 'input_output': return tokens.input + out
    case 'total': return cached + tokens.input + out
    case 'cached': return cached
    case 'cache_read': return tokens.cacheRead
    case 'cache_write': return tokens.cacheWrite
    case 'reasoning': return tokens.reasoning
  }
}

export function tokenMetricInfo(metric: TokenMetric) {
  return TOKEN_METRICS.find(option => option.id === metric)!
}

export function formatTokenCount(value: bigint): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function tokenRatio(value: bigint, max: bigint): number {
  return max > 0n ? Number(value * 1_000_000n / max) / 1_000_000 : 0
}

// Demo data is explicitly synthetic; never infer category counts for real usage.
export function demoTokenTotals(total: number): TokenTotals {
  const tokens = BigInt(total)
  const input = tokens * 50n / 100n
  const output = tokens * 15n / 100n
  const reasoning = tokens * 5n / 100n
  const cacheWrite = tokens * 5n / 100n
  return { input, output, reasoning, cacheWrite, cacheRead: tokens - input - output - reasoning - cacheWrite }
}
