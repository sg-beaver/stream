// 디자인 시스템 Tabs (uiux/components/navigation/Tabs.jsx 기준).
// 페이지 안에서 뷰를 전환하는 밑줄 탭 바. tabs: [{ id, label, badge }]
export default function Tabs({ tabs = [], active, onChange, style = {} }) {
  return (
    <div role="tablist" style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border-default)', ...style }}>
      {tabs.map(t => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            className="stream-tab"
            onClick={() => onChange && onChange(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 14px', marginBottom: -1,
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-body)',
              fontWeight: on ? 'var(--fw-semibold)' : 'var(--fw-medium)',
              color: on ? 'var(--text-brand)' : 'var(--text-muted)',
              borderBottom: `2px solid ${on ? 'var(--sogang-red)' : 'transparent'}`,
              transition: 'color var(--dur-fast) var(--ease-standard)',
            }}
          >
            {t.label}
            {t.badge != null && (
              <span style={{
                fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-bold)',
                background: on ? 'var(--sogang-red-50)' : 'var(--neutral-100)',
                color: on ? 'var(--sogang-red)' : 'var(--text-muted)',
                borderRadius: 'var(--radius-pill)', padding: '1px 7px',
                fontVariantNumeric: 'tabular-nums',
              }}>{t.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
