// 디자인 시스템 Input (uiux/components/forms/Input.jsx 기준).
// hover/focus 상태는 styles/tokens.css의 .stream-input 규칙이 담당한다.
const SIZES = {
  sm: { height: 32, fontSize: 'var(--fs-sm)', pad: 10 },
  md: { height: 38, fontSize: 'var(--fs-body)', pad: 12 },
  lg: { height: 44, fontSize: 'var(--fs-title)', pad: 14 },
}

export default function Input({ size = 'md', invalid = false, disabled = false, iconLeft = null, iconRight = null, style = {}, ...rest }) {
  const s = SIZES[size] || SIZES.md
  const hasIcon = Boolean(iconLeft || iconRight)

  const field = (
    <input
      className="stream-input"
      disabled={disabled}
      aria-invalid={invalid || undefined}
      style={{
        width: '100%', height: s.height, boxSizing: 'border-box',
        padding: `0 ${iconRight ? s.height : s.pad}px 0 ${iconLeft ? s.height : s.pad}px`,
        fontFamily: 'var(--font-sans)', fontSize: s.fontSize,
        color: 'var(--text-strong)',
        background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
        border: `1px solid ${invalid ? 'var(--danger)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-sm)', outline: 'none',
        transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
        ...(hasIcon ? {} : style),
      }}
      {...rest}
    />
  )
  if (!hasIcon) return field

  const adorn = { position: 'absolute', top: 0, height: s.height, width: s.height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }
  return (
    <div style={{ position: 'relative', display: 'block', ...style }}>
      {iconLeft && <span style={{ ...adorn, left: 0, pointerEvents: 'none' }}>{iconLeft}</span>}
      {field}
      {iconRight && <span style={{ ...adorn, right: 0 }}>{iconRight}</span>}
    </div>
  )
}
