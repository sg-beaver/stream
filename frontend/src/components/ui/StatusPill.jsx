const TONES = {
  open:      { fg: 'var(--success)',  bg: 'var(--success-50)',  bd: 'var(--success-100)', label: '모집중' },
  closing:   { fg: 'var(--warning)',  bg: 'var(--warning-50)',  bd: 'var(--warning-100)', label: '마감임박' },
  closed:    { fg: 'var(--neutral-600)', bg: 'var(--neutral-100)', bd: 'var(--neutral-200)', label: '마감' },
  submitted: { fg: 'var(--info)',     bg: 'var(--info-50)',     bd: 'var(--info-100)',    label: '제출완료' },
  screening: { fg: 'var(--warning)',  bg: 'var(--warning-50)',  bd: 'var(--warning-100)', label: '서류검토' },
  selected:  { fg: 'var(--success)',  bg: 'var(--success-50)',  bd: 'var(--success-100)', label: '선발' },
  waitlist:  { fg: 'var(--warning)',  bg: 'var(--warning-50)',  bd: 'var(--warning-100)', label: '예비번호' },
  rejected:  { fg: 'var(--danger)',   bg: 'var(--danger-50)',   bd: 'var(--danger-100)',  label: '미선발' },
  full:      { fg: 'var(--neutral-600)', bg: 'var(--neutral-100)', bd: 'var(--neutral-200)', label: '충원완료' },
}

export default function StatusPill({ status, label, style = {} }) {
  const t = TONES[status] || TONES.closed
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 22, padding: '0 9px',
      fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-semibold)', lineHeight: 1,
      borderRadius: 'var(--radius-pill)',
      color: t.fg, background: t.bg, border: `1px solid ${t.bd}`,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0 }} />
      {label ?? t.label}
    </span>
  )
}
