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
  return <p className="metric-help" style={{ marginTop: 12 }}>In excludes cache. Out includes reported reasoning. Cached includes cache reads and writes. Each category is counted once; missing provider counters are not reconstructed.</p>
}
