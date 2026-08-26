// 디자인 시스템 SidebarNav (uiux/components/navigation/SidebarNav.jsx 기준).
// 학생 Shell과 관리자 AdminShell이 같은 좌측 바를 각자 들고 있어 70줄씩 중복돼 있었다.
// hover·active 배경은 tokens.css의 .stream-navitem 규칙이 담당한다.
const WIDTH = 232

export default function SidebarNav({
  title,
  subtitle,
  items = [],
  active,
  onSelect,
  footer,
  collapsed = false,
  onToggle,
}) {
  if (collapsed) {
    return (
      <div style={{ flexShrink: 0, padding: '18px 8px 0' }}>
        <button
          type="button"
          onClick={onToggle}
          title="사이드바 열기"
          aria-label="사이드바 열기"
          style={toggleStyle('var(--sogang-red)', 'var(--text-on-brand)')}
        >»</button>
      </div>
    )
  }

  return (
    <aside style={{
      width: WIDTH, flex: `0 0 ${WIDTH}px`,
      padding: '18px 14px',
      background: 'var(--surface-page)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', gap: 14,
      overflow: 'hidden', minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '0 4px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{
            fontFamily: 'var(--font-saint)', fontSize: 'var(--fs-h3)',
            fontWeight: 'var(--fw-extrabold)', color: 'var(--sogang-red)', lineHeight: 1.2,
          }}>{title}</h2>
          {subtitle && (
            <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</p>
          )}
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title="사이드바 닫기"
            aria-label="사이드바 닫기"
            style={toggleStyle('var(--saint-toggle)', 'var(--text-on-brand)')}
          >«</button>
        )}
      </div>

      <nav style={{
        border: '1px solid var(--saint-panel-border)', borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-card)', overflowY: 'auto', minHeight: 0,
      }}>
        {items.map((it, i) => {
          const on = it.id === active
          return (
            <button
              key={it.id}
              type="button"
              className="stream-navitem"
              data-active={on}
              aria-current={on ? 'page' : undefined}
              onClick={() => onSelect && onSelect(it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px',
                border: 'none',
                borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--neutral-100)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-body)',
                fontWeight: on ? 'var(--fw-bold)' : 'var(--fw-medium)',
                color: on ? 'var(--sogang-red)' : 'var(--neutral-800)',
                textAlign: 'left', boxSizing: 'border-box',
              }}
            >
              <span aria-hidden="true" style={{
                width: 7, height: 7, flex: '0 0 auto',
                background: 'var(--sogang-red)', opacity: on ? 1 : 0.85,
              }} />
              <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            </button>
          )
        })}
      </nav>

      {footer && <div style={{ flexShrink: 0 }}>{footer}</div>}
    </aside>
  )
}

function toggleStyle(bg, fg) {
  return {
    flexShrink: 0, width: 24, height: 18,
    background: bg, border: 'none', borderRadius: 'var(--radius-xs)',
    color: fg, fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-bold)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
