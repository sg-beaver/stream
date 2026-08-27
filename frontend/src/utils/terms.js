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
