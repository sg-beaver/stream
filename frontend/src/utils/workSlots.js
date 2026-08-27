// 부서 정책(GET /api/schedule/policy/*) → 시간표 그리드 파생값.
// 담당자 화면(수합·근무표)과 학생 화면(가능 시간 제출)이 같은 격자를 그려야 해서
// 여기 한 곳에 모아 둔다.

export const DAY_LABELS = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' }

const pad2 = n => String(n).padStart(2, '0')
export const toMin = t => {
  const [h, m] = String(t ?? '').slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
export const minToHhmm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`

// 정책의 그리드 세로 범위 → TimeGrid rows("HH:MM" 30분 간격). 정책이 없으면 undefined
// (TimeGrid 기본 행을 쓰라는 뜻).
export function policyRows(policy) {
  if (!policy) return undefined
  const start = toMin(policy.grid_start_time)
  const end = toMin(policy.grid_end_time)
  const rows = []
  for (let m = start; m + 30 <= end; m += 30) rows.push(minToHhmm(m))
  return rows.length > 0 ? rows : undefined
}

// 그 날짜가 학기인지 방학인지 — 개관 시간·근무 슬롯이 기간마다 다르다.
// 학기 구간(policy.semesters)을 모르면 학기로 본다.
export function periodOfDate(policy, date) {
  const ranges = policy?.semesters ?? []
  if (ranges.length === 0) return 'semester'
  const pad = n => String(n).padStart(2, '0')
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return ranges.some(r => iso >= r.start.slice(0, 10) && iso <= r.end.slice(0, 10))
    ? 'semester'
    : 'vacation'
}

// 그 주의 요일별 기간 { '월': 'vacation', '화': 'semester', ... }.
// 개강 주처럼 한 주가 방학과 학기에 걸치면 요일마다 값이 달라진다.
export function periodByDayOfWeek(policy, weekStart) {
  const out = {}
  Object.values(DAY_LABELS).forEach((day, index) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)
    out[day] = periodOfDate(policy, d)
  })
  return out
}

// 특정 날짜가 없는 화면(매주 반복 패턴)용 — 모든 요일을 한 기간으로 통일한다
export function uniformPeriodByDay(period) {
  return Object.fromEntries(Object.values(DAY_LABELS).map(day => [day, period]))
}

// 정책의 기간별 요일 목록 → { 요일 라벨: [[시작분, 끝분], ...] }
function rangesByDay(periodDays) {
  return new Map(
    (periodDays ?? []).map(d => [
      DAY_LABELS[d.day_of_week],
      (d.ranges ?? []).map(r => [toMin(r.start_time), toMin(r.end_time)]),
    ]),
  )
}

// 요일별로 어느 기간 값을 쓸지 정한다. periodByDay가 없으면(주간 패턴 화면 등)
// 학기 정의가 있는 쪽을 쓰던 기존 동작 그대로다.
function pickPeriod(policy, field, day, periodByDay) {
  const byPeriod = policy?.[field] ?? {}
  if (periodByDay?.[day]) return byPeriod[periodByDay[day]] ?? []
  return byPeriod.semester?.length ? byPeriod.semester : byPeriod.vacation ?? []
}

// 부서 정의 근무 슬롯(#89) → TimeGrid dayBlocks 형태 { '월': [{start, end}], ... } (분).
// periodByDay({ '월': 'vacation', ... })를 주면 요일마다 그 날짜의 기간 값을 쓴다 —
// 한 주가 방학과 학기에 걸치는 개강 주를 제대로 그리기 위함. 블록 미정의면 null.
export function blocksByDayLabel(policy, periodByDay) {
  const map = {}
  let found = false
  Object.values(DAY_LABELS).forEach(day => {
    const days = pickPeriod(policy, 'work_slots', day, periodByDay)
    const entry = days.find(d => DAY_LABELS[d.day_of_week] === day)
    if (!entry) return
    found = true
    map[day] = entry.ranges.map(r => ({ start: toMin(r.start_time), end: toMin(r.end_time) }))
  })
  return found ? map : null
}

// 개관 시간 밖이라 근무가 없는 칸 — TimeGrid disabledSlots용.
// 블록은 개관 구간을 정확히 타일링하므로 블록 칸은 여기 걸리지 않는다.
export function closedSlotKeys(policy, rows, periodByDay) {
  if (!policy || !rows) return []
  const keys = []
  Object.values(DAY_LABELS).forEach(day => {
    const byDay = rangesByDay(pickPeriod(policy, 'opening_hours', day, periodByDay))
    const ranges = byDay.get(day)
    // 그 요일이 정책에 아예 없으면 판단 근거가 없으므로 막지 않는다
    if (ranges === undefined) return
    rows.forEach(time => {
      const m = toMin(time)
      if (!ranges.some(([s, e]) => m >= s && m + 30 <= e)) keys.push(`${day}-${time}`)
    })
  })
  return keys
}

// 슬롯 키 목록 → 요일별 합계 시간 문자열 { '월': '4h', ... } (TimeGrid footer values).
// 슬롯 하나는 30분이라 2개가 1시간이다.
export function hoursByDayLabel(slots) {
  const counts = {}
  ;(slots ?? []).forEach(key => {
    const day = key.split('-')[0]
    counts[day] = (counts[day] ?? 0) + 1
  })
  return Object.fromEntries(
    Object.values(DAY_LABELS).map(day => {
      const n = counts[day]
      return [day, n ? `${n % 2 ? (n / 2).toFixed(1) : n / 2}h` : '']
    }),
  )
}

// GET /api/schedule/policy/me/days 응답 → 그 주 그리드 파생값.
// 요일별 기본값(periodByDay 경로)과 달리 공휴일 단축·시험 연장·폐관이 이미 반영돼 있다.
export function gridFromDays(days, rows) {
  if (!days?.length || !rows?.length) return null
  const dayBlocks = {}
  const disabledSlots = []
  const notes = {}

  days.forEach(entry => {
    const [y, m, d] = entry.date.slice(0, 10).split('-').map(Number)
    const label = DAY_LABELS[((new Date(y, m - 1, d).getDay() + 6) % 7) + 1]
    const ranges = (entry.ranges ?? []).map(r => [toMin(r.start_time), toMin(r.end_time)])

    if (entry.note) notes[label] = entry.note
    if (entry.blocks?.length) {
      dayBlocks[label] = entry.blocks.map(b => ({
        start: toMin(b.start_time), end: toMin(b.end_time),
      }))
    }
    rows.forEach(time => {
      const minute = toMin(time)
      if (!ranges.some(([start, end]) => minute >= start && minute + 30 <= end)) {
        disabledSlots.push(`${label}-${time}`)
      }
    })
  })

  return {
    dayBlocks: Object.keys(dayBlocks).length > 0 ? dayBlocks : null,
    disabledSlots,
    notes,
  }
}
