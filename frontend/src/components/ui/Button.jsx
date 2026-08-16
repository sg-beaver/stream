const VARIANTS = {
  primary:   { background: 'var(--action-primary)', color: 'var(--text-on-brand)', border: '1px solid var(--action-primary)' },
  secondary: { background: 'var(--surface-card)',   color: 'var(--text-strong)',   border: '1px solid var(--border-default)' },
  ghost:     { background: 'transparent',            color: 'var(--text-body)',     border: '1px solid transparent' },
  danger:    { background: 'var(--danger)',           color: '#fff',                 border: '1px solid var(--danger)' },
}

const SIZES = {
  sm: { height: 30, padding: '0 12px', fontSize: 'var(--fs-sm)', gap: 6 },
  md: { height: 38, padding: '0 16px', fontSize: 'var(--fs-body)', gap: 8 },
  lg: { height: 44, padding: '0 22px', fontSize: 'var(--fs-title)', gap: 8 },
}

export default function Button({ variant = 'primary', size = 'md', block = false, disabled = false, type = 'button', style = {}, children, ...rest }) {
  const s = SIZES[size] || SIZES.md
  const v = VARIANTS[variant] || VARIANTS.primary
  return (
    <button
      type={type}
      disabled={disabled}
      className="stream-btn"
      data-variant={variant}
      style={{
        display: block ? 'flex' : 'inline-flex',
        width: block ? '100%' : 'auto',
        alignItems: 'center', justifyContent: 'center',
        gap: s.gap, height: s.height, padding: s.padding,
        fontFamily: 'var(--font-sans)', fontSize: s.fontSize,
        fontWeight: 'var(--fw-semibold)', lineHeight: 1,
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
        whiteSpace: 'nowrap',
        ...v, ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
