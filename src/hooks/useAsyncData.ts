import { useEffect, useState } from 'react'

// A result belongs to one request/account key. Changing the key immediately
// hides stale data without synchronously resetting state inside an effect.
export function useAsyncData<T>(key: string | null, load: () => Promise<T>) {
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null)
  useEffect(() => {
    if (key === null) return
    let active = true
    Promise.resolve().then(load)
      .then(data => { if (active) setResult({ key, data, error: null }) })
      .catch(error => { if (active) setResult({ key, data: null, error: error instanceof Error ? error.message : 'Could not load data.' }) })
    return () => { active = false }
  }, [key, load])
  const current = key !== null && result?.key === key ? result : null
  return { data: current?.data ?? null, error: current?.error ?? null, loading: key !== null && !current }
}
