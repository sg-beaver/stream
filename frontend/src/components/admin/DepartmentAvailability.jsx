import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import Button from '../ui/Button'
import Select from '../ui/Select'
import TimeGrid from '../ui/TimeGrid'
import { mondayOfIso } from '../ui/MonthCalendar'
import WeekCalendarButton from '../ui/WeekCalendarButton'
import { AdminPanel, AdminStatCard } from './AdminPanel'
import {
  AVAILABLE_FILL, CLOSED_FILL, EmptyNote, ErrorNote, headCellStyle,
  weekArrowStyle, weekTabStyle,
} from './scheduleBits'
import {
  blocksByDayLabel, openRangeLookup, periodByDayOfWeek, periodOfDate,
  policyRows, uniformPeriodByDay,
} from '../../utils/workSlots'
import { termKeyForDate, termLabel, termStartDate } from '../../utils/terms'
import {
  DAY_COLS, HALF_HOUR_ROWS, addDaysIso, buildRoster, dateAvailabilityToSlotKeys,
  hoursBetween, isoToDate, isoToDots, toMin, todayIsoDate, weekDaySubLabels,
} from '../../utils/scheduleGrid'
import {
  fetchAvailabilityDates,
  fetchDepartmentAvailability,
  fetchDepartmentClassTime,
  fetchDepartmentClassTimeDates,
  fetchDepartmentPolicy,
  fetchDepartmentStudents,
  fetchTerms,
} from '../../api/client'

// 부서 가능 시간 수합 화면 — 근무표 편성과 수업 조교 편성이 같은 화면을 쓴다.
// 배정 단위가 시간대냐 과목이냐만 다를 뿐, "누가 언제 가능한가"를 읽는 방법은 같다.
//
// DepartmentAvailability는 스스로 데이터를 불러오는 껍데기이고,
// AvailabilitySection은 받은 데이터를 그리기만 한다 — 근무표 편성은 생성 기간에 맞춰
// 학기를 바깥에서 정하므로 두 층을 나눠 둔다.

