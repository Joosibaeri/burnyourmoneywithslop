import { useId } from 'react'
import { Select } from '@/components/ui/Select'
import { COMPARISON_OPTIONS, type ComparisonMetric } from '@/lib/comparison'
import { TOKEN_METRICS, type TokenMetric } from '@/lib/tokens'

export function TokenFilter({ metric, onChange }: { metric: TokenMetric; onChange: (metric: TokenMetric) => void }) {
  const id = useId()
  return <Select id={id} label="Token metric" value={metric} onChange={event => onChange(event.target.value as TokenMetric)} options={TOKEN_METRICS.map(option => ({ value: option.id, label: `${option.label} tokens` }))} style={{ maxWidth: 340 }} />
}

export function ComparisonControls({ month, metric, onMonthChange, onMetricChange }: {
  month: string
  metric: ComparisonMetric
  onMonthChange: (month: string) => void
  onMetricChange: (metric: ComparisonMetric) => void
}) {
  const id = useId()
  const currentMonth = new Date().toISOString().slice(0, 7)
  return (
    <div className="comparison-controls">
      <Select id={`${id}-metric`} label="Compare by" value={metric} onChange={event => onMetricChange(event.target.value as ComparisonMetric)} options={COMPARISON_OPTIONS} style={{ maxWidth: 340 }} />
      <div className="month-control">
        <label htmlFor={`${id}-month`}>UTC month</label>
        <input id={`${id}-month`} type="month" value={month === 'all' ? '' : month} disabled={month === 'all'} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onMonthChange(event.target.value) }} />
      </div>
      <label className="all-time-control"><input type="checkbox" checked={month === 'all'} onChange={event => onMonthChange(event.target.checked ? 'all' : currentMonth)} /> All time</label>
    </div>
  )
}
