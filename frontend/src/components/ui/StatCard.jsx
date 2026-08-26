import * as LucideIcons from 'lucide-react'

const TONES = {
  neutral: { bg: 'var(--neutral-100)', fg: 'var(--neutral-600)',  val: 'var(--text-strong)' },
  success: { bg: 'var(--success-50)',  fg: 'var(--success)',      val: 'var(--success)' },
  warning: { bg: 'var(--warning-50)',  fg: 'var(--warning)',      val: 'var(--warning)' },
  info:    { bg: 'var(--info-50)',     fg: 'var(--info)',         val: 'var(--info)' },
  danger:  { bg: 'var(--danger-50)',   fg: 'var(--danger)',       val: 'var(--danger)' },
}

function Icon({ name, size = 22, color }) {
  const Comp = LucideIcons[name]
  if (!Comp) return null
  return <Comp size={size} color={color} strokeWidth={1.75} />
}

export default function StatCard({ stat, active, onClick }) {
  const t = TONES[stat.tone] || TONES.neutral
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0, textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        background: 'var(--surface-card)',
        border: active ? `1.5px solid ${t.fg}` : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: '18px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: 'var(--shadow-xs)',
        font: 'inherit',
      }}
    >
      <span style={{
        width: 44, height: 44, borderRadius: '50%',
        background: t.bg, color: t.fg, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={stat.icon} size={22} color={t.fg} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)' }}>{stat.label}</span>
        <span style={{ fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-extrabold)', lineHeight: 1.1, color: t.val }}>{stat.value}</span>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{stat.sub}</span>
      </span>
    </button>
  )
}
