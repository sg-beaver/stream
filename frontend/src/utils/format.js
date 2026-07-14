// 스펙(docs/API_SPEC.md) 형식의 데이터(ISO 날짜, 한글 status)를 화면 표기로 변환하는 유틸

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function parseISODate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = parseISODate(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${DAY_NAMES[d.getDay()]})`
}

export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${DAY_NAMES[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function daysUntil(deadline) {
  if (!deadline) return null
  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((parseISODate(deadline) - base) / 86400000)
}

export function calcDday(deadline) {
  const days = daysUntil(deadline)
  if (days === null || days < 0) return null
  return days === 0 ? 'D-DAY' : `D-${days}`
}

// 공고 표시 상태. 스펙 REQ-POST-004: 마감일이 지난 공고는 자동으로 "마감" 취급
export function postingUiStatus(posting) {
  const days = daysUntil(posting.deadline)
  if (posting.status === '마감' || (days !== null && days < 0)) return 'closed'
  if (days !== null && days <= 3) return 'closing'
  return 'open'
}

// 지원 상태(스펙: 제출완료 → 검토중 → 합격/불합격)를 StatusPill 키로 변환
const APPLICATION_STATUS_UI = {
  '제출완료': 'submitted',
  '검토중': 'screening',
  '합격': 'selected',
  '불합격': 'rejected',
}

export function applicationUiStatus(status) {
  return APPLICATION_STATUS_UI[status] ?? 'submitted'
}

export const APPLICATION_STEPS = ['제출완료', '검토중', '결과']

export function applicationStepIndex(status) {
  if (status === '합격' || status === '불합격') return 2
  if (status === '검토중') return 1
  return 0
}