function AvailabilitySection({
  departmentId, deptData, roster, error, onRetry, policy,
  expandedId, onExpand, departmentName,
  terms, rosterTerm, onChangeTerm, onOpenSettings,
}) {
  // 매주 반복 패턴(기본)과 특정 주의 실제 가능 시간을 번갈아 본다.
  // 부서가 '특정 주' 입력을 받지 않으면(weekly_only) 두 값이 같아 전환 자체를 두지 않는다.
  const weekViewAvailable = !!policy && policy.availability_mode !== 'weekly_only'
  const [view, setView] = useState('pattern') // 'pattern' | 'week'
  const [weekStart, setWeekStart] = useState(() => mondayOfIso(todayIsoDate()))
  const [weekRows, setWeekRows] = useState(null) // null = 로딩 중
  const [weekClassRows, setWeekClassRows] = useState(null) // 그 주의 날짜별 수업 시간
  const [weekError, setWeekError] = useState('')
  const weekEnd = addDaysIso(weekStart, 6)
  const weekMode = weekViewAvailable && view === 'week'

  // 주가 바뀔 때마다 그 주의 날짜별 가능 시간을 다시 가져온다 (그날 불가·추가 가능 반영).
  // 수업 시간도 같은 기간으로 날짜 조회한다 — 개강 주처럼 한 주가 학기 경계를 넘으면
  // 학기 하나짜리 주간 패턴으로는 그 주의 수업을 정확히 겹칠 수 없다.
  useEffect(() => {
    if (!departmentId || !weekMode) return
    let alive = true
    setWeekRows(null)
    setWeekClassRows(null)
    setWeekError('')
    fetchAvailabilityDates(departmentId, weekStart, weekEnd)
      .then(rows => { if (alive) setWeekRows(rows) })
      .catch(e => { if (alive) { setWeekRows([]); setWeekError(`이 주의 가능 시간을 불러오지 못했습니다. ${e.message}`) } })
    // 실패하면 null로 두어 주간 패턴 값으로 폴백한다 — 빈 배열은 '이 주엔 수업이 없다'는
    // 정상 응답이라 실패와 같게 다루면 안 된다
    fetchDepartmentClassTimeDates(departmentId, weekStart, weekEnd)
      .then(rows => { if (alive) setWeekClassRows(rows) })
      .catch(() => {})
    return () => { alive = false }
  }, [departmentId, weekMode, weekStart, weekEnd])

  // 주차 보기에서는 로스터의 가능 시간을 그 주 값으로 갈아끼운다.
  // 수합 여부(submitted)도 함께 바꾼다 — 주간 패턴은 '보고 있는 학기'(rosterTerm) 것이고
  // 주차 보기는 '그 주가 속한 학기'라 둘이 다른 학기일 수 있다. 그대로 두면 9월 주차에
  // 시간이 꽉 차 보이는데 옆의 배지·통계는 '미확보'라고 말하는 상태가 된다.
  // 수업 시간도 그 주 값으로 갈아끼운다. 연동 경로(source)만 주와 무관해 그대로 둔다.
  // 로딩 중(weekRows === null)에는 패턴 값을 유지한다 — 잠깐 전원 미확보로 깜빡이지 않게.
  const viewRoster = useMemo(() => {
    if (!weekMode || weekRows === null) return roster
    const groupById = rows => {
      const map = new Map()
      ;(rows ?? []).forEach(row => {
        if (!map.has(row.student_id)) map.set(row.student_id, [])
        map.get(row.student_id).push(row)
      })
      return map
    }
    const byStudent = groupById(weekRows)
    const classByStudent = groupById(weekClassRows)
    return roster.map(r => {
      const rows = byStudent.get(r.studentId) ?? []
      return {
        ...r,
        submitted: rows.length > 0,
        slotKeys: dateAvailabilityToSlotKeys(rows),
        // 아직 못 받았거나 실패했으면(null) 주간 패턴 값을 그대로 쓴다
        classSlotKeys: weekClassRows === null
          ? r.classSlotKeys
          : dateAvailabilityToSlotKeys(classByStudent.get(r.studentId) ?? []),
        hours: Math.round(rows.reduce((sum, x) => sum + hoursBetween(x.start_time, x.end_time), 0) * 10) / 10,
      }
    })
  }, [weekMode, weekRows, weekClassRows, roster])

  if (error) {
    return (
      <AdminPanel title="가능 시간 수합">
        <ErrorNote message={error} />
        <div style={{ marginTop: 12 }}><Button variant="secondary" size="sm" onClick={onRetry}>다시 시도</Button></div>
      </AdminPanel>
    )
  }
  if (deptData === null) {
    return <AdminPanel title="가능 시간 수합"><EmptyNote>수합 현황을 불러오는 중...</EmptyNote></AdminPanel>
  }

  // 통계도 화면에 그려지는 값과 같은 기준으로 센다 — 격자는 그 주 시간을 보여주는데
  // 카드만 패턴 학기를 세면 두 숫자가 어긋난다
  const submitted = viewRoster.filter(r => r.submitted)
  const missing = viewRoster.filter(r => !r.submitted)
  const fromApplication = viewRoster.filter(r => r.submitted && r.source === 'application')
  // 탭에서 아무도 고르지 않았으면 첫 학생을 보여준다 — 빈 화면 대신 바로 시간표가 보이게
  const selected = viewRoster.find(r => r.studentId === expandedId) ?? viewRoster[0] ?? null
  const gridRows = policyRows(policy)
  // 개관 시간·근무 슬롯은 학기와 방학이 다르다(월요일 기준 학기 08~22시, 방학 09~20시).
  // '특정 주'는 그 주 날짜로 요일마다 판정하고 — 개강 주(8/31 방학, 9/1 개강)는 한 주가
  // 두 기간에 걸친다 — '매주 반복 패턴'은 특정 날짜가 없어 보고 있는 학기의 기간 하나로
  // 통일한다. 학생 화면(AvailabilityPanel)과 같은 규칙이라 두 화면의 격자가 어긋나지 않는다.
  const periodByDay = weekMode
    ? periodByDayOfWeek(policy, isoToDate(weekStart))
    : uniformPeriodByDay(periodOfDate(policy, termStartDate(terms, rosterTerm) ?? new Date()))
  const dayBlocks = blocksByDayLabel(policy, periodByDay)
  const daySubLabels = weekMode ? weekDaySubLabels(weekStart) : undefined
  const weekLoading = weekMode && weekRows === null
  const thisMonday = mondayOfIso(todayIsoDate())

  // 요일별 가능 시간 합 (30분 슬롯 수 × 0.5) — 표 맨 아래 요약 행용
  const dayHourTotals = student => {
    const values = {}
    ;['월', '화', '수', '목', '금', '토', '일'].forEach(day => {
      const h = student.slotKeys.filter(k => k.startsWith(`${day}-`)).length * 0.5
      values[day] = Number.isInteger(h) ? String(h) : h.toFixed(1)
    })
    return values
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <AdminStatCard stat={{ label: '선발 학생', value: `${roster.filter(r => r.inHiredList).length}명`, sub: '합격 처리 기준', icon: 'Users', tone: 'neutral' }} />
        <AdminStatCard stat={{
          label: '가능시간 확보',
          value: weekLoading ? '...' : `${submitted.length}명`,
          sub: weekMode
            ? `${isoToDots(weekStart)} ~ ${isoToDots(weekEnd)} 기준`
            : `지원서 연동 ${fromApplication.length} · 직접 입력 ${submitted.length - fromApplication.length}`,
          icon: 'CircleCheck', tone: 'success',
        }} />
        <AdminStatCard stat={{
          label: '미확보',
          value: weekLoading ? '...' : `${missing.length}명`,
          sub: weekMode ? '이 주에 낸 시간이 없음' : '생성 전 확인 필요',
          icon: 'Clock', tone: 'warning',
        }} />
        <AdminStatCard stat={{
          label: '총 가능시간',
          value: weekLoading ? '...' : `${Math.round(viewRoster.reduce((n, r) => n + r.hours, 0) * 10) / 10}h`,
          sub: weekMode
            ? `${isoToDots(weekStart)} ~ ${isoToDots(weekEnd)} 실제 가능 시간`
            : `${termLabel(terms, rosterTerm) || '이번 학기'} 주간 패턴 합계`,
          icon: 'CalendarClock', tone: 'info',
        }} />
      </div>

      {/* 가로로 넓은 화면에서는 부서 전체 수합과 학생별 가능 시간을 나란히 둔다 —
          "이 시간대가 비었네 → 누가 낼 수 있지"를 스크롤 없이 잇기 위함.
          좁아지면 auto-fit이 한 열로 접는다 (이 코드베이스는 미디어 쿼리를 쓰지 않는다) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 18, alignItems: 'start' }}>
        <AdminPanel
          title="전체 수합 시간표"
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* 수합은 학기마다 다르다 — 기본값은 생성 기간이 속한 학기다.
                  주차 보기에서는 날짜가 학기를 정하므로 학기 선택을 두지 않는다 */}
              {!weekMode && terms?.length > 0 && (
                <Select
                  value={rosterTerm ?? ''}
                  onChange={e => onChangeTerm(e.target.value)}
                  size="sm"
                  style={{ width: 180 }}
                >
                  {terms.map(t => (
                    <option key={t.key} value={t.key}>{t.label}{t.current ? ' (진행 중)' : ''}</option>
                  ))}
                </Select>
              )}
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                {policy
                  ? `${departmentName ?? '부서'} 개관 ${policy.grid_start_time}~${policy.grid_end_time}`
                  + ` · ${policy.min_per_slot}~${policy.max_per_slot}명`
                  + (policy.opening_hours_source === 'department' || policy.staffing_source === 'department' ? ' · 직접 설정' : ' · 기본 정책')
                  : '개관 시간 불러오는 중...'}
              </span>
              {onOpenSettings && (
                <Button variant="secondary" size="sm" onClick={onOpenSettings}>
                  <Settings2 size={13} /> 부서 설정
                </Button>
              )}
            </div>
          }
        >
          {weekViewAvailable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setView('pattern')} style={weekTabStyle(!weekMode)}>매주 반복 패턴</button>
              <button type="button" onClick={() => setView('week')} style={weekTabStyle(weekMode)}>특정 주</button>
              {weekMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                  <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, -7))} style={weekArrowStyle}><ChevronLeft size={16} color="var(--text-muted)" /></button>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-body)', whiteSpace: 'nowrap' }}>
                    {isoToDots(weekStart)} ~ {isoToDots(weekEnd)}
                  </span>
                  <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, 7))} style={weekArrowStyle}><ChevronRight size={16} color="var(--text-muted)" /></button>
                  {weekStart !== thisMonday && (
                    <Button variant="secondary" size="sm" onClick={() => setWeekStart(thisMonday)}>이번 주로</Button>
                  )}
                  <WeekCalendarButton weekStart={weekStart} onSelectWeek={setWeekStart} />
                </div>
              )}
            </div>
          )}

          <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            부서 개관 시간대 전체를 세로축으로 두고, 칸마다 그 시간에
            <b style={{ color: 'var(--text-body)' }}> 근무 가능하다고 제출한 학생</b>을 모아 보여줍니다.
            {weekMode
              ? ' 선택한 주에 등록된 예외(그날 불가·추가 가능)가 반영된 그 주의 실제 가능 시간입니다.'
              : ' 학생이 낸 매주 반복 패턴 기준입니다.'}
            {' '}비어 있는 칸은 가능자가 없는 시간대입니다 — 생성 시 미충원이 날 가능성이 높습니다.
          </p>
          {weekError && <div style={{ marginBottom: 14 }}><ErrorNote message={weekError} /></div>}
          {weekLoading ? (
            <EmptyNote>이 주의 가능 시간을 불러오는 중...</EmptyNote>
          ) : (
            <AvailabilityGrid
              roster={viewRoster} rows={gridRows} policy={policy}
              periodByDay={periodByDay} daySubLabels={daySubLabels}
            />
          )}
        </AdminPanel>

        <AdminPanel
          title="가능 시간 확인"
          right={<span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>선발 {roster.filter(r => r.inHiredList).length}명 중 <b style={{ color: 'var(--success)' }}>{submitted.length}</b>명 확보</span>}
        >
          {roster.length === 0 ? (
            <EmptyNote>합격 처리된 학생이 없습니다. 학생 선발을 먼저 진행해 주세요.</EmptyNote>
          ) : (
            <>
              {/* 학생이 많으면 줄바꿈으로 쌓여 이름 탭만 패널 절반을 먹었다 —
                  한 줄로 두고 가로로 넘긴다 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                {viewRoster.map(r => {
                  const on = selected?.studentId === r.studentId
                  return (
                    <button
                      key={r.studentId} type="button" onClick={() => onExpand(r.studentId)}
                      title={r.submitted ? (r.source === 'application' ? '지원서 연동' : '직접 입력') : '가능 시간 미확보'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        flexShrink: 0, whiteSpace: 'nowrap',
                        height: 34, padding: '0 14px', background: on ? 'var(--sogang-red-50)' : 'var(--surface-card)',
                        border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
                        borderRadius: 8, fontSize: 'var(--fs-body)', fontWeight: on ? 700 : 500,
                        color: on ? 'var(--sogang-red)' : 'var(--text-muted)',
                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {/* 상태 점: 초록 = 가능 시간 확보, 주황 = 미확보 */}
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: r.submitted ? 'var(--success)' : 'var(--warning)',
                      }} />
                      {r.name}
                    </button>
                  )
                })}
              </div>

              {selected && (weekLoading ? (
                <EmptyNote>이 주의 가능 시간을 불러오는 중...</EmptyNote>
              ) : selected.slotKeys.length === 0 ? (
                <EmptyNote>
                  {weekMode
                    ? '이 주에는 가능 시간이 없습니다. 그날 불가 예외가 등록된 주일 수 있습니다.'
                    : '수합된 가능 시간이 없습니다. 지원서 연동 또는 학생의 직접 입력이 필요합니다.'}
                </EmptyNote>
              ) : (
                <TimeGrid
                  rows={gridRows ?? HALF_HOUR_ROWS} rowHeight={17}
                  classSlots={selected.classSlotKeys} classLabel="수업"
                  availableSlots={selected.slotKeys}
                  availableLegendText={`근무 가능 시간: 총 ${selected.hours}시간`}
                  classLegendText="수업 시간 (학생 직접 입력, SAINT 연동 전)"
                  footer={{ label: '가능 시간', values: dayHourTotals(selected) }}
                  dayBlocks={dayBlocks ?? undefined}
                  daySubLabels={daySubLabels}
                />
              ))}
            </>
          )}
        </AdminPanel>
      </div>
    </div>
  )
}

