// 디자인 시스템 Alert (uiux/components/feedback/Alert.jsx 기준).
// 페이지·섹션 단위 메시지 배너. tone이 시맨틱 색 3종(글자/배경/테두리)을 결정한다.
const TONES = {
  info:    { fg: 'var(--info)',        bg: 'var(--info-50)',    bd: 'var(--info-100)' },
  success: { fg: 'var(--success)',     bg: 'var(--success-50)', bd: 'var(--success-100)' },
  warning: { fg: 'var(--warning)',     bg: 'var(--warning-50)', bd: 'var(--warning-100)' },
  danger:  { fg: 'var(--danger)',      bg: 'var(--danger-50)',  bd: 'var(--danger-100)' },
  neutral: { fg: 'var(--neutral-700)', bg: 'var(--neutral-50)', bd: 'var(--neutral-200)' },
}

export default function Alert({ tone = 'info', title, icon, onDismiss, style = {}, children, ...rest }) {
  const t = TONES[tone] || TONES.info
  return (
    <div
      role="status"
      style={{
        display: 'flex', gap: 12, padding: '12px 14px',
        background: t.bg,
        border: `1px solid ${t.bd}`,
        borderLeft: `3px solid ${t.fg}`,
        borderRadius: 'var(--radius-sm)',
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: t.fg, display: 'inline-flex', flex: '0 0 auto', marginTop: 1 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', marginBottom: children ? 3 : 0 }}>{title}</div>}
        {children && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-body)', lineHeight: 1.55 }}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button" onClick={onDismiss} aria-label="닫기"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', width: 24, height: 24, borderRadius: 'var(--radius-xs)', flex: '0 0 auto', fontSize: 16, lineHeight: 1 }}
        >×</button>
      )}
    </div>
  )
}
