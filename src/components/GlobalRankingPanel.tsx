import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ComparisonTable } from '@/components/ComparisonTable'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getDemoGlobalRanking, loadGlobalRanking } from '@/lib/data'
import { comparisonLabel, type ComparisonMetric } from '@/lib/comparison'

export function GlobalRankingPanel({ metric }: { metric: ComparisonMetric }) {
  const { user, loading: authLoading } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const month = new Date().toISOString().slice(0, 7)
  const load = useCallback(() => isDemoMode ? Promise.resolve(getDemoGlobalRanking(month, metric, 5)) : loadGlobalRanking(supabase, month, metric, 5), [supabase, isDemoMode, month, metric])
  const { data, loading, error, reload } = useAsyncData(authLoading ? null : `global-preview:${month}:${metric}:${isDemoMode}:${user?.id ?? 'anonymous'}`, load)
  return <Card>
    <CardHeader>
      <div className="card-heading">
        <div><CardTitle>Global Ranking</CardTitle><CardDescription>Public statistics · {month} UTC · {comparisonLabel(metric)}</CardDescription></div>
        <Link to={`/ranking?metric=${metric}&month=${month}`}>View all →</Link>
      </div>
    </CardHeader>
    <CardContent>
      {loading || authLoading ? <p role="status">Loading global ranking…</p> : error ? <div><p role="alert">Could not load global ranking: {error}</p><Button variant="outline" onClick={reload}>Retry ranking</Button></div> : <ComparisonTable members={data?.members ?? []} metric={metric} currentUserId={user?.id} compact label="Global ranking preview" />}
      <p className="metric-help">Private statistics never appear here, even for shared-group members. <Link to="/settings">Manage your visibility</Link>.</p>
    </CardContent>
  </Card>
}
