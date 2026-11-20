import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { COMPARISON_OPTIONS, comparisonLabel, formatComparisonValue, type ComparisonMetric, type RankedMember } from '@/lib/comparison'

export function ComparisonTable({ members, metric, currentUserId, onMetricChange, compact = false, label = 'Leaderboard exact statistics' }: {
  members: RankedMember[]
  metric: ComparisonMetric
  currentUserId?: string
  onMetricChange?: (metric: ComparisonMetric) => void
  compact?: boolean
  label?: string
}) {
  if (!members.length) return <p className="metric-help">No recorded usage for this period.</p>
  const columns = [metric, ...(compact ? [] : COMPARISON_OPTIONS.map(option => option.value as ComparisonMetric).filter(option => option !== metric))]
  return (
    <>
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="stats-table comparison-table">
        <caption className="visually-hidden">Exact statistics, ranked by {comparisonLabel(metric)}. Ties share a rank. In includes uncached prompts, system instructions, context and tool answers. Cached stays separate and includes reads and writes. Out includes reasoning.</caption>
        <thead><tr>
          <th scope="col">Rank</th><th scope="col" className="identity-cell">Member</th>
          {columns.map(column => <th key={column} scope="col" aria-sort={column === metric ? 'descending' : undefined} className={column === metric ? 'selected-metric' : ''}>
            {onMetricChange ? <button onClick={() => onMetricChange(column)} aria-label={`Rank by ${comparisonLabel(column)}`}>{comparisonLabel(column)}{column === metric ? ' ↓' : ''}</button> : comparisonLabel(column)}
          </th>)}
        </tr></thead>
        <tbody>{members.map(member => <tr key={member.id} className={member.id === currentUserId ? 'current-user-row' : ''}>
          <td>#{member.rank}</td>
          <th scope="row" className="identity-cell">
            <div className="member-identity">
              {member.avatar || member.login ? <img src={member.avatar || `https://github.com/${member.login}.png`} alt="" loading="lazy" /> : <span className="avatar-placeholder" aria-hidden="true">?</span>}
              <div>
                {member.login ? <Link to={`/@${member.login}`}>{member.name === 'you' ? 'You' : member.name}</Link> : member.name}
                {member.id === currentUserId && <Badge variant="accent" size="sm" style={{ marginLeft: 6 }}>You</Badge>}
                {member.login && <p>@{member.login}</p>}
              </div>
            </div>
          </th>
          {columns.map(column => <td key={column} className={column === metric ? 'selected-metric' : ''}>
            {formatComparisonValue(member, column)}
            {column === 'cost' && member.unknownCostEvents > 0 && <span className="partial-estimate" title={`${member.unknownCostEvents} requests have unavailable pricing`}> partial</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {!compact && <p className="table-scroll-hint">Scroll sideways to compare every exact category.</p>}
    </>
  )
}
