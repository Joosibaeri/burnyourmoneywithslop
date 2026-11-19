import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Globe } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ComparisonControls } from '@/components/UsageControls'
import { ComparisonTable } from '@/components/ComparisonTable'
import { TokenDefinitions } from '@/components/TokenStats'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getDemoGlobalRanking, loadGlobalRanking } from '@/lib/data'
import { COMPARISON_OPTIONS, comparisonLabel, type ComparisonMetric } from '@/lib/comparison'

const PAGE_SIZE = 50

export function Ranking() {
  const { user, loading: authLoading } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const [params, setParams] = useSearchParams()
  const initialMetric = params.get('metric')
  const initialMonth = params.get('month')
  const [metric, setMetric] = useState<ComparisonMetric>(COMPARISON_OPTIONS.some(option => option.value === initialMetric) ? initialMetric as ComparisonMetric : 'total')
  const [month, setMonth] = useState(initialMonth === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth ?? '') ? initialMonth! : new Date().toISOString().slice(0, 7))
  const [page, setPage] = useState(0)
  const load = useCallback(() => isDemoMode ? Promise.resolve(getDemoGlobalRanking(month, metric, PAGE_SIZE, page * PAGE_SIZE)) : loadGlobalRanking(supabase, month, metric, PAGE_SIZE, page * PAGE_SIZE), [supabase, isDemoMode, month, metric, page])
  const { data, loading, error, reload } = useAsyncData(authLoading ? null : `ranking:${month}:${metric}:${page}:${isDemoMode}:${user?.id ?? 'anonymous'}`, load)
  const changeFilters = (newMonth: string, newMetric: ComparisonMetric) => {
    setMonth(newMonth)
    setMetric(newMetric)
    setPage(0)
    setParams({ month: newMonth, metric: newMetric }, { replace: true })
  }

  return <div>
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 8 }}><Globe size={28} style={{ verticalAlign: 'middle', marginRight: 10 }} />Global Ranking</h1>
      <p className="metric-help">Compare AI token usage and spending across all users with public statistics. No group membership or sign-in required.</p>
    </div>
    {isDemoMode && <p className="metric-help" style={{ marginBottom: 16 }}>Demo ranking—sample data only.</p>}
    <Card>
      <CardHeader>
        <CardTitle>Public Leaderboard</CardTitle>
        <CardDescription>{month === 'all' ? 'All recorded months' : `${month} UTC`} · Ranked by {comparisonLabel(metric)} · Ties share a rank</CardDescription>
      </CardHeader>
      <CardContent>
        <ComparisonControls month={month} metric={metric} onMonthChange={value => changeFilters(value, metric)} onMetricChange={value => changeFilters(month, value)} />
        <TokenDefinitions />
        <div style={{ marginTop: 20 }}>
          {loading || authLoading ? <p role="status">Loading global ranking…</p> : error ? <div><p role="alert">Could not load global ranking: {error}</p><Button variant="outline" onClick={reload}>Retry</Button></div> : <>
            <ComparisonTable members={data?.members ?? []} metric={metric} currentUserId={user?.id} onMetricChange={value => changeFilters(month, value)} label="Global leaderboard exact statistics" />
            <div className="ranking-pagination">
              <p className="metric-help">{data?.totalMembers ?? 0} public {data?.totalMembers === 1 ? 'user' : 'users'} with recorded usage in this period</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</Button>
                <span style={{ alignSelf: 'center' }}>Page {page + 1}</span>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= (data?.totalMembers ?? 0)} onClick={() => setPage(value => value + 1)}>Next</Button>
              </div>
            </div>
          </>}
        </div>
      </CardContent>
    </Card>
    <p className="metric-help" style={{ marginTop: 20 }}>Only public aggregate statistics are ranked. Private statistics remain available only to their owner and consenting group members. Real spending uses recorded subscription/invoice prices; model estimates are not additional charges.</p>
  </div>
}
