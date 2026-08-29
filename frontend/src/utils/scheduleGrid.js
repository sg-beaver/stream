// 근무표·수합 화면이 공통으로 쓰는 시간 계산 (순수 함수만 — JSX 없음).
//
// 근무표 편성과 수업 조교 편성이 같은 '가능 시간 확인'을 쓰게 되면서(#184 데모 정리),
// AdminSchedulePage 안에만 있던 헬퍼를 여기로 옮겼다. 두 화면이 같은 규칙으로
// 슬롯 키를 만들어야 격자가 어긋나지 않는다.

import { dayCols } from '../data/mockData'

export const DAY_LABELS = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' }
export const DAY_COLS = dayCols

export const pad2 = n => String(n).padStart(2, '0')
export const hhmm = t => String(t ?? '').slice(0, 5)
export const toMin = t => {
  const [h, m] = hhmm(t).split(':').map(Number)
  return h * 60 + m
}
export const minToHhmm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
export const isoToDots = iso => (iso ? iso.slice(0, 10).replaceAll('-', '.') : '')

export const addDaysIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}
export const isoToDate = iso => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayIsoDate = () => {
  const t = new Date()
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`
}

export const hoursBetween = (start, end) => (toMin(end) - toMin(start)) / 60

export const dayLabelOfIso = iso => {
  const [y, m, d] = iso.split('-').map(Number)
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()]
}

// 가능시간 구간(요일 + 시작~끝) → TimeGrid 슬롯 키 목록 ("월-14:30" 30분 단위)
// 학생 /profile 입력이 30분 단위가 되면서(#71) 수합 화면도 같은 해상도로 본다.
export function availabilityToSlotKeys(rows) {
  const keys = new Set()
  rows.forEach(r => {
    const day = DAY_LABELS[r.day_of_week]
    if (!day) return
    for (let m = toMin(r.start_time); m + 30 <= toMin(r.end_time); m += 30) {
      keys.add(`${day}-${minToHhmm(m)}`)
    }
  })
  return [...keys]
}

// 날짜별 가능 시간(주차별 조회 응답) → 슬롯 키. 요일 정수 대신 날짜에서 요일을 뽑는다.
export function dateAvailabilityToSlotKeys(rows) {
  const keys = new Set()
  rows.forEach(r => {
    const day = dayLabelOfIso(r.date.slice(0, 10))
    for (let m = toMin(r.start_time); m + 30 <= toMin(r.end_time); m += 30) {
      keys.add(`${day}-${minToHhmm(m)}`)
    }
  })
  return [...keys]
}

// 그 주의 날짜를 요일 머리글 아래에 붙인다 ("월" 아래 "08.31")
export function weekDaySubLabels(weekStartIso) {
  const labels = {}
  DAY_COLS.forEach((day, i) => {
    labels[day] = addDaysIso(weekStartIso, i).slice(5).replace('-', '.')
  })
  return labels
}

// 정책을 못 불러올 때의 기본 시간 행 (08:00~22:00, 30분 단위)
export const HALF_HOUR_ROWS = Array.from(
  { length: (22 - 8) * 2 },
  (_, i) => minToHhmm(8 * 60 + i * 30),
)

// 부서 학생 명단 + 수합 + 수업 시간 → 화면이 쓰는 로스터.
// 근무표 편성 화면도 같은 함수를 쓴다 (두 화면의 '확보/미확보' 판정이 갈리면 안 된다).
export function buildRoster(deptStudents, availability, classTime) {
  const byStudent = new Map()
  availability.forEach(row => {
    const key = row.student_id ?? row.student_name
    if (!byStudent.has(key)) byStudent.set(key, [])
    byStudent.get(key).push(row)
  })
  const classByStudent = new Map()
  ;(classTime ?? []).forEach(row => {
    const key = row.student_id ?? row.student_name
    if (!classByStudent.has(key)) classByStudent.set(key, [])
    classByStudent.get(key).push(row)
  })
  const hiredNames = new Map(deptStudents.map(a => [a.student_id, a.name]))

  const roster = [...new Set([...hiredNames.keys(), ...byStudent.keys()])].map(id => {
    const rows = byStudent.get(id) ?? []
    return {
      studentId: id,
      name: hiredNames.get(id) ?? rows[0]?.student_name ?? id,
      submitted: rows.length > 0,
      // 신규 선발 학생은 지원서 체크 시간이 연동되고(application), 기존 근로 학생은 직접 입력(manual)
      source: rows.find(r => r.source === 'application') ? 'application' : 'manual',
      hours: rows.reduce((sum, r) => sum + hoursBetween(r.start_time, r.end_time), 0),
      days: [...new Set(rows.map(r => r.day_of_week))].sort(),
      slotKeys: availabilityToSlotKeys(rows),
      classSlotKeys: availabilityToSlotKeys(classByStudent.get(id) ?? []),
      inHiredList: hiredNames.has(id),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return { roster }
}
