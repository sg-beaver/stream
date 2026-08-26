// 디자인 시스템 Select (uiux/components/forms/Select.jsx 기준).
// 네이티브 select의 화살표를 지우고 DS 셰브론을 얹는다.
const SIZES = {
  sm: { height: 32, fontSize: 'var(--fs-sm)' },
  md: { height: 38, fontSize: 'var(--fs-body)' },
  lg: { height: 44, fontSize: 'var(--fs-title)' },
}

export default function Select({ size = 'md', invalid = false, disabled = false, style = {}, children, ...rest }) {
  const s = SIZES[size] || SIZES.md
  return (
    <div style={{ position: 'relative', display: 'block', ...style }}>
      <select
        className="stream-select"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        style={{
          width: '100%', height: s.height, boxSizing: 'border-box',
          padding: '0 34px 0 12px',
          fontFamily: 'var(--font-sans)', fontSize: s.fontSize,
          color: 'var(--text-strong)',
          background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
          border: `1px solid ${invalid ? 'var(--danger)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-sm)', outline: 'none',
          appearance: 'none', WebkitAppearance: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
        }}
        {...rest}
      >
        {children}
      </select>
      <span aria-hidden="true" style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
        borderTop: '5px solid var(--text-muted)', pointerEvents: 'none',
      }} />
    </div>
  )
}
