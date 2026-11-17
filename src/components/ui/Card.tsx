import { ReactNode } from 'react'

import { CSSProperties } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ children, className = '', style, onClick, padding = 'md' }: CardProps) {
  const paddingMap = {
    none: '0',
    sm: '16px',
    md: '20px',
    lg: '24px',
  }

  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: paddingMap[padding],
        boxShadow: 'var(--shadow)',
        transition: 'all var(--transition)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={onClick ? (e) => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'var(--shadow)'
      } : undefined}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={className} style={{ marginBottom: 16, ...style }}>{children}</div>
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={className} style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--fg)' }}>{children}</h3>
}

export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={className} style={{ color: 'var(--fg-muted)', fontSize: '0.875rem', marginTop: 4 }}>{children}</p>
}

export function CardContent({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={className} style={style}>{children}</div>
}

export function CardFooter({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={className} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', ...style }}>{children}</div>
}