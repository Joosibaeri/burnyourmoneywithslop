import { useSupabase } from '@/contexts/SupabaseContext'
import { AlertTriangle, X, ExternalLink } from 'lucide-react'
import { useState } from 'react'

export function DemoBanner() {
  const { isDemoMode } = useSupabase()
  const [dismissed, setDismissed] = useState(false)

  if (!isDemoMode || dismissed) return null

  return (
    <div style={{
      marginBottom: 24,
      padding: '16px 20px',
      background: 'var(--accent-bg)',
      border: '1px solid var(--accent)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <AlertTriangle size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
          Demo Mode — No Supabase Connection
        </p>
        <p style={{ color: 'var(--fg-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          This is a <strong>fully functional demo</strong> with mock data. No real usage is being tracked.
          To enable real tracking, connect a Supabase project and configure GitHub OAuth.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a
            href="https://supabase.com/docs/guides/getting-started/quickstarts/reactjs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'var(--bg)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            Setup Supabase
            <ExternalLink size={14} />
          </a>
          <a
            href="https://github.com/Joosibaeri/burnyourmoneywithslop/blob/main/docs/SUPABASE_SETUP.md"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: 'transparent',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            Full Guide
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32, height: 32,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--fg-subtle)',
          background: 'transparent',
          flexShrink: 0,
        }}
        aria-label="Dismiss demo banner"
      >
        <X size={18} />
      </button>
    </div>
  )
}