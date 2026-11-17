import { SelectHTMLAttributes, forwardRef } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = '', style = {}, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={className} style={{ width: '100%', ...style }}>
        {label && (
          <label
            htmlFor={selectId}
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
        <select
          ref={ref}
          id={selectId}
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
            cursor: 'pointer',
            appearance: 'none',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: 40,
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
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 6 }}>{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'