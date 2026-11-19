import type { MonthlyUsage } from '@/lib/data'
import { formatTokenCount, tokenMetricInfo, tokenRatio, tokenValue, type TokenMetric } from '@/lib/tokens'

export function TokenHistoryChart({ data, metric }: { data: Array<Pick<MonthlyUsage, 'month' | 'tokenTotals'>>; metric: TokenMetric }) {
  if (!data.length) return <p className="metric-help">No monthly usage recorded yet.</p>
  const info = tokenMetricInfo(metric)
  const values = data.map(month => tokenValue(month.tokenTotals, metric))
  const max = values.reduce((max, value) => value > max ? value : max, 1n)
  const slot = 500 / data.length
  return (
    <div>
      <svg width="100%" height="200" viewBox="0 0 580 200" role="img" aria-label={`${info.label} tokens by UTC month`}>
        <text x="40" y="14" fill="var(--fg-subtle)" fontSize="10">{formatTokenCount(max)} tokens</text>
        <line x1="40" x2="540" y1="170" y2="170" stroke="var(--border)" />
        {data.map((month, index) => {
          const height = tokenRatio(values[index], max) * 145
          const x = 40 + index * slot
          return <g key={month.month}>
            <rect x={x + slot * 0.2} y={170 - height} width={slot * 0.6} height={height} rx="3" fill="#60a5fa"><title>{month.month}: {formatTokenCount(values[index])} {info.label} tokens</title></rect>
            <text x={x + slot / 2} y="193" textAnchor="middle" fill="var(--fg-subtle)" fontSize="10">{month.month}</text>
          </g>
        })}
      </svg>
      <div className="table-scroll" role="region" aria-label="Exact monthly token counts" tabIndex={0}>
        <table className="stats-table">
          <thead><tr><th scope="col">UTC month</th><th scope="col">{info.label} tokens</th></tr></thead>
          <tbody>{data.map(month => <tr key={month.month}><th scope="row">{month.month}</th><td>{formatTokenCount(tokenValue(month.tokenTotals, metric))}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}
