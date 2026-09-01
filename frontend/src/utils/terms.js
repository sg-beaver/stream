// 수강 학기 — 수업 시간표를 묶는 단위 (GET /api/class-time/terms).
// 시간표는 학기마다 다르므로 화면은 "지금 어느 학기를 보고 있는지"를 늘 알아야 한다.

// 그 날짜가 속한 학기 키. 학기 사이 방학이면 null
export function termKeyOfDate(terms, date) {
  const pad = n => String(n).padStart(2, '0')
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const hit = (terms ?? []).find(t => iso >= t.start.slice(0, 10) && iso <= t.end.slice(0, 10))
  return hit ? hit.key : null
}

// 그 날짜 기준으로 화면에 띄울 학기 — 방학이면 다가오는 학기, 그마저 없으면 마지막 학기.
// 서버 term_for와 같은 규칙이다 (방학에 다음 학기 시간표를 미리 짜는 흐름)
export function termKeyForDate(terms, date, fallback) {
  const inTerm = termKeyOfDate(terms, date)
  if (inTerm) return inTerm
  const pad = n => String(n).padStart(2, '0')
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const upcoming = (terms ?? []).filter(t => t.start.slice(0, 10) > iso)
  if (upcoming.length > 0) {
    return upcoming.reduce((a, b) => (a.start <= b.start ? a : b)).key
  }
  if (terms?.length) return terms.reduce((a, b) => (a.end >= b.end ? a : b)).key
  return fallback ?? null
}

export const termLabel = (terms, key) =>
  (terms ?? []).find(t => t.key === key)?.label ?? key ?? ''

// 그 학기를 대표하는 날짜. 학기는 통째로 학기 중이거나 통째로 방학이라
// (여름·겨울 학기가 곧 방학) 시작일 하나면 개관 시간을 판정하기에 충분하다.
export function termStartDate(terms, key) {
  const hit = (terms ?? []).find(t => t.key === key)
  if (!hit) return null
  const [y, m, d] = hit.start.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ---- 격주 배정 블록 경계 ----
//
// 부서는 근무표를 2주씩 끊어서 계속 돌린다. 그 2주가 어디서 끊기는지는 학년도마다
// 한 번 정해지고 고정된다 — 3월 개강 첫날이 든 주가 1주차, 이후 1-2 / 3-4 / 5-6주차.
// 남는 날짜는 2월 말(다음 3월 개강 전)에 몰아서 처리한다.
//
// 판정 규칙은 백엔드 `app/biweekly.py`와 같다. 여기 것은 누르기 전에 알려 주는 용도고,
// 실제로 막는 것은 백엔드다 (POST /api/schedule/generate 400).

const isoOf = d => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const dateOf = iso => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
const mondayOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))

// 1주차 월요일 = 3월 개강 첫날이 든 주의 월요일. 학기 목록이 없으면 null
// (부르는 쪽은 '격주 판정 불가'로 읽고 월요일 검사만 한다).
export function biweeklyAnchorMonday(terms) {
  if (!terms?.length) return null
  const spring = terms.reduce((a, b) => (a.start <= b.start ? a : b))
  return mondayOf(dateOf(spring.start))
}

// 그 학년도 기준 주차 (1주차 = 1). 기준을 모르면 null
export function biweeklyWeekIndex(terms, iso) {
  const anchor = biweeklyAnchorMonday(terms)
  if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  return Math.floor((dateOf(iso) - anchor) / 604800000) + 1
}

// 2주 블록을 여기서 시작해도 되는 날인지 — 월요일이면서 홀수 주차
export function isBiweeklyBlockStart(terms, iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return true
  if (dateOf(iso).getDay() !== 1) return false
  const index = biweeklyWeekIndex(terms, iso)
  return index === null || index % 2 === 1
}

// "그 날짜는 안 됩니다"로 끝내지 않고 쓸 수 있는 날짜를 같이 준다
export function surroundingBlockStarts(terms, iso) {
  let monday = mondayOf(dateOf(iso))
  if (!isBiweeklyBlockStart(terms, isoOf(monday))) {
    monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7)
  }
  const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 14)
  return [isoOf(monday), isoOf(next)]
}
