// 30분 단위 슬롯(`요일-HH:MM`) ↔ 1시간 단위 그리드 변환.
// 공통 지원서(/profile)와 수업 시간은 30분 단위로 저장되지만, 공고 지원서의
// 근무 가능 시간 그리드는 공고 근무 시간과 같은 1시간 단위를 유지한다.

// 가능 시간은 보수적으로 낮춘다 — :00과 :30 두 칸이 모두 가능할 때만 그 시간을
// 가능으로 인정한다. 반쪽만 가능한 시간을 통째로 가능하다고 부풀리면 실제로는
// 일할 수 없는 시간대에 배정될 수 있다.
export const toHourlySlots = slots => {
  const set = new Set(slots ?? [])
  return [...set].filter(k => k.endsWith(':00') && set.has(`${k.slice(0, -3)}:30`))
}

// 수업은 반대 방향으로 보수적으로 — 30분이라도 수업이 걸친 시간대는 통째로 막는다.
export const classToHourly = slots =>
  [...new Set((slots ?? []).map(k => `${k.slice(0, k.lastIndexOf(':'))}:00`))]
