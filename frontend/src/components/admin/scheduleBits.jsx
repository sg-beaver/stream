import { AlertCircle } from 'lucide-react'

// 근무표·수합 화면이 함께 쓰는 작은 표시 조각. 근무표 편성과 수업 조교 편성이
// 같은 '가능 시간 확인'을 쓰게 되면서 AdminSchedulePage에서 여기로 옮겼다.

export function EmptyNote({ children }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>{children}</div>
}

export function ErrorNote({ message }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--sogang-red)' }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  )
}

export const weekArrowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, background: 'none', border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer', flexShrink: 0 }

export const weekTabStyle = on => ({
  height: 28, padding: '0 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', fontWeight: 700,
  border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
  background: on ? 'var(--sogang-red-50)' : 'var(--surface-card)', color: on ? 'var(--sogang-red)' : 'var(--text-body)',
})

// 수합 표의 칸 색 — 인원수와 무관한 단색 두 가지 + 개관 외 빗금.
// 학생 개인 시간표(TimeGrid)의 '가능' 칸과 같은 톤이라 두 표를 나란히 봐도 읽는 법이 같다.
export const AVAILABLE_FILL = 'var(--success-50)'
export const CLOSED_FILL = 'repeating-linear-gradient(45deg, var(--neutral-25), var(--neutral-25) 4px, var(--neutral-50) 4px, var(--neutral-50) 8px)'

export const headCellStyle = {
  border: '1px solid var(--saint-grid)',
  background: 'var(--saint-tan)',
  color: 'var(--saint-maroon)',
  fontSize: 'var(--fs-sm)', fontWeight: 700,
  padding: '6px 4px', textAlign: 'center',
}
