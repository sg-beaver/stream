import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, CalendarCheck, CalendarClock } from 'lucide-react'
import Shell from '../components/layout/Shell'
import PageTitle from '../components/ui/PageTitle'
import StatCard from '../components/ui/StatCard'
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
const hoursOf = row => (toMin(row.end_time) - toMin(row.start_time)) / 60

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
  // 승인된 대타로 내가 대신 맡게 된 근무 — schedule_id 기준 (PR #71 시각화)
  const [subBySchedule, setSubBySchedule] = useState(() => new Map())

  useEffect(() => {
    let alive = true
    fetchMySchedule()
      .then(data => {
        if (!alive) return
        setSchedules(data)
        // 이번 주에 근무가 없으면, 배정이 있는 가장 가까운 주로 맞춰 보여준다
        if (data.length > 0) {
          const thisMonday = mondayOf(new Date())
          const hasThisWeek = data.some(r => {
            const m = mondayOf(parseIso(r.date))
            return toIso(m) === toIso(thisMonday)
          })
          if (!hasThisWeek) {
            const upcoming = data.find(r => parseIso(r.date) >= thisMonday) ?? data[data.length - 1]
            setWeekStart(mondayOf(parseIso(upcoming.date)))
          }
        }
      })
      .catch(err => { if (alive) setLoadError(err.message) })
    // 승인된 대타 근무를 금색으로 구분하기 위한 조회 — 실패해도 시간표 자체는 그대로 보여준다
    fetchMySubstituteRequests()
      .then(rows => {
        if (!alive) return
        const map = new Map()
        for (const r of rows) {
          if (r.status === '승인' && r.role === 'substitute') map.set(r.schedule_id, r)
        }
        setSubBySchedule(map)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

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

  const nextShift = useMemo(() => {
    const now = new Date()
    const todayIso = toIso(now)
    const nowMin = now.getHours() * 60 + now.getMinutes()
    return rows
      .slice()
      .sort((a, b) => (a.date === b.date ? toMin(a.start_time) - toMin(b.start_time) : a.date.localeCompare(b.date)))
      .find(r => r.date > todayIso || (r.date === todayIso && toMin(r.end_time) > nowMin)) ?? null
  }, [rows])

  const stats = useMemo(() => {
    const weekHours = weekShifts.reduce((sum, r) => sum + hoursOf(r), 0)
    const workingDays = weekDays.filter(d => d.shifts.length > 0).length
    return [
      { key: 'hours', label: '이번 주 근무시간', sub: '표시 중인 주 합계', icon: 'Clock', tone: 'info',
        value: schedules ? `${weekHours % 1 === 0 ? weekHours : weekHours.toFixed(1)}h` : '–' },
      { key: 'days', label: '근무 일수', sub: '표시 중인 주', icon: 'CalendarDays', tone: 'neutral',
        value: schedules ? `${workingDays}일` : '–' },
      { key: 'shifts', label: '근무 건수', sub: '표시 중인 주', icon: 'CalendarCheck', tone: 'success',
        value: schedules ? `${weekShifts.length}건` : '–' },
      { key: 'next', label: '다음 근무', sub: nextShift ? `${nextShift.day_of_week}요일 ${hhmm(nextShift.start_time)}` : '예정 없음',
        icon: 'CalendarClock', tone: 'warning',
        value: schedules ? (nextShift ? formatDate(nextShift.date).slice(5, 10) : '—') : '–' },
    ]
  }, [schedules, weekDays, weekShifts, nextShift])

  const todayIso = toIso(new Date())

  return (
    <Shell activeMenu="schedule">
      <PageTitle>근무 시간표</PageTitle>
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        담당자가 확정한 근무 일정입니다. 근무는 날짜 단위로 배정되며, 확정 전이거나 대체된 근무표는 표시되지 않습니다.
      </p>

      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {stats.map(s => <StatCard key={s.key} stat={s} />)}
      </div>

      {loadError ? (
        <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>근무표를 불러오지 못했습니다</div>
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>{loadError}</div>
        </div>
      ) : !schedules ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-subtle)' }}>근무표를 불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '48px 32px', textAlign: 'center' }}>
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
        <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
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
            <button
              type="button"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              style={navBtnStyle}
            >
              다음 주 <ChevronRight size={14} />
            </button>
          </div>

          {/* 주간 컬럼 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {weekDays.map((d, i) => {
              const isToday = d.iso === todayIso
              return (
                <div key={d.iso} style={{ borderRight: i < 6 ? '1px solid var(--border-subtle)' : 'none', minHeight: 190, display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)',
                    background: isToday ? 'var(--sogang-red-50)' : 'var(--neutral-25)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? 'var(--sogang-red)' : 'var(--text-strong)' }}>
                      {d.label}{isToday && ' · 오늘'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {pad2(d.date.getMonth() + 1)}.{pad2(d.date.getDate())}
                    </div>
                  </div>
                  <div style={{ padding: 10, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {d.shifts.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>—</span>
                    ) : d.shifts.map(s => {
                      // 승인된 대타로 내가 대신 맡은 근무는 금색으로 구분한다 (PR #71 시각화)
                      const sub = subBySchedule.get(s.schedule_id)
                      return (
                        <div key={s.schedule_id} style={{
                          border: sub ? '1px solid #E3C88A' : '1px solid var(--sogang-red-100)',
                          background: sub ? '#FDF8EC' : 'var(--sogang-red-50)',
                          borderRadius: 'var(--radius-sm)', padding: '9px 10px',
                          display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: sub ? '#B8860B' : 'var(--sogang-red)', fontVariantNumeric: 'tabular-nums' }}>
                            {hhmm(s.start_time)}–{hhmm(s.end_time)}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hoursOf(s)}시간</span>
                          {s.department_name && (
                            <span style={{ fontSize: 11, color: 'var(--text-body)', lineHeight: 1.35 }}>{s.department_name}</span>
                          )}
                          {sub && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#B8860B', lineHeight: 1.35 }}>
                              대타 근무 · {sub.requester_name ?? sub.requester_id}님 대신
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {schedules && rows.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-subtle)', flexWrap: 'wrap' }}>
          <span>전체 확정 근무 {rows.length}건 · 기간 {formatDate(rows[0].date)} ~ {formatDate(rows[rows.length - 1].date)}</span>
          {subBySchedule.size > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: '#FDF8EC', border: '1px solid #E3C88A', borderRadius: 3, display: 'inline-block' }} />
              대타로 내가 맡은 근무
            </span>
          )}
        </div>
      )}
    </Shell>
  )
}

const navBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  height: 32, padding: '0 12px', background: '#fff',
  border: '1px solid var(--border-default)', borderRadius: 8,
  fontSize: 13, fontWeight: 600, color: 'var(--text-body)',
  cursor: 'pointer', fontFamily: 'var(--font-sans)',
}