// 부서 전체 수합 — 칸마다 그 시간에 가능하다고 제출한 학생 이름을 모아 보여준다.
// TimeGrid는 칸당 한 줄만 그리도록 되어 있어, 이름이 여러 개 들어가는 이 표는 따로 그린다.
// 인원수에 비례한 농도(히트맵)는 쓰지 않는다 (#154) — 이름이 이미 인원을 말해 주는데
// 배경까지 단계별로 진해지면 이름이 묻히고 표가 지저분해진다. 가능자 유무만 단색으로 구분한다.
// 칸 하나의 내용 — 그 시간에 가능한 학생 이름을 모두 늘어놓는다.
// 한때 4명 이상이면 'n명 가능'으로 접었지만(#110), 담당자는 표를 훑으며 이름을 바로
// 보고 싶어 한다. 이름 사이를 띄어 쓰고 줄바꿈되게 두면 칸이 세로로 늘어나도 읽힌다.
function NameCell({ names }) {
  if (names.length === 0) return null
  return (
    <span style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.35, color: 'var(--text-strong)', wordBreak: 'keep-all' }}>
      {names.join(' ')}
    </span>
  )
}

function AvailabilityGrid({ roster, rows, policy, periodByDay, daySubLabels }) {
  // 부서 정책을 못 불러오면 기본 시간 범위(08:00~22:00, 30분 단위)를 쓴다
  const timeRows = rows ?? HALF_HOUR_ROWS
  const isOpen = openRangeLookup(policy, periodByDay)
  const dayBlocks = blocksByDayLabel(policy, periodByDay)

  // "요일-HH:MM" → 그 칸에 가능한 학생 이름 목록
  const bySlot = useMemo(() => {
    const map = new Map()
    roster.forEach(r => r.slotKeys.forEach(key => {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r.name)
    }))
    return map
  }, [roster])

  // 블록 병합: 요일별 "행 시각 → { span, times } | 'covered'".
  // 블록 칸에는 배정 후보(블록 전체 가능자)를 보여준다 — all-or-none 배정이라
  // 일부만 가능한 학생은 그 블록에 배정될 수 없다.
  const blockAt = useMemo(() => {
    if (!dayBlocks) return null
    const result = {}
    DAY_COLS.forEach(day => {
      const map = new Map()
      ;(dayBlocks[day] ?? []).forEach(b => {
        const covered = timeRows.filter(t => toMin(t) >= b.start && toMin(t) < b.end)
        if (covered.length === 0) return
        map.set(covered[0], { span: covered.length, times: covered })
        covered.slice(1).forEach(t => map.set(t, 'covered'))
      })
      result[day] = map
    })
    return result
    // eslint 없음 — dayBlocks는 policy에서 파생
  }, [dayBlocks, timeRows])

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ ...headCellStyle, width: 64 }}>시간</th>
            {DAY_COLS.map(d => (
              <th key={d} style={{ ...headCellStyle, padding: daySubLabels ? '5px 0' : headCellStyle.padding }}>
                <div>{d}</div>
                {daySubLabels?.[d] && (
                  <div style={{ fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-medium)', color: 'var(--text-muted)', marginTop: 1 }}>
                    {daySubLabels[d]}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeRows.map(time => (
            <tr key={time}>
              {/* 시간 열은 학생 개인 시간표(TimeGrid)와 같은 모양 — 30분 행은 흐리게 둬
                  한 시간 단위가 먼저 읽히게 한다 */}
              <td style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan-soft)', textAlign: 'center' }}>
                <span style={{
                  fontSize: time.endsWith(':00') ? 'var(--fs-caption)' : 'var(--fs-micro)',
                  fontWeight: time.endsWith(':00') ? 600 : 400,
                  color: time.endsWith(':00') ? 'var(--text-muted)' : 'var(--text-subtle)',
                }}>{time}</span>
              </td>
              {DAY_COLS.map(day => {
                // 블록 병합 칸 — 배정 단위가 블록 전체라, 블록 전 구간이 가능한 학생만 센다.
                // 블록 일부만 가능한 학생은 어차피 배정될 수 없어 표에 남기지 않는다 (#110).
                const blockInfo = blockAt ? blockAt[day]?.get(time) : undefined
                if (blockInfo === 'covered') return null
                if (blockInfo) {
                  const perSlot = blockInfo.times.map(t => bySlot.get(`${day}-${t}`) ?? [])
                  const full = perSlot[0].filter(n => perSlot.every(list => list.includes(n)))
                  return (
                    <td
                      key={day} rowSpan={blockInfo.span}
                      title={`${blockInfo.times[0]}~ 블록 · 가능 ${full.length}명${full.length > 0 ? ` (${full.join(', ')})` : ''}`}
                      style={{
                        border: '1px solid var(--saint-grid)',
                        verticalAlign: 'top', padding: '3px 5px',
                        background: full.length > 0 ? AVAILABLE_FILL : 'var(--neutral-0)',
                      }}
                    >
                      <NameCell names={full} />
                    </td>
                  )
                }

                const names = bySlot.get(`${day}-${time}`) ?? []
                const open = isOpen(day, toMin(time))
                return (
                  <td
                    key={day}
                    title={names.length > 0 ? `${time} · ${names.join(', ')}` : undefined}
                    style={{
                      border: '1px solid var(--saint-grid)',
                      verticalAlign: 'top', padding: '2px 5px', height: 20,
                      background: !open ? CLOSED_FILL
                        : names.length > 0 ? AVAILABLE_FILL : 'var(--neutral-0)',
                    }}
                  >
                    {!open ? (
                      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-subtle)' }}>근무 없음</span>
                    ) : (
                      <NameCell names={names} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: AVAILABLE_FILL, border: '1px solid var(--saint-grid)' }} />
          가능자 있음
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid var(--saint-grid)', background: 'var(--neutral-0)' }} />
          가능자 없음
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid var(--saint-grid)', background: CLOSED_FILL }} />
          근무 없음
        </span>
        {dayBlocks && (
          <span style={{ color: 'var(--text-subtle)' }}>
            근무 슬롯(블록) 단위 — 배정이 블록 전체 단위라 블록 전 구간이 가능한 학생만 셉니다
          </span>
        )}
      </div>
    </div>
  )
}


// 부서 로스터·가능 시간·수업 시간을 직접 불러와 AvailabilitySection에 넘긴다.
// 학기는 안에서 관리하되(부서 기본 학기 → 오늘 기준), 바깥에서 term/onChangeTerm을
// 주면 그 선택을 따른다 — 근무표 편성은 생성 기간이 학기를 정하기 때문이다.
export default function DepartmentAvailability({
  departmentId, departmentName, onOpenSettings = null,
  term = undefined, onChangeTerm = undefined,
}) {
  const controlled = term !== undefined
  const [terms, setTerms] = useState([])
  const [ownTerm, setOwnTerm] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [policyLoaded, setPolicyLoaded] = useState(false)
  const [deptData, setDeptData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const activeTerm = controlled ? term : ownTerm
  const changeTerm = controlled ? onChangeTerm : setOwnTerm

  useEffect(() => {
    let alive = true
    fetchTerms()
      .then(res => { if (alive) setTerms(res.terms ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // 그리드 세로축(개관 시간)과 기본 학기를 정하는 값이라 로스터와 따로 한 번만 받는다 —
  // 로스터 조회에 묶어 두면 학기가 정해지기 전에 조회가 먼저 나간다
  useEffect(() => {
    if (!departmentId) return
    let alive = true
    fetchDepartmentPolicy(departmentId)
      .then(p => { if (alive) setPolicy(p) })
      .catch(() => { if (alive) setPolicy(null) })
      .finally(() => { if (alive) setPolicyLoaded(true) })
    return () => { alive = false }
  }, [departmentId])

  // 스스로 학기를 고르는 경우의 기본값: 부서 기본 학기(#172) > 오늘 기준 학기.
  // 학기 중에만 운영하는 부서(학과 사무실)는 방학에 오늘 기준으로 열면 화면이 통째로
  // 비어, 다음 학기 조교를 붙일 수 없다. 정책을 받기 전에는 정하지 않는다 —
  // 학기 목록이 먼저 도착한다고 오늘 기준 학기가 부서 기본 학기를 선점하면 안 된다.
  useEffect(() => {
    if (controlled || ownTerm || !policyLoaded) return
    if (policy?.default_term) { setOwnTerm(policy.default_term); return }
    if (terms.length > 0) setOwnTerm(termKeyForDate(terms, new Date(), null))
  }, [controlled, ownTerm, policyLoaded, policy, terms])

  const load = useCallback(async () => {
    if (!departmentId) {
      setLoadError('로그인 정보에 소속 부서가 없습니다. 직원 계정으로 다시 로그인해 주세요.')
      return
    }
    // 학기를 스스로 정하는 경우, 부서 기본 학기가 정해지기 전에 조회하지 않는다
    if (!controlled && !policyLoaded) return
    setDeptData(null)
    setLoadError('')
    try {
      const deptStudents = await fetchDepartmentStudents(departmentId).catch(() => [])
      const availability = await fetchDepartmentAvailability(departmentId, activeTerm ?? undefined)
      const classTime = await fetchDepartmentClassTime(departmentId, activeTerm ?? undefined).catch(() => [])
      setDeptData(buildRoster(deptStudents, availability, classTime))
    } catch (e) {
      setLoadError(e.message)
      setDeptData({ roster: [] })
    }
  }, [departmentId, activeTerm, controlled, policyLoaded])

  useEffect(() => { load() }, [load])

  return (
    <AvailabilitySection
      departmentId={departmentId}
      deptData={deptData}
      roster={deptData?.roster ?? []}
      error={loadError}
      onRetry={load}
      policy={policy}
      expandedId={expandedId}
      onExpand={setExpandedId}
      departmentName={departmentName}
      terms={terms}
      rosterTerm={activeTerm}
      onChangeTerm={changeTerm}
      onOpenSettings={onOpenSettings}
    />
  )
}

export { AvailabilitySection }
