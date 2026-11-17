import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', style = {}, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={className} style={{ width: '100%', ...style }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--fg)',
              marginBottom: 6,
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            background: 'var(--bg)',
            color: 'var(--fg)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            outline: 'none',
            transition: 'all var(--transition)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--accent)'
            e.currentTarget.style.boxShadow = error
              ? '0 0 0 3px rgba(239, 68, 68, 0.15)'
              : '0 0 0 3px rgba(234, 179, 8, 0.15)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 6 }}>{error}</p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} style={{ color: 'var(--fg-subtle)', fontSize: '0.75rem', marginTop: 6 }}>{helperText}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'