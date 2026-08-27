import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarX2, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import TimeGrid from '../ui/TimeGrid'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import Select from '../ui/Select'
import EmptyState from '../ui/EmptyState'
import WeekCalendarButton from '../ui/WeekCalendarButton'
import {
  createAvailabilityException,
  deleteAvailabilityException,
  fetchMyAvailability,
  fetchMyAvailabilityExceptions,
  fetchMyClassTime,
  fetchMyDepartmentDays,
  fetchMyDepartmentPolicy,
  fetchTerms,
  replaceMyAvailability,
  replaceMyClassTime,
} from '../../api/client'
import { withJosa } from '../../utils/format'
import { termKeyForDate, termLabel } from '../../utils/terms'
import {
  blocksByDayLabel, closedSlotKeys, gridFromDays, hoursByDayLabel, minToHhmm,
  periodByDayOfWeek, periodOfDate, policyRows, toMin, uniformPeriodByDay,
} from '../../utils/workSlots'
import { DAYS, addDays, dateOfDayLabel, dayDateLabels, mondayOf, parseIso, toIso, weekLabel } from '../../utils/week'

// 학생이 소속 부서의 근무 슬롯(블록) 단위로 가능 시간을 내는 화면 (#89).
//
// 지원 단계(공통 지원서)에서는 부서가 정해지지 않아 30분 자유 그리드로 냈지만,
// 합격해 부서가 배정되면 그 부서가 정의한 블록 단위로 다시 낸다. 블록은 통째로
// 배정되거나 통째로 비므로(HC-BLOCK-1), 체크도 블록 단위로만 할 수 있다.
//
// 편집 범위는 두 가지다.
// - weekly: 매주 반복되는 기본 시간표 (AvailableTime) — 저장 버튼으로 한 번에 교체
// - week  : 표시 중인 주에만 적용되는 예외 (AvailabilityException) — 클릭 즉시 반영
//   부서 정책(availability_mode)이 허용할 때만 열린다.

const SCOPES = [
  { id: 'weekly', label: '매주 반복' },
  { id: 'week', label: '이 주만' },
]

// 무엇을 편집하는지 — 근무 가능 시간(블록 단위)과 수업 시간(30분 단위)은 성격이 달라
// 같은 격자를 모드로 나눠 쓴다. 공통 지원서의 수업/가능 시간 탭과 같은 방식이다.
const EDIT_MODES = [
  { id: 'availability', label: '근무 가능 시간' },
  { id: 'class', label: '수업 시간' },
]

const MODE_HINT = {
  weekly_only: '이 부서는 매주 반복되는 기본 시간표만 받습니다.',
  weekly_with_unavailable: '이 부서는 특정 주에 "근무 불가"만 신고할 수 있습니다. 가능 시간을 늘리려면 기본 시간표를 수정해 주세요.',
  weekly_with_exceptions: '특정 주만 가능 시간을 빼거나 더할 수 있습니다.',
}

// 예외 한 건이 [startMin, endMin) 구간과 겹치는지 (종일 예외는 항상 겹침)
const overlaps = (exc, startMin, endMin) => {
  if (!exc.start_time || !exc.end_time) return true
  return toMin(exc.start_time) < endMin && toMin(exc.end_time) > startMin
}

// 주간 패턴 + 그 주의 예외 → 실제로 그 주에 적용되는 슬롯 키 목록.
// 적용 순서는 서버(materialize_availability)와 같다: 종일 불가 → 부분 불가 → 추가 가능.
function slotsForWeek({ baseSlots, exceptions, weekStart, rows, mode }) {
  const base = new Set(baseSlots)
  const result = []

  DAYS.forEach((day, index) => {
    const iso = toIso(addDays(weekStart, index))
    const dayExceptions = exceptions.filter(e => e.exception_date.slice(0, 10) === iso)
    let times = new Set(rows.filter(t => base.has(`${day}-${t}`)))

    dayExceptions
      .filter(e => e.exception_type === 'UNAVAILABLE')
      .forEach(e => {
        if (!e.start_time || !e.end_time) { times = new Set(); return }
        const [start, end] = [toMin(e.start_time), toMin(e.end_time)]
        rows.forEach(t => { if (toMin(t) >= start && toMin(t) + 30 <= end) times.delete(t) })
      })

    if (mode === 'weekly_with_exceptions') {
      dayExceptions
        .filter(e => e.exception_type === 'AVAILABLE')
        .forEach(e => {
          const [start, end] = [toMin(e.start_time), toMin(e.end_time)]
          rows.forEach(t => { if (toMin(t) >= start && toMin(t) + 30 <= end) times.add(t) })
        })
    }

    times.forEach(t => result.push(`${day}-${t}`))
  })

  return result
}

