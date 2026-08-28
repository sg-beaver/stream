// 주(월요일 시작) 단위 날짜 계산 — 학생 근무 시간표·가능 시간 제출 화면이 함께 쓴다.

export const DAYS = ['월', '화', '수', '목', '금', '토', '일']

const pad2 = n => String(n).padStart(2, '0')

export const toIso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export const parseIso = iso => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (date, n) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + n)
  return d
}

// 그 날짜가 속한 주의 월요일
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // 월=0
  return d
}

// "2026.08.10 ~ 08.16"
export function weekLabel(monday) {
  const sunday = addDays(monday, 6)
  const head = `${monday.getFullYear()}.${pad2(monday.getMonth() + 1)}.${pad2(monday.getDate())}`
  return `${head} ~ ${pad2(sunday.getMonth() + 1)}.${pad2(sunday.getDate())}`
}

// 요일 라벨('월'~'일') → 그 주의 날짜
export const dateOfDayLabel = (weekStart, dayLabel) => addDays(weekStart, DAYS.indexOf(dayLabel))

// 그 주의 요일별 날짜 라벨 { '월': '08.31', ... } — 시간표 머리글에 날짜를 함께 보여줄 때
export function dayDateLabels(weekStart) {
  return Object.fromEntries(
    DAYS.map((day, i) => {
      const d = addDays(weekStart, i)
      return [day, `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`]
    }),
  )
}
