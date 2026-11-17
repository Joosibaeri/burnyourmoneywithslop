import { ReactNode, CSSProperties } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'accent' | 'success' | 'danger' | 'info' | 'subscription'
  size?: 'sm' | 'md'
  className?: string
  style?: CSSProperties
}

export function Badge({ children, variant = 'default', size = 'md', className = '', style = {} }: BadgeProps) {
  const variantStyles: Record<string, React.CSSProperties> = {
    default: { background: 'var(--bg-elevated)', color: 'var(--fg-muted)', border: '1px solid var(--border)' },
    accent: { background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent)' },
    success: { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' },
    danger: { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' },
    info: { background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' },
    subscription: { background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' },
  }

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '2px 8px', fontSize: '0.7rem', height: 20, borderRadius: 999 },
    md: { padding: '4px 10px', fontSize: '0.75rem', height: 24, borderRadius: 999 },
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        lineHeight: 1,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
    >
      {children}
    </span>
  )
}