import { APPLICATION_STEPS, applicationStepIndex } from '../../utils/format'

const SIZES = {
  sm: { circle: 20, icon: 9, label: 10, gap: 5 },
  md: { circle: 28, icon: 12, label: 11, gap: 6 },
  lg: { circle: 36, icon: 14, label: 12, gap: 8 },
}

// status: 스펙 값 (제출완료/검토중/합격/불합격)
export default function Stepper({ status, size = 'md' }) {
  const s = SIZES[size] ?? SIZES.md
  const current = applicationStepIndex(status)
  const isFail = status === '불합격'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {APPLICATION_STEPS.map((step, i) => {
        const done = i < current
        const isCurrent = i === current
        const isLast = i === APPLICATION_STEPS.length - 1

        let color = 'var(--neutral-300)'
        let bg = 'var(--neutral-100)'
        let content = i + 1
        let textColor = 'var(--text-subtle)'
        if (done) {
          color = bg = textColor = 'var(--success)'
          content = '✓'
        } else if (isCurrent) {
          if (isLast) {
            color = bg = textColor = isFail ? 'var(--danger)' : 'var(--success)'
            content = isFail ? '✕' : '✓'
          } else {
            color = bg = textColor = 'var(--sogang-red)'
          }
        }

        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 'none' : 1 }}>
            <div style={{ textAlign: 'center', minWidth: s.circle + 28 }}>
              <div style={{
                width: s.circle, height: s.circle, borderRadius: '50%',
                background: bg, border: `2px solid ${color}`, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: `0 auto ${s.gap}px`, fontSize: s.icon, fontWeight: 700,
                color: done || isCurrent ? '#fff' : 'var(--text-subtle)',
              }}>
                {content}
              </div>
              <div style={{ fontSize: s.label, fontWeight: done || isCurrent ? 700 : 400, color: textColor, whiteSpace: 'nowrap' }}>
                {step}
              </div>
            </div>
            {!isLast && (
              <div style={{
                flex: 1, minWidth: 16, height: 2,
                background: done ? 'var(--success)' : 'var(--neutral-200)',
                margin: `0 4px ${s.label + s.gap}px`,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
