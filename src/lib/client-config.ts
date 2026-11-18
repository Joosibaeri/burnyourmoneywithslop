export function isPublishableKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true
  try {
    const payload = key.split('.')[1]
    if (!payload) return false
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'
  } catch { return false }
}

export function storedClientConfig(): { url: string; key: string } {
  try {
    return { url: window.localStorage.getItem('supabase_url') ?? '', key: window.localStorage.getItem('supabase_key') ?? '' }
  } catch { return { url: '', key: '' } }
}
