import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', style = {}, ...props }, ref) => {
    const baseStyles = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontFamily: 'inherit',
      fontWeight: 600,
      borderRadius: 'var(--radius-sm)',
      border: '1px solid transparent',
      cursor: 'pointer',
      transition: 'all var(--transition)',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
    }

    const variantStyles: Record<string, React.CSSProperties> = {
      primary: {
        background: 'var(--accent)',
        color: 'var(--bg)',
        borderColor: 'var(--accent)',
      },
      secondary: {
        background: 'var(--bg-elevated)',
        color: 'var(--fg)',
        borderColor: 'var(--border)',
      },
      ghost: {
        background: 'transparent',
        color: 'var(--fg-muted)',
        borderColor: 'transparent',
      },
      danger: {
        background: 'var(--danger-bg)',
        color: 'var(--danger)',
        borderColor: 'var(--danger)',
      },
      outline: {
        background: 'transparent',
        color: 'var(--accent)',
        borderColor: 'var(--accent)',
      },
    }

    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: { padding: '6px 12px', fontSize: '0.8125rem', height: 32 },
      md: { padding: '10px 20px', fontSize: '0.875rem', height: 40 },
      lg: { padding: '14px 28px', fontSize: '1rem', height: 48 },
    }

    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={className}
        style={{
          ...baseStyles,
          ...variantStyles[variant],
          ...sizeStyles[size],
          opacity: isDisabled ? 0.5 : 1,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
        {...props}
      >
        {loading && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            style={{ animation: 'spin 1s linear infinite' }}
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeDasharray="31.4 31.4"
              strokeLinecap="round"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'