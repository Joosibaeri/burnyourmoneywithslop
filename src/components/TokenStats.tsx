import { formatTokenCount, TOKEN_METRICS, tokenValue, type TokenMetric, type TokenTotals } from '@/lib/tokens'

export function TokenStats({ tokens, selectedMetric }: { tokens: TokenTotals; selectedMetric?: TokenMetric }) {
  return (
    <dl className="token-stats" aria-label="Exact token statistics">
      {TOKEN_METRICS.map(metric => (
        <div key={metric.id} className={`token-stat${selectedMetric === metric.id ? ' token-stat-selected' : ''}`}>
          <dt>{metric.label} tokens</dt>
          <dd>{formatTokenCount(tokenValue(tokens, metric.id))}</dd>
          <dd className="token-stat-description">{metric.id === 'output' ? `${formatTokenCount(tokens.output)} output + ${formatTokenCount(tokens.reasoning)} reasoning` : metric.description}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TokenDefinitions() {
  return <p className="metric-help" style={{ marginTop: 12 }}>In counts uncached input sent to the model—not just what you type: prompts, system instructions, conversation context, and tool answers. Cached stays separate and includes cache reads and writes. Out includes reported reasoning. Total = Cached + In + Out; each category is counted once. Counts come from request usage, not from measuring prompt text; missing provider counters are not reconstructed.</p>
}
