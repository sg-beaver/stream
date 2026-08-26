import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import WeekCalendarButton from '../components/ui/WeekCalendarButton'
import TimeGrid from '../components/ui/TimeGrid'
import SubstituteDetailModal from '../components/ui/SubstituteDetailModal'
import { formatDate } from '../utils/format'
import { fetchMySchedule, fetchMySubstituteRequests } from '../api/client'

// 확정 근무표는 요일 반복이 아니라 날짜 단위로 내려온다 (REQ-SCHED-010).
// 그래서 화면도 "이번 주" 기준으로 한 주씩 넘겨 보는 형태로 만든다.
const DAYS = ['월', '화', '수', '목', '금', '토', '일']

const pad2 = n => String(n).padStart(2, '0')
const hhmm = t => String(t ?? '').slice(0, 5)
const toMin = t => {
  const [h, m] = hhmm(t).split(':').map(Number)
  return h * 60 + m
}
const minToHhmm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`

const SUB_GOLD = 'var(--warning)'

const toIso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const parseIso = iso => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 그 날짜가 속한 주의 월요일
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const shift = (d.getDay() + 6) % 7 // 월=0
  d.setDate(d.getDate() - shift)
  return d
}

const addDays = (date, n) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + n)
  return d
}

// "2026.08.10 ~ 08.16"
function weekLabel(monday) {
  const sunday = addDays(monday, 6)
  const head = `${monday.getFullYear()}.${pad2(monday.getMonth() + 1)}.${pad2(monday.getDate())}`
  const tail = `${pad2(sunday.getMonth() + 1)}.${pad2(sunday.getDate())}`
  return `${head} ~ ${tail}`
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  // 나와 관련된 승인 대타 (요청자든 대타자든) — 캘린더 표시 + 금색 칸 매칭용 (PR #71 시각화)
  const [approvedSubs, setApprovedSubs] = useState([])

  useEffect(() => {
    let alive = true
    fetchMySchedule()
      .then(data => { if (alive) setSchedules(data) })
      .catch(err => { if (alive) setLoadError(err.message) })
    // 승인된 대타 근무를 금색으로 구분하기 위한 조회 — 실패해도 시간표 자체는 그대로 보여준다
    fetchMySubstituteRequests()
      .then(rows => { if (alive) setApprovedSubs(rows.filter(r => r.status === '승인')) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // 승인된 대타로 내가 대신 맡게 된 근무 — schedule_id 기준으로 금색 칸 매칭
  const subBySchedule = useMemo(
    () => new Map(approvedSubs.filter(r => r.role === 'substitute').map(r => [r.schedule_id, r])),
    [approvedSubs],
  )

  // 금색 칸 클릭 → 대타 변경 상세 모달
  const [detail, setDetail] = useState(null)

  // 이번 주에 표시할 게 없으면, 근무나 대타 내역이 있는 가장 가까운 주로 한 번만 맞춰 준다.
  // (요청자는 근무가 대타에게 넘어가 rows가 비어도 대타 내역으로 스냅되어야 한다)
  const snapped = useRef(false)
  useEffect(() => {
    if (snapped.current || schedules === null) return
    // approvedSubs는 요청 시각 역순으로 내려오므로 합친 뒤 날짜순으로 정렬해야
    // "가장 가까운 다음 주" 탐색과 마지막 요소 폴백(가장 늦은 날짜)이 성립한다
    const dates = [...schedules.map(r => r.date), ...approvedSubs.map(r => r.date)]
      .map(d => d.slice(0, 10))
      .sort()
    if (dates.length === 0) return
    snapped.current = true
    const thisMonday = mondayOf(new Date())
    const hasThisWeek = dates.some(d => toIso(mondayOf(parseIso(d))) === toIso(thisMonday))
    if (!hasThisWeek) {
      const upcoming = dates.find(d => parseIso(d) >= thisMonday) ?? dates[dates.length - 1]
      setWeekStart(mondayOf(parseIso(upcoming)))
    }
  }, [schedules, approvedSubs])

  const rows = schedules ?? []

  // 이번 주(표시 중인 주)에 속한 근무를 날짜별로 묶는다
  const weekDays = useMemo(() => {
    return DAYS.map((label, i) => {
      const date = addDays(weekStart, i)
      const iso = toIso(date)
      const shifts = rows
        .filter(r => r.date.slice(0, 10) === iso)
        .sort((a, b) => toMin(a.start_time) - toMin(b.start_time))
      return { label, date, iso, shifts }
    })
  }, [rows, weekStart])

  const weekShifts = weekDays.flatMap(d => d.shifts)

  // 내가 요청해 대타에게 넘어간 근무 (승인) — 내 근무표 행에는 더 이상 없지만
  // 킷 명세대로 금색 "OOO(대타)" 칸으로 표시한다
  const weekIsoStart = toIso(weekStart)
  const weekIsoEnd = toIso(addDays(weekStart, 6))
  const lostSubs = useMemo(
    () => approvedSubs.filter(r => {
      const d = r.date.slice(0, 10)
      return r.role === 'requester' && d >= weekIsoStart && d <= weekIsoEnd
    }),
    [approvedSubs, weekIsoStart, weekIsoEnd],
  )

  // 주간 타임슬롯 그리드 (요일 × 30분) — uiux 킷 학생 근무 시간표와 같은 형태
  const weekGrid = useMemo(() => {
    const entries = weekShifts.map(s => ({
      day: DAYS[(parseIso(s.date).getDay() + 6) % 7],
      start: toMin(s.start_time), end: toMin(s.end_time),
      gold: subBySchedule.has(s.schedule_id),
      // 여러 부서에서 일하는 학생이 어느 근무인지 구분할 수 있게 부서명을 라벨로 쓴다
      label: subBySchedule.has(s.schedule_id) ? '대타 근무' : (s.department_name ?? '근무'),
      sub: subBySchedule.get(s.schedule_id) ?? null,
    })).concat(lostSubs.map(r => ({
      day: DAYS[(parseIso(r.date).getDay() + 6) % 7],
      start: toMin(r.start_time), end: toMin(r.end_time),
      gold: true,
      label: `${r.substitute_name ?? r.substitute_id}(대타)`,
      sub: r,
    })))
    if (entries.length === 0) return null

    const bounds = entries.flatMap(e => [e.start, e.end])
    const from = Math.floor(Math.min(...bounds) / 30) * 30
    const to = Math.ceil(Math.max(...bounds) / 30) * 30
    const gridRows = []
    for (let m = from; m < to; m += 30) gridRows.push(minToHhmm(m))

    const filledSlots = [], slotLabels = {}, slotColors = {}
    const subCells = new Map()
    entries.forEach(e => {
      for (let m = e.start; m < e.end; m += 30) {
        const key = `${e.day}-${minToHhmm(m)}`
        filledSlots.push(key)
        slotLabels[key] = e.label
        slotColors[key] = e.gold ? SUB_GOLD : 'var(--sogang-red)'
        if (e.sub) subCells.set(key, [...(subCells.get(key) ?? []), e.sub])
      }
    })
    return { rows: gridRows, filledSlots, slotLabels, slotColors, subCells }
  }, [weekShifts, lostSubs, subBySchedule])

  return (
    <Shell activeMenu="schedule">
      <PageTitle>근무 시간표</PageTitle>
      <p style={{ margin: '0 0 20px 2px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        담당자가 확정한 근무 일정입니다. 근무는 날짜 단위로 배정되며, 확정 전이거나 대체된 근무표는 표시되지 않습니다.
      </p>

      {loadError ? (
        <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>근무표를 불러오지 못했습니다</div>
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>{loadError}</div>
        </div>
      ) : !schedules ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-subtle)' }}>근무표를 불러오는 중...</div>
      ) : rows.length === 0 && approvedSubs.length === 0 ? (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '48px 32px', textAlign: 'center' }}>
          <span style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <CalendarDays size={26} color="var(--text-subtle)" />
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>확정된 근무표가 없습니다</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.6 }}>
            선발된 부서에서 근무표를 확정하면 이곳에 표시됩니다.<br />
            공통 지원서의 근무 가능 시간을 최신 상태로 유지해 주세요.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
          {/* 주 이동 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              style={navBtnStyle}
            >
              <ChevronLeft size={14} /> 이전 주
            </button>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{weekLabel(weekStart)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>근무 {weekShifts.length}건</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                style={navBtnStyle}
              >
                다음 주 <ChevronRight size={14} />
              </button>
              <WeekCalendarButton
                subDates={approvedSubs.map(s => s.date.slice(0, 10))}
                weekStart={toIso(weekStart)}
                onSelectWeek={iso => setWeekStart(parseIso(iso))}
              />
            </div>
          </div>

          {/* 주간 타임슬롯 그리드 (uiux 킷 학생 근무 시간표 형태 — 시간 × 월~일) */}
          <div style={{ padding: 18 }}>
            {weekGrid === null ? (
              <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>
                이 주에는 확정된 근무가 없습니다. 아래 캘린더에서 다른 주를 선택해 보세요.
              </div>
            ) : (
              <>
                <TimeGrid
                  rows={weekGrid.rows} classSlots={weekGrid.filledSlots}
                  slotLabels={weekGrid.slotLabels} slotColors={weekGrid.slotColors} legend={false}
                  clickableSlots={[...weekGrid.subCells.keys()]}
                  onSlotClick={key => setDetail(weekGrid.subCells.get(key) ?? null)}
                />
                <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 13, height: 13, background: 'var(--sogang-red)', borderRadius: 3 }} /> 근무
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 13, height: 13, background: SUB_GOLD, borderRadius: 3 }} /> 대타로 근무자 변경됨 (클릭하면 상세 확인)
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {schedules && rows.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-subtle)' }}>
          전체 확정 근무 {rows.length}건 · 기간 {formatDate(rows[0].date)} ~ {formatDate(rows[rows.length - 1].date)}
        </div>
      )}

      {detail && <SubstituteDetailModal subs={detail} onClose={() => setDetail(null)} />}
    </Shell>
  )
}

const navBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  height: 32, padding: '0 12px', background: 'var(--surface-card)',
  border: '1px solid var(--border-default)', borderRadius: 8,
  fontSize: 13, fontWeight: 600, color: 'var(--text-body)',
  cursor: 'pointer', fontFamily: 'var(--font-sans)',
}
