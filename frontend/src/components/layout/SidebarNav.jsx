import {
  Megaphone, Bookmark, IdCard, ClipboardList, CalendarDays,
  Repeat, UserCheck, Users, Settings2, CalendarCog, GraduationCap,
} from 'lucide-react'

// 좌측 STREAM 메뉴 — uiux/ui_kits/student/Shell.jsx의 사이드바 형태를 따른다.
// 흰 레일 + 라운드 항목, 항목마다 Lucide 아이콘, 활성 항목은 연한 빨강 배경.
// 학생 Shell과 관리자 AdminShell이 같은 좌측 바를 각자 들고 있어 70줄씩 중복돼 있던 것을 합쳤다.
// hover·active 배경은 tokens.css의 .stream-navitem 규칙이 담당한다(인라인으로 두면 규칙이 밀린다).

// mockData의 메뉴 정의가 아이콘 이름을 문자열로 들고 있어 여기서 컴포넌트로 잇는다.
const ICONS = {
  Megaphone, Bookmark, IdCard, ClipboardList, CalendarDays,
  Repeat, UserCheck, Users, Settings2, CalendarCog, GraduationCap,
}

const WIDTH = 248

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
      <div style={{ flexShrink: 0, padding: '28px 8px 0' }}>
        <button
          type="button"
          onClick={onToggle}
          title="사이드바 열기"
          aria-label="사이드바 열기"
          style={toggleStyle('var(--sogang-red)')}
        >»</button>
      </div>
    )
  }

  return (
    <aside style={{
      width: WIDTH, flex: `0 0 ${WIDTH}px`,
      background: 'var(--surface-card)',
      borderRight: '1px solid var(--border-subtle)',
      padding: '28px 16px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '0 12px 4px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-saint)', fontSize: 'var(--fs-h2)',
            fontWeight: 'var(--fw-extrabold)', color: 'var(--sogang-red)',
            letterSpacing: '0.04em', lineHeight: 1.2,
          }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)', marginTop: 4 }}>{subtitle}</div>
          )}
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title="사이드바 닫기"
            aria-label="사이드바 닫기"
            style={toggleStyle('var(--saint-toggle)')}
          >«</button>
        )}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 22, overflowY: 'auto', minHeight: 0 }}>
        {items.map(it => {
          const on = it.id === active
          const Icon = ICONS[it.icon]
          return (
            <button
              key={it.id}
              type="button"
              className="stream-navitem"
              data-active={on}
              aria-current={on ? 'page' : undefined}
              onClick={() => onSelect && onSelect(it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '11px 12px', borderRadius: 'var(--radius-xl)',
                border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-body)',
                fontWeight: on ? 'var(--fw-bold)' : 'var(--fw-medium)',
                color: on ? 'var(--sogang-red)' : 'var(--text-body)',
                textAlign: 'left', boxSizing: 'border-box',
              }}
            >
              {Icon && (
                <Icon
                  size={18}
                  strokeWidth={1.75}
                  color={on ? 'var(--sogang-red)' : 'var(--text-muted)'}
                  style={{ flexShrink: 0 }}
                />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            </button>
          )
        })}
      </nav>

      {footer && <div style={{ flexShrink: 0, marginTop: 'auto', paddingTop: 20 }}>{footer}</div>}
    </aside>
  )
}

function toggleStyle(bg) {
  return {
    flexShrink: 0, width: 24, height: 18,
    background: bg, border: 'none', borderRadius: 'var(--radius-xs)',
    color: 'var(--text-on-brand)', fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-bold)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
