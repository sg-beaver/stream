// 재원(교비/국가)별 근로시간 집계.
//
// 부서 2주 총합 상한(HC-TIME-4)은 교비만 대상이라, 전체 합계로는 상한을 볼 수 없다.
// 챗봇이 부서 전체 합계(214h)를 교비 상한(190h)과 비교해 "24시간 초과"라고 답한 적이
// 있는데(#260, 실제 교비는 185.5h) 담당자도 화면에서 같은 실수를 하기 쉽다 — 초안
// 집계표에 학생별 시간만 있어 재원별로는 눈으로 더해야 했다.
//
// 계산만 하는 모듈이라 scheduleGrid와 같은 층에 둔다.

import { DAY_COLS, hoursBetween } from './scheduleGrid'

export const FUNDING_LABELS = [
  ['gyobi', '교비'],
  ['gukga', '국가'],
  // 챗봇이 추가한 학생이 per_student에 없을 수 있다. 교비로 뭉뚱그리면 상한 판단이
  // 틀리므로 따로 세고, 0이면 아예 보여주지 않는다.
  ['unknown', '재원 미상'],
]

/** 학번 → 재원. per_student에 없거나 모르는 값이면 'unknown' — 추측하지 않는다. */
export function fundingLookup(perStudent) {
  const byId = new Map((perStudent ?? []).map(s => [s.student_id, s.funding_type]))
  return sid => {
    const funding = byId.get(sid)
    return funding === 'gyobi' || funding === 'gukga' ? funding : 'unknown'
  }
}

/** 배정 목록을 재원별 시간 합계로 접는다.
 *
 * 편집 중이면 편집 결과 기준으로 부른다 — 확정되는 것이 그 값이므로 상한과 견줘야
 * 하는 것도 그 값이다.
 */
export function fundingHours(schedules, fundingOf) {
  const totals = { gyobi: 0, gukga: 0, unknown: 0 }
  schedules.forEach(x => {
    totals[fundingOf(x.student_id)] += hoursBetween(x.start_time, x.end_time)
  })
  return totals
}

/** 그 주 집계표에 붙일 재원별 소계 행 (요일 축은 학생 행과 같다). */
export function weekFundingSubtotals(rows, fundingOf) {
  const buckets = new Map()
  rows.forEach(r => {
    const key = fundingOf(r.studentId)
    if (!buckets.has(key)) {
      buckets.set(key, { key, byDay: Object.fromEntries(DAY_COLS.map(d => [d, 0])), total: 0 })
    }
    const bucket = buckets.get(key)
    DAY_COLS.forEach(d => { bucket.byDay[d] += r.byDay[d] ?? 0 })
    bucket.total += r.total
  })
  return FUNDING_LABELS
    .filter(([key]) => buckets.get(key)?.total > 0)
    .map(([key, label]) => ({ ...buckets.get(key), label }))
}
