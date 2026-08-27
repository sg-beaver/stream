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

// 근로 기간 (period_start ~ period_end) → "2026.08.03 ~ 2026.10.30"
export function formatPeriod(start, end) {
  if (!start && !end) return ''
  const fmt = iso => {
    if (!iso) return ''
    const d = parseISODate(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
  }
  return [fmt(start), fmt(end)].filter(Boolean).join(' ~ ')
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

// 한글 받침 유무에 따라 조사를 붙인다 — 부서명이 데이터라 문장에 그대로 넣으면
// "정보서비스팀는"처럼 어색해진다. withJosa('정보서비스팀', '은', '는') → '정보서비스팀은'
export function withJosa(word, withFinal, withoutFinal) {
  const text = String(word ?? '')
  if (!text) return ''
  const code = text.charCodeAt(text.length - 1)
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
  return `${text}${hasFinal ? withFinal : withoutFinal}`
}