export default function AvailabilityPanel() {
  const [loading, setLoading] = useState(true)
  const [policy, setPolicy] = useState(null) // null = 배정된 부서 없음
  const [baseSlots, setBaseSlots] = useState([])
  const [draftSlots, setDraftSlots] = useState([])
  // 수업 시간표는 학기마다 다르다 — 학기 키별로 따로 들고, 필요한 학기만 불러온다
  const [terms, setTerms] = useState([])
  const [classByTerm, setClassByTerm] = useState({})
  const [selectedTerm, setSelectedTerm] = useState(null)
  const [classDraft, setClassDraft] = useState([])
  const [editMode, setEditMode] = useState('availability')
  const [exceptions, setExceptions] = useState([])
  const [scope, setScope] = useState('weekly')
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  // '이 주만' 화면은 그 주의 날짜별 실제 개관 시간을 쓴다 (공휴일 단축·시험 연장·폐관)
  const [weekDaysInfo, setWeekDaysInfo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([
      // 404 = 아직 합격 전(정상 상태) — 화면은 안내로 대신한다
      fetchMyDepartmentPolicy().catch(() => null),
      fetchMyAvailability().catch(() => ({ slots: [] })),
      fetchTerms().catch(() => ({ terms: [], default_term: null })),
      fetchMyClassTime().catch(() => ({ slots: [], term: null })),
      fetchMyAvailabilityExceptions().catch(() => []),
    ])
      .then(([policyOut, availability, termList, classTime, exceptionRows]) => {
        if (!alive) return
        setPolicy(policyOut)
        setBaseSlots(availability.slots ?? [])
        setDraftSlots(availability.slots ?? [])
        setTerms(termList.terms ?? [])
        // 서버가 고른 학기(방학이면 다가오는 학기)를 그대로 기본값으로 쓴다
        const term = classTime.term ?? termList.default_term ?? null
        setSelectedTerm(term)
        setClassByTerm(term ? { [term]: classTime.slots ?? [] } : {})
        setClassDraft(classTime.slots ?? [])
        setExceptions(exceptionRows ?? [])
      })
      .catch(err => { if (alive) setError(err.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (scope !== 'week') return undefined
    let alive = true
    setWeekDaysInfo(null)
    fetchMyDepartmentDays(toIso(weekStart), toIso(addDays(weekStart, 6)))
      .then(days => { if (alive) setWeekDaysInfo(days) })
      .catch(() => { if (alive) setWeekDaysInfo(null) })
    return () => { alive = false }
  }, [scope, weekStart])

  // 지금 화면이 다루는 학기: 수업 편집 중이면 고른 학기, '이 주만'이면 그 주가 속한
  // 학기, '매주 반복'이면 오늘 기준 학기. 학기가 다르면 수업 시간표도 다르다
  const contextTerm = useMemo(() => {
    if (editMode === 'class') return selectedTerm
    const basis = scope === 'week' ? weekStart : new Date()
    return termKeyForDate(terms, basis, selectedTerm)
  }, [editMode, selectedTerm, scope, weekStart, terms])

  // 필요한 학기의 시간표를 그때그때 받아 둔다 (학기를 넘기며 봐도 한 번씩만 조회)
  useEffect(() => {
    if (!contextTerm || classByTerm[contextTerm] !== undefined) return undefined
    let alive = true
    fetchMyClassTime(contextTerm)
      .then(res => { if (alive) setClassByTerm(prev => ({ ...prev, [contextTerm]: res.slots ?? [] })) })
      .catch(() => { if (alive) setClassByTerm(prev => ({ ...prev, [contextTerm]: [] })) })
    return () => { alive = false }
  }, [contextTerm, classByTerm])

  const classSlots = classByTerm[contextTerm] ?? []

  // 학기를 바꾸면 그 학기 시간표로 편집 대상을 갈아 끼운다
  useEffect(() => {
    if (editMode !== 'class' || !selectedTerm) return
    setClassDraft(classByTerm[selectedTerm] ?? [])
  }, [editMode, selectedTerm, classByTerm])

  const rows = useMemo(() => policyRows(policy) ?? [], [policy])
  // 개관 시간·블록은 학기와 방학이 다르다. '이 주만'은 그 주 날짜로 요일마다 판정하고
  // (개강 주는 한 주가 두 기간에 걸친다), '매주 반복'은 특정 날짜가 없어 오늘이 속한
  // 기간 하나로 통일한다 — 요일마다 모양이 갈리면 반복 패턴으로 읽히지 않는다
  const weeklyPeriod = useMemo(() => periodOfDate(policy, new Date()), [policy])
  const periodByDay = useMemo(
    () => (scope === 'week'
      ? periodByDayOfWeek(policy, weekStart)
      : uniformPeriodByDay(weeklyPeriod)),
    [policy, scope, weekStart, weeklyPeriod],
  )
  // 특정 주를 보고 있으면 날짜별 응답이 우선한다 — 그 주에 실제로 근무가 있는 시간만
  // 고를 수 있어야 "냈는데 배정 안 되는" 시간이 생기지 않는다
  const dayGrid = useMemo(
    () => (scope === 'week' ? gridFromDays(weekDaysInfo, rows) : null),
    [scope, weekDaysInfo, rows],
  )
  const dayBlocks = dayGrid ? dayGrid.dayBlocks : blocksByDayLabel(policy, periodByDay)
  const disabledSlots = dayGrid
    ? dayGrid.disabledSlots
    : closedSlotKeys(policy, rows, periodByDay)
  const mode = policy?.availability_mode ?? 'weekly_only'
  const weekEditable = mode !== 'weekly_only'

  const weekSlots = useMemo(
    () => (rows.length === 0 ? [] : slotsForWeek({ baseSlots, exceptions, weekStart, rows, mode })),
    [baseSlots, exceptions, weekStart, rows, mode],
  )
  const editingClass = editMode === 'class'
  const shownSlots = scope === 'weekly' ? draftSlots : weekSlots
  const dirty =
    scope === 'weekly' &&
    (draftSlots.length !== baseSlots.length || draftSlots.some(k => !baseSlots.includes(k)))
  const savedClass = classByTerm[selectedTerm] ?? []
  const classDirty =
    classDraft.length !== savedClass.length || classDraft.some(k => !savedClass.includes(k))

  // 매주 반복 편집 — 로컬 상태만 바꾸고 저장 버튼으로 한 번에 교체한다
  const toggleWeekly = useCallback((keys, next) => {
    setDraftSlots(prev => (next ? [...new Set([...prev, ...keys])] : prev.filter(k => !keys.includes(k))))
  }, [])

  // 수업으로 표시한 칸은 그 시간에 일할 수 없으니 가능 시간에서도 빼 둔다
  // (공통 지원서 화면과 같은 규칙)
  const toggleClass = key => {
    setClassDraft(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      setDraftSlots(slots => slots.filter(k => k !== key))
      return [...prev, key]
    })
  }

  const saveClass = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await replaceMyClassTime(classDraft, selectedTerm)
      const slots = saved.slots ?? classDraft
      const savedTerm = saved.term ?? selectedTerm
      setClassByTerm(prev => ({ ...prev, [savedTerm]: slots }))
      setClassDraft(slots)
      // 수업 표시로 빠진 가능 시간이 있으면 함께 저장해 둘이 어긋나지 않게 한다
      if (draftSlots.length !== baseSlots.length || draftSlots.some(k => !baseSlots.includes(k))) {
        const savedAvailability = await replaceMyAvailability(draftSlots)
        setBaseSlots(savedAvailability.slots ?? draftSlots)
        setDraftSlots(savedAvailability.slots ?? draftSlots)
      }
      setNotice(`${termLabel(terms, selectedTerm)} 수업 시간을 저장했습니다. 수업이 걸친 블록은 그 학기 동안 선택할 수 없습니다.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const saveWeekly = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await replaceMyAvailability(draftSlots)
      setBaseSlots(saved.slots ?? draftSlots)
      setDraftSlots(saved.slots ?? draftSlots)
      setNotice('기본 시간표를 저장했습니다.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // 이 주만 편집 — 예외를 등록/삭제해 즉시 반영한다
  const toggleWeek = async (keys, next) => {
    if (!weekEditable) return
    const day = keys[0].split('-')[0]
    const times = keys.map(k => k.slice(day.length + 1)).sort()
    const startMin = toMin(times[0])
    const endMin = toMin(times[times.length - 1]) + 30
    const iso = toIso(dateOfDayLabel(weekStart, day))
    const sameDate = exceptions.filter(e => e.exception_date.slice(0, 10) === iso)

    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (next) {
        // 켜기: 이 구간을 지우고 있던 '불가' 예외부터 걷어내고, 그래도 기본 시간표가
        // 덮지 못하면(원래 안 내던 시간) '그날만 가능'으로 추가한다
        const blocking = sameDate.filter(
          e => e.exception_type === 'UNAVAILABLE' && overlaps(e, startMin, endMin),
        )
        for (const exc of blocking) await deleteAvailabilityException(exc.exception_id)

        if (!keys.every(k => baseSlots.includes(k))) {
          if (mode === 'weekly_with_exceptions') {
            await createAvailabilityException({
              exception_date: iso,
              exception_type: 'AVAILABLE',
              start_time: minToHhmm(startMin),
              end_time: minToHhmm(endMin),
              preference: 2,
            })
          } else if (blocking.length === 0) {
            setNotice(MODE_HINT.weekly_with_unavailable)
          }
        }
      } else {
        // 끄기: 이 주만 더했던 '가능' 예외를 먼저 지우고, 기본 시간표에서 오는
        // 시간이면 '그날 불가'로 덮는다
        const added = sameDate.filter(
          e => e.exception_type === 'AVAILABLE' && overlaps(e, startMin, endMin),
        )
        for (const exc of added) await deleteAvailabilityException(exc.exception_id)

        if (keys.some(k => baseSlots.includes(k))) {
          await createAvailabilityException({
            exception_date: iso,
            exception_type: 'UNAVAILABLE',
            start_time: minToHhmm(startMin),
            end_time: minToHhmm(endMin),
          })
        }
      }
      setExceptions(await fetchMyAvailabilityExceptions())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleBlockToggle = (keys, next) =>
    scope === 'weekly' ? toggleWeekly(keys, next) : toggleWeek(keys, next)
  const handleToggle = key => (
    editingClass ? toggleClass(key) : handleBlockToggle([key], !shownSlots.includes(key))
  )

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>
        가능 시간을 불러오는 중...
      </div>
    )
  }

  if (!policy) {
    return (
      <EmptyState
        icon={<CalendarX2 size={24} />}
        title="아직 배정된 부서가 없습니다"
        message="근로에 선발되면 부서가 정한 근무 슬롯 단위로 가능 시간을 낼 수 있습니다. 그 전까지는 공통 지원서의 근무 가능 시간이 쓰입니다."
      />
    )
  }

  // 머리글: 날짜 + 그날의 특별 사유(휴관·단축·연장)
  const weekHeaderLabels = Object.fromEntries(
    Object.entries(dayDateLabels(weekStart)).map(([day, label]) => {
      const note = dayGrid?.notes?.[day]
      return [day, note ? `${label} ${note}` : label]
    }),
  )

  const weekExceptionCount = exceptions.filter(e => {
    const iso = e.exception_date.slice(0, 10)
    return iso >= toIso(weekStart) && iso <= toIso(addDays(weekStart, 6))
  }).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {EDIT_MODES.map(m => (
          <button
            key={m.id} type="button"
            onClick={() => { setEditMode(m.id); setNotice(''); setError('') }}
            style={{
              minHeight: 32, padding: '6px 14px', borderRadius: 8,
              fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              border: `1px solid ${m.id === editMode ? 'var(--sogang-red)' : 'var(--border-default)'}`,
              background: m.id === editMode ? 'var(--sogang-red)' : 'var(--surface-card)',
              color: m.id === editMode ? 'var(--text-on-brand)' : 'var(--text-body)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {editingClass ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Select
                value={selectedTerm ?? ''}
                onChange={e => { setSelectedTerm(e.target.value); setNotice(''); setError('') }}
                size="sm"
                style={{ width: 200 }}
              >
                {terms.map(t => (
                  <option key={t.key} value={t.key}>{t.label}{t.current ? ' (진행 중)' : ''}</option>
                ))}
              </Select>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                수업이 있는 칸을 눌러 30분 단위로 표시합니다 · 이 학기 안에서 매주 반복됩니다
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {classDirty && (
                <Button variant="secondary" size="sm" onClick={() => setClassDraft(savedClass)} disabled={saving}>
                  되돌리기
                </Button>
              )}
              <Button size="sm" onClick={saveClass} disabled={!classDirty || saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </>
        ) : (
        <>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {SCOPES.map(s => {
            const on = s.id === scope
            const locked = s.id === 'week' && !weekEditable
            return (
              <button
                key={s.id} type="button" disabled={locked}
                onClick={() => { setScope(s.id); setNotice(''); setError('') }}
                title={locked ? MODE_HINT.weekly_only : undefined}
                style={{
                  padding: '7px 16px', border: 'none', cursor: locked ? 'not-allowed' : 'pointer',
                  background: on ? 'var(--sogang-red)' : 'var(--surface-card)',
                  color: on ? 'var(--text-on-brand)' : locked ? 'var(--text-subtle)' : 'var(--text-body)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)',
                  fontWeight: on ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                  opacity: locked ? 0.6 : 1,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        {scope === 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} style={navBtnStyle}>
              <ChevronLeft size={14} /> 이전 주
            </button>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>{weekLabel(weekStart)}</span>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} style={navBtnStyle}>
              다음 주 <ChevronRight size={14} />
            </button>
            <WeekCalendarButton
              subDates={exceptions.map(e => e.exception_date.slice(0, 10))}
              weekStart={toIso(weekStart)}
              onSelectWeek={iso => setWeekStart(parseIso(iso))}
            />
          </div>
        )}

        {scope === 'weekly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {dirty && (
              <Button variant="secondary" size="sm" onClick={() => setDraftSlots(baseSlots)} disabled={saving}>
                되돌리기
              </Button>
            )}
            <Button size="sm" onClick={saveWeekly} disabled={!dirty || saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        )}
        </>
        )}
      </div>

      <Alert tone="info" icon={<Info size={15} />} style={{ marginBottom: 14 }}>
        {editingClass ? (
          `SAINT 수강신청 연동 전까지는 수업 시간을 직접 표시합니다. 시간표는 학기마다 다르므로 ${termLabel(terms, selectedTerm)} 것만 저장되고, 다른 학기는 그대로 남습니다. 수업이 일부라도 걸친 근무 블록은 배정될 수 없어 근무 가능 시간에서 선택할 수 없게 되며, 표시한 칸은 근무 가능 시간에서도 자동으로 빠집니다.`
        ) : (
        <>
        {dayBlocks
          ? `${withJosa(policy.department_name ?? '소속 부서', '은', '는')} 근무 슬롯(블록) 단위로 근무합니다. 칸을 누르면 블록 전체가 함께 선택됩니다 — 수업이 일부라도 겹치는 블록은 배정될 수 없어 선택할 수 없습니다.`
          : `${withJosa(policy.department_name ?? '소속 부서', '은', '는')} 근무 슬롯을 따로 정하지 않아 30분 단위로 체크합니다.`}
        {scope === 'week'
          ? ` 지금 고른 변경은 ${weekLabel(weekStart)} 주에만 적용됩니다 (변경 ${weekExceptionCount}건).`
          : ` 지금 고른 시간은 매주 반복 적용됩니다 (${weeklyPeriod === 'vacation' ? '방학' : '학기'} 근무 시간 기준).`}
        {' '}{MODE_HINT[mode]}
        {contextTerm && classSlots.length > 0 && ` 표에 겹쳐 보이는 수업은 ${termLabel(terms, contextTerm)} 시간표입니다.`}
        </>
        )}
      </Alert>

      {error && <Alert tone="danger" style={{ marginBottom: 14 }} onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert tone="success" style={{ marginBottom: 14 }} onDismiss={() => setNotice('')}>{notice}</Alert>}

      {/* 수업 시간은 개관 시간·블록과 무관하게 30분 단위로 찍는다 —
          수업이 부서 운영 시간 밖에 있을 수도 있어 휴관 칸도 막지 않는다 */}
      <TimeGrid
        rows={rows.length > 0 ? rows : undefined}
        rowHeight={17}
        lectureSlots={editingClass ? classDraft : classSlots}
        classLabel="수업"
        lectureLegendText={editingClass ? '내 수업시간 (눌러서 표시/해제)' : '내 수업시간 (선택 불가)'}
        lectureEditable={editingClass}
        availableSlots={editingClass ? [] : shownSlots}
        availableLegendText={scope === 'weekly' ? '매주 가능한 시간' : '이 주에 가능한 시간'}
        disabledSlots={editingClass ? [] : disabledSlots}
        dayBlocks={editingClass ? undefined : dayBlocks ?? undefined}
        daySubLabels={!editingClass && scope === 'week' ? weekHeaderLabels : undefined}
        editable={editingClass || scope === 'weekly' || weekEditable}
        onToggle={handleToggle}
        onBlockToggle={handleBlockToggle}
        footer={
          editingClass
            ? { label: '수업', values: hoursByDayLabel(classDraft) }
            : { label: '합계', values: hoursByDayLabel(shownSlots.filter(k => !disabledSlots.includes(k))) }
        }
      />
    </div>
  )
}

const navBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 10px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)', background: 'var(--surface-card)',
  fontSize: 'var(--fs-sm)', color: 'var(--text-body)', cursor: 'pointer',
}
