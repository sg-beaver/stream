import * as Icons from 'lucide-react'

// 관리자 화면 공용 패널/통계카드/확인모달 — SAINT 톤(테두리형 카드, tan 헤더) 유지, uiux/ui_kits/admin의 둥근 그림자 카드 스타일은 따르지 않음

// 헤더는 좁은 패널에서도 제목을 글자 단위로 쪼개지 않는다 — 우측 컨트롤이 넓으면
// 제목을 줄이는 대신 컨트롤이 통째로 아랫줄로 내려간다
export function AdminPanel({ title, right, children, style }) {
  return (
    <section style={{ background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '22px 26px', ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {title && <h3 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

const TONE_COLORS = {
  neutral: { bg: 'var(--neutral-100)', fg: 'var(--neutral-600)' },
  success: { bg: 'var(--success-50)', fg: 'var(--success)' },
  warning: { bg: 'var(--warning-50)', fg: 'var(--warning)' },
  info:    { bg: 'var(--info-50)', fg: 'var(--info)' },
  danger:  { bg: 'var(--danger-50)', fg: 'var(--danger)' },
}

export function AdminStatCard({ stat }) {
  const c = TONE_COLORS[stat.tone] || TONE_COLORS.neutral
  const Icon = Icons[stat.icon] || Icons.Circle
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', background: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} color={c.fg} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</span>
        <span style={{ fontSize: 'var(--fs-h2)', fontWeight: 800, lineHeight: 1.1, color: c.fg }}>{stat.value}</span>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{stat.sub}</span>
      </span>
    </div>
  )
}

export function ConfirmModal({ title, desc, confirmLabel, onCancel, onConfirm, danger = true }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,28,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ width: 420, background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', padding: 28, boxShadow: 'var(--shadow-xl)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-h3)', fontWeight: 800, color: 'var(--text-strong)' }}>{title}</h3>
        <p style={{ margin: '0 0 22px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, height: 42, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>취소</button>
          <button type="button" onClick={onConfirm} style={{ flex: 1, height: 42, background: danger ? 'var(--sogang-red)' : 'var(--success)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-on-brand)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
