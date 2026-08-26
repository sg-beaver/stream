import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, CircleCheck,
  CalendarCheck, CalendarDays, Sparkles, Download, Settings2,
} from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Checkbox from '../../components/ui/Checkbox'
import Button from '../../components/ui/Button'
import DatePicker from '../../components/ui/DatePicker'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import TimeGrid from '../../components/ui/TimeGrid'
import { mondayOfIso } from '../../components/ui/MonthCalendar'
import WeekCalendarButton from '../../components/ui/WeekCalendarButton'
import SubstituteDetailModal from '../../components/ui/SubstituteDetailModal'
import { AdminPanel, AdminStatCard } from '../../components/admin/AdminPanel'
import DepartmentPolicyEditor, { PENALTY_LABELS } from '../../components/admin/DepartmentPolicyEditor'
import { getSessionUser } from '../../utils/session'
import { dayCols } from '../../data/mockData'
import {
  fetchPostings,
  fetchApplicants,
  fetchDepartmentAvailability,
  fetchDepartmentClassTime,
  fetchDepartmentPolicy,
  updateDepartmentPolicy,
  importAvailabilityFromApplications,
  generateSchedule,
  reviewSchedule,
  confirmSchedule,
  fetchDepartmentSchedule,
  fetchDepartmentSubstituteRequests,
} from '../../api/client'

// 단계 이름은 uiux/ui_kits/admin/ScheduleModule.jsx와 동일하게 유지한다
const STEPS = ['가능 시간 수합', '제약 기반 생성', '주간 그리드 · 비교', '최종 확정']

const DAY_LABELS = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' }
const DAY_COLS = dayCols

// generate가 받지 않는(부서 정책 JSON에 고정된) 필수 제약 — 담당자에게 무엇이 적용되는지 알려준다.
// 항목 문구는 디자인(ScheduleModule 제약 조건 설정)을 따르되, 토글이 아니라 읽기 전용이다.
const APPLIED_CONSTRAINTS = [
  ['중복 근무 제한', '동일 학생이 같은 시간대에 두 번 배정되지 않습니다.'],
  ['주간 근로시간 상한', '교비 주 14시간 / 국가 주 20시간(학기)·40시간(방학) 기준으로 제한합니다.'],
  ['수업시간 자동 회피', '학생이 제출한 수업시간과 겹치는 시간대는 배정에서 제외됩니다.'],
  ['2주 근로시간 상한', '부서 교비 근로 학생 전체의 2주 합계가 설정한 상한을 넘지 않습니다.'],
  ['최소 인원 확보', '개관 시간대의 최소 배정 인원을 맞추고, 못 맞춘 칸은 미충원으로 보고합니다.'],
]


const isoToDots = iso => (iso ? iso.slice(0, 10).replaceAll('-', '.') : '')
const dotsToIso = dots => (dots ? dots.replaceAll('.', '-') : '')
const pad2 = n => String(n).padStart(2, '0')
const hhmm = t => String(t ?? '').slice(0, 5)
const toMin = t => {
  const [h, m] = hhmm(t).split(':').map(Number)
  return h * 60 + m
}
const minToHhmm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`

const addDaysIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}
const isMondayIso = iso => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return true
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 1
}
const hoursBetween = (start, end) => (toMin(end) - toMin(start)) / 60

function nextMondayIso() {
  const today = new Date()
  const shift = (8 - today.getDay()) % 7 || 7
  const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + shift)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

// 가능시간 구간(요일 + 시작~끝) → TimeGrid 슬롯 키 목록 ("월-14:30" 30분 단위)
// 학생 /profile 입력이 30분 단위가 되면서(#71) 수합 화면도 같은 해상도로 본다.
function availabilityToSlotKeys(rows) {
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

// 정책을 못 불러올 때의 기본 시간 행 (08:00~22:00, 30분 단위)
const HALF_HOUR_ROWS = Array.from({ length: (22 - 8) * 2 }, (_, i) => minToHhmm(8 * 60 + i * 30))

export default function AdminSchedulePage() {
  const user = getSessionUser()
  const departmentId = user?.department_id

  const [started, setStarted] = useState(false)
  const [stage, setStage] = useState(0)

  // 부서 공고 · 합격자 · 가능시간 수합
  const [deptData, setDeptData] = useState(null) // { postings, roster }
  const [loadError, setLoadError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState('')
  const [expandedStudentId, setExpandedStudentId] = useState(null)
  // 부서 개관 시간대 — 시간표 그리드의 세로 범위 기준 (학생 제출 시간이 아니라 부서 운영 시간)
  const [policy, setPolicy] = useState(null)
  const [editingHours, setEditingHours] = useState(false)
  const [savingHours, setSavingHours] = useState(false)
  const [hoursError, setHoursError] = useState('')

  const [form, setForm] = useState(() => ({
    startDate: isoToDots(nextMondayIso()), numDays: 14, timeLimit: 30, numAlternatives: 2,
    // 한 학기 고정: 2주 대표 패턴을 생성해 학기 종료일까지 주 단위 반복 확정한다.
    // 생성 시 국가근로 주간 상한이 조여져(월 46h 보장) 반복해도 규정을 지킨다.
    semesterFixed: false,
  }))
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  const [draft, setDraft] = useState(null)
  const [planIndex, setPlanIndex] = useState(0)
  const [weekIndex, setWeekIndex] = useState(0)

  // AI 검토 (REQ-SCHED-016) — draft 배치 기준이라 생성마다 초기화한다
  const [aiReview, setAiReview] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const [savedSchedule, setSavedSchedule] = useState(null)

  const load = useCallback(async () => {
    if (!departmentId) {
      setLoadError('로그인 정보에 소속 부서가 없습니다. 직원 계정으로 다시 로그인해 주세요.')
      setDeptData({ postings: [], roster: [] })
      return
    }
    setDeptData(null)
    setLoadError('')
    try {
      // 그리드 세로축은 부서 개관 시간 기준 — 아무도 제출하지 않은 시간대도 비어 있는 채로 보여야 한다
      fetchDepartmentPolicy(departmentId).then(setPolicy).catch(() => setPolicy(null))

      const list = await fetchPostings({ department_id: departmentId })
      // 공고별 합격자 명단은 지원자 API에서 가져온다 (필요 시간대 확인은 '학생 선발' 화면 담당)
      const postings = await Promise.all(list.map(async p => {
        const applicants = await fetchApplicants(p.posting_id).catch(() => [])
        return {
          id: p.posting_id,
          title: p.title,
          status: p.status,
          headcount: p.headcount ?? 0,
          hired: applicants.filter(a => a.status === '합격'),
        }
      }))

      const availability = await fetchDepartmentAvailability(departmentId)
      const byStudent = new Map()
      availability.forEach(row => {
        const key = row.student_id ?? row.student_name
        if (!byStudent.has(key)) byStudent.set(key, [])
        byStudent.get(key).push(row)
      })

      // 학생별 수업 시간 (REQ-SCHED-015) — SAINT 연동 전까지 학생이 직접 입력한 값
      const classTime = await fetchDepartmentClassTime(departmentId).catch(() => [])
      const classByStudent = new Map()
      classTime.forEach(row => {
        const key = row.student_id ?? row.student_name
        if (!classByStudent.has(key)) classByStudent.set(key, [])
        classByStudent.get(key).push(row)
      })

      const hiredNames = new Map()
      postings.forEach(p => p.hired.forEach(a => hiredNames.set(a.student_id, a.student_name)))

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

      setDeptData({ postings, roster })
    } catch (e) {
      setLoadError(e.message)
      setDeptData({ postings: [], roster: [] })
    }
  }, [departmentId])

  useEffect(() => { load() }, [load])

  const handleSavePolicy = async patch => {
    setSavingHours(true)
    setHoursError('')
    try {
      // 응답이 갱신된 정책이므로 그대로 반영하면 수합 시간표 세로축도 함께 바뀐다
      setPolicy(await updateDepartmentPolicy(departmentId, patch))
      setEditingHours(false)
    } catch (e) {
      setHoursError(`설정을 저장하지 못했습니다. ${e.message}`)
    } finally {
      setSavingHours(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setImportNote('')
    try {
      const res = await importAvailabilityFromApplications(departmentId)
      const noSlots = res.results.filter(r => r.result === 'no_slots').length
      setImportNote(
        res.imported_students > 0
          ? `${res.imported_students}명의 지원서 시간을 연동했습니다 (${res.imported_intervals}개 구간).`
              + (noSlots > 0 ? ` ${noSlots}명은 지원서에 근무 가능 시간이 없어 직접 입력이 필요합니다.` : '')
          : `새로 연동할 지원서 시간이 없습니다.${noSlots > 0 ? ` ${noSlots}명은 지원서에 시간이 없어 직접 입력이 필요합니다.` : ''}`,
      )
      await load()
    } catch (e) {
      setImportNote(`연동에 실패했습니다. ${e.message}`)
    } finally {
      setImporting(false)
    }
  }

  const startDateIso = dotsToIso(form.startDate)
  const endDateIso = startDateIso ? addDaysIso(startDateIso, form.numDays - 1) : ''

  const handleGenerate = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateIso)) {
      setGenerateError('시작일을 YYYY.MM.DD 형식으로 입력해 주세요.')
      return
    }
    setGenerating(true)
    setGenerateError('')
    try {
      const res = await generateSchedule({
        department_id: departmentId,
        start_date: startDateIso,
        num_days: Number(form.numDays),
        time_limit_seconds: Number(form.timeLimit),
        num_alternatives: Number(form.numAlternatives),
        semester_pattern: form.semesterFixed,
      })
      const { alternatives = [], ...primary } = res
      setDraft({
        requested: {
          startDate: startDateIso, endDate: endDateIso, numDays: Number(form.numDays),
          semesterFixed: form.semesterFixed,
          // 학사 캘린더 기준 학기 종료일 — 확정 단계의 반복 종료일 기본값
          semesterEnd: primary.semester_end ?? null,
        },
        plans: [primary, ...alternatives],
      })
      setPlanIndex(0)
      setWeekIndex(0)
      setConfirmed(null)
      setSavedSchedule(null)
      setAiReview(null)
      setReviewError('')
      setStage(2)
    } catch (e) {
      if (e.status === 409) {
        setGenerateError(`${e.message} 1단계의 가능시간 수합 현황에서 미제출자를 먼저 확인해 주세요.`)
      } else if (e.status === 504) {
        setGenerateError(`${e.message} (기간을 줄이거나 풀이 시간 제한을 늘려 보세요)`)
      } else {
        setGenerateError(e.message)
      }
    } finally {
      setGenerating(false)
    }
  }

  const selectedPlan = draft?.plans[planIndex] ?? null

  // AI 검토 — 검토 대상은 generate가 저장한 draft 배치(기본안 배정)다.
  // 규칙 미등록·AI 실패도 200으로 오므로(review_available=false) 여기서 throw되지 않는다.
  const handleReview = async () => {
    const batchId = draft?.plans?.[0]?.batch_id
    if (!batchId) return
    setReviewing(true)
    setReviewError('')
    try {
      setAiReview(await reviewSchedule(batchId))
    } catch (e) {
      setReviewError(e.message)
    } finally {
      setReviewing(false)
    }
  }

  // 한 학기 고정 시간표: 반복 전개는 서버가 한다 (repeat_until) — 공휴일 단축·폐관
  // 등 실제 학사 일정을 반영해야 하므로 클라이언트에서 복제하지 않는다.
  const handleConfirm = async ({ semesterEnd } = {}) => {
    if (!selectedPlan) return
    setConfirming(true)
    setConfirmError('')
    try {
      const schedules = selectedPlan.schedules.map(s => ({
        student_id: s.student_id, date: s.date,
        start_time: s.start_time, end_time: s.end_time,
      }))
      const periodEnd = semesterEnd ?? draft.requested.endDate
      const res = await confirmSchedule({
        department_id: departmentId,
        period_start: draft.requested.startDate,
        period_end: draft.requested.endDate,
        schedules,
        ...(semesterEnd ? { repeat_until: semesterEnd } : {}),
      })
      setConfirmed({ ...res, period_end: periodEnd })
      const saved = await fetchDepartmentSchedule(departmentId, {
        from_date: draft.requested.startDate, to_date: periodEnd,
      }).catch(() => null)
      setSavedSchedule(saved)
    } catch (e) {
      setConfirmError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  const roster = deptData?.roster ?? []

  // ---- 진입 화면: 근무표 생성 시작 + 확정 근무표·대타 캘린더 ----
  if (!started) {
    return (
      <AdminShell activeMenu="schedule">
        <PageTitle>근로 시간표</PageTitle>
        <p style={{ margin: '0 0 20px 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          근무표는 <b style={{ color: 'var(--text-body)' }}>부서 단위</b>로 생성되며,
          부서 정책(개관 시간·최소 인원·근로시간 상한)을 기준으로 합니다.
        </p>

        {loadError && <ErrorNote message={loadError} />}

        {/* 생성 시작 바 — 원하는 기간을 정하고 바로 시작한다 (기간은 생성 단계에서도 수정 가능) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginBottom: 18, padding: '16px 22px', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-body)' }}>시작일</span>
            <div style={{ width: 140 }}>
              <DatePicker value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} placeholder="YYYY.MM.DD" />
            </div>
          </div>
          <Select
            value={form.semesterFixed ? 'semester' : form.numDays}
            onChange={e => {
              const v = e.target.value
              // 학기 고정은 2주 대표 패턴을 풀어 학기 종료일까지 반복 확정한다
              setForm(f => v === 'semester'
                ? { ...f, numDays: 14, semesterFixed: true }
                : { ...f, numDays: Number(v), semesterFixed: false })
            }}
            style={{ width: 'auto', minWidth: 130 }}
          >
            <option value={7}>1주 (7일)</option>
            <option value={14}>2주 (14일) · 권장</option>
            <option value={21}>3주 (21일)</option>
            <option value={28}>4주 (28일)</option>
            <option value="semester">한 학기 고정 (2주 패턴 반복)</option>
          </Select>
          <Button disabled={deptData === null} onClick={() => { setStarted(true); setStage(0) }}>
            <CalendarDays size={14} /> 부서 근무표 생성 시작
          </Button>
        </div>

        <ConfirmedScheduleSection departmentId={departmentId} policy={policy} />
      </AdminShell>
    )
  }

  const canGoNext = stage === 0 ? true : stage === 1 ? !!draft : stage === 2 ? !!selectedPlan : false

  return (
    <AdminShell activeMenu="schedule">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <button onClick={() => { setStarted(false); setStage(0) }} style={{ ...backBtnStyle, marginBottom: 6 }}>
            <ChevronLeft size={15} /> 공고 현황으로
          </button>
          <PageTitle>근로 시간표</PageTitle>
          <p style={{ margin: '0 0 0 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
            {user?.department_name ?? '우리 부서'} — 학생의 근무 가능 시간을 확인하고 제약 조건 기반으로 근무표를 생성·확정합니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {stage > 0 && !confirmed && <Button variant="secondary" size="sm" onClick={() => setStage(stage - 1)}><ChevronLeft size={14} /> 이전 단계</Button>}
          {stage < 3 && <Button size="sm" disabled={!canGoNext} onClick={() => setStage(stage + 1)}>다음 단계 <ChevronRight size={14} /></Button>}
        </div>
      </div>

      <Stepper stage={stage} />

      {stage === 0 && (
        <AvailabilityStage
          deptData={deptData} roster={roster} error={loadError} onRetry={load}
          policy={policy}
          editingHours={editingHours} savingHours={savingHours} hoursError={hoursError}
          onEditHours={() => { setHoursError(''); setEditingHours(true) }}
          onCloseHours={() => setEditingHours(false)}
          onSaveHours={handleSavePolicy}
          expandedId={expandedStudentId} onExpand={setExpandedStudentId}
          onImport={handleImport} importing={importing} importNote={importNote}
          departmentName={user?.department_name}
        />
      )}

      {stage === 1 && (
        <GenerateStage
          form={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
          startDateIso={startDateIso} endDateIso={endDateIso}
          submitting={generating} error={generateError} onSubmit={handleGenerate}
          submittedCount={roster.filter(r => r.submitted).length}
        />
      )}

      {stage === 2 && (
        draft ? (
          <ReviewStage
            draft={draft} planIndex={planIndex} onPick={i => { setPlanIndex(i); setWeekIndex(0) }}
            weekIndex={weekIndex} onWeek={setWeekIndex} policy={policy}
            aiReview={aiReview} reviewing={reviewing} reviewError={reviewError} onReview={handleReview}
          />
        ) : (
          <AdminPanel><EmptyNote>아직 생성된 근무표가 없습니다. 이전 단계에서 근무표를 생성해 주세요.</EmptyNote></AdminPanel>
        )
      )}

      {stage === 3 && (
        <ConfirmStage
          plan={selectedPlan} draft={draft} planIndex={planIndex} hiredCount={roster.filter(r => r.inHiredList).length}
          confirming={confirming} error={confirmError} confirmed={confirmed} saved={savedSchedule}
          onConfirm={handleConfirm} onBack={() => setStage(2)}
          onRestart={() => { setStarted(false); setStage(0); setDraft(null); setConfirmed(null) }}
        />
      )}
    </AdminShell>
  )
}

// ---- 1단계: 가능 시간 수합 ----

function AvailabilityStage({
  deptData, roster, error, onRetry, policy,
  editingHours, savingHours, hoursError, onEditHours, onCloseHours, onSaveHours,
  expandedId, onExpand, onImport, importing, importNote, departmentName,
}) {
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

  const submitted = roster.filter(r => r.submitted)
  const missing = roster.filter(r => !r.submitted)
  const fromApplication = roster.filter(r => r.submitted && r.source === 'application')
  // 탭에서 아무도 고르지 않았으면 첫 학생을 보여준다 — 빈 화면 대신 바로 시간표가 보이게
  const selected = roster.find(r => r.studentId === expandedId) ?? roster[0] ?? null
  const gridRows = policyRows(policy)
  const dayBlocks = blocksByDayLabel(policy)

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
        <AdminStatCard stat={{ label: '가능시간 확보', value: `${submitted.length}명`, sub: `지원서 연동 ${fromApplication.length} · 직접 입력 ${submitted.length - fromApplication.length}`, icon: 'CircleCheck', tone: 'success' }} />
        <AdminStatCard stat={{ label: '미확보', value: `${missing.length}명`, sub: '생성 전 확인 필요', icon: 'Clock', tone: 'warning' }} />
        <AdminStatCard stat={{ label: '총 가능시간', value: `${roster.reduce((n, r) => n + r.hours, 0)}h`, sub: '주간 패턴 합계', icon: 'CalendarClock', tone: 'info' }} />
      </div>

      <AdminPanel
        title={editingHours ? '근무표 설정' : '전체 수합 시간표'}
        right={
          editingHours ? null : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                {policy
                  ? `${departmentName ?? '부서'} 개관 ${policy.grid_start_time}~${policy.grid_end_time}`
                  + ` · ${policy.min_per_slot}~${policy.max_per_slot}명`
                  + (policy.opening_hours_source === 'department' || policy.staffing_source === 'department' ? ' · 직접 설정' : ' · 기본 정책')
                  : '개관 시간 불러오는 중...'}
              </span>
              <Button variant="secondary" size="sm" onClick={onEditHours} disabled={!policy}>
                <Settings2 size={13} /> 근무표 설정
              </Button>
            </div>
          )
        }
      >
        {editingHours ? (
          <DepartmentPolicyEditor
            policy={policy}
            onSave={onSaveHours}
            saving={savingHours}
            error={hoursError}
            onClose={onCloseHours}
          />
        ) : (
          <>
            <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              부서 개관 시간대 전체를 세로축으로 두고, 칸마다 그 시간에
              <b style={{ color: 'var(--text-body)' }}> 근무 가능하다고 제출한 학생</b>을 모아 보여줍니다.
              비어 있는 칸은 가능자가 없는 시간대입니다 — 생성 시 미충원이 날 가능성이 높습니다.
            </p>
            <AvailabilityHeatmap roster={roster} rows={gridRows} policy={policy} />
          </>
        )}
      </AdminPanel>

      <AdminPanel
        title="가능 시간 확인"
        right={<span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>선발 {roster.filter(r => r.inHiredList).length}명 중 <b style={{ color: 'var(--success)' }}>{submitted.length}</b>명 확보</span>}
      >
        <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--text-body)' }}>신규 선발 학생</b>은 시간을 다시 받지 않고 지원서에서 체크한 근무 가능 시간을 그대로 연동합니다.
          이미 근로 중이던 <b style={{ color: 'var(--text-body)' }}>기존 학생</b>은 지원서가 없어 직접 입력한 시간을 사용합니다.
          이름 탭을 누르면 그 학생의 수합된 시간표를 볼 수 있습니다.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Button variant="secondary" size="sm" onClick={onImport} disabled={importing}>
            <Download size={13} /> {importing ? '연동 중...' : '지원서 시간 연동'}
          </Button>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
            합격 처리 시 자동 연동되지만, 지원서를 나중에 채운 학생이 있으면 다시 실행하세요. 직접 입력분은 덮어쓰지 않습니다.
          </span>
        </div>
        {importNote && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', marginBottom: 14, background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--info)' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{importNote}</span>
          </div>
        )}

        {roster.length === 0 ? (
          <EmptyNote>합격 처리된 학생이 없습니다. 학생 선발을 먼저 진행해 주세요.</EmptyNote>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {roster.map(r => {
                const on = selected?.studentId === r.studentId
                return (
                  <button
                    key={r.studentId} type="button" onClick={() => onExpand(r.studentId)}
                    title={r.submitted ? (r.source === 'application' ? '지원서 연동' : '직접 입력') : '가능 시간 미확보'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
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

            {selected && (
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 10, color: selected.submitted ? 'var(--success)' : 'var(--warning)' }}>
                {selected.name} — {selected.submitted ? (selected.source === 'application' ? '지원서 연동' : '직접 입력') : '가능 시간 미확보'}
                {!selected.inHiredList && <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}> · 합격 명단 외</span>}
              </div>
            )}

            {selected && (selected.slotKeys.length === 0 ? (
              <EmptyNote>수합된 가능 시간이 없습니다. 지원서 연동 또는 학생의 직접 입력이 필요합니다.</EmptyNote>
            ) : (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-body)', lineHeight: 1.6 }}>
                  {dayBlocks && <>시간표는 부서가 설정한 <b style={{ color: 'var(--text-body)' }}>근무 슬롯(블록)</b> 단위로 묶여 있습니다. </>}
                  체크 표시는 학생이 <b style={{ color: 'var(--sogang-red)' }}>근무 가능</b>하다고 제출한 시간
                  ({selected.source === 'application' ? '지원서에서 연동' : '직접 입력'})이고,
                  수업 시간은 붉은 칸(<b style={{ color: 'var(--sogang-red)' }}>수업</b>)으로 표시됩니다
                  {selected.classSlotKeys.length === 0 && ' — 이 학생은 아직 수업 시간을 입력하지 않았습니다'}.
                  맨 아래 행은 요일별 가능 시간 합계입니다.
                </p>
                <TimeGrid
                  rows={gridRows ?? HALF_HOUR_ROWS} rowHeight={17}
                  classSlots={selected.classSlotKeys} classLabel="수업"
                  availableSlots={selected.slotKeys}
                  availableLegendText={`근무 가능 시간: 총 ${selected.hours}시간`}
                  classLegendText="수업 시간 (학생 직접 입력, SAINT 연동 전)"
                  footer={{ label: '가능 시간', values: dayHourTotals(selected) }}
                  dayBlocks={dayBlocks ?? undefined}
                />
              </>
            ))}
          </>
        )}
      </AdminPanel>
    </div>
  )
}

// 부서 개관 시간(정책)에서 시간표 그리드의 시간 행을 만든다 (30분 단위).
// 정책을 못 불러오면 기본 범위(08:00~22:00)를 쓰도록 undefined를 반환한다.
function policyRows(policy) {
  if (!policy) return undefined
  const start = toMin(policy.grid_start_time)
  const end = toMin(policy.grid_end_time)
  const rows = []
  for (let m = start; m + 30 <= end; m += 30) rows.push(minToHhmm(m))
  return rows.length > 0 ? rows : undefined
}

// 부서 정의 근무 슬롯(#89) → TimeGrid dayBlocks 형태 { '월': [{start, end}], ... } (분).
// 학기 블록이 정의돼 있으면 학기 것을, 아니면 방학 것을 쓴다 — 화면은 주간 패턴이라
// 기간을 날짜별로 구분하지 않는다 (MVP: 학기만 정의됨). 블록 미정의면 null(30분 그리드).
function blocksByDayLabel(policy) {
  const source = policy?.work_slots?.semester?.length
    ? policy.work_slots.semester
    : policy?.work_slots?.vacation ?? []
  if (source.length === 0) return null
  const map = {}
  source.forEach(d => {
    map[DAY_LABELS[d.day_of_week]] = d.ranges.map(r => ({
      start: toMin(r.start_time), end: toMin(r.end_time),
    }))
  })
  return map
}

// 요일별 개관 시간(학기 기준) → 그 요일에 열지 않는 칸을 회색으로 죽이기 위한 조회 함수.
// 하루가 여러 구간으로 끊길 수 있어(점심 휴관 등) 구간 목록으로 다룬다.
function openRangeLookup(policy) {
  const byDay = new Map()
  const semester = policy?.opening_hours?.semester ?? []
  semester.forEach(day => {
    byDay.set(day.day_of_week, (day.ranges ?? []).map(r => [toMin(r.start_time), toMin(r.end_time)]))
  })
  return (dayIndex, minute) => {
    if (byDay.size === 0) return true // 정책을 모르면 전부 열린 것으로 본다
    const ranges = byDay.get(dayIndex) ?? []
    // 수합 표는 30분 행 — 그 30분이 개관 구간과 겹치면 열린 칸으로 본다
    return ranges.some(([start, end]) => minute < end && minute + 30 > start)
  }
}

// 부서 전체 수합 — 칸마다 그 시간에 가능하다고 제출한 학생 이름을 모아 보여준다.
// TimeGrid는 칸당 한 줄만 그리도록 되어 있어, 이름이 여러 개 들어가는 이 표는 따로 그린다.
function AvailabilityHeatmap({ roster, rows, policy }) {
  // 부서 정책을 못 불러오면 기본 시간 범위(08:00~22:00, 30분 단위)를 쓴다
  const timeRows = rows ?? HALF_HOUR_ROWS
  const isOpen = openRangeLookup(policy)
  const dayBlocks = blocksByDayLabel(policy)

  // "요일-HH:MM" → 그 칸에 가능한 학생 이름 목록
  const bySlot = useMemo(() => {
    const map = new Map()
    roster.forEach(r => r.slotKeys.forEach(key => {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r.name)
    }))
    return map
  }, [roster])

  const maxCount = Math.max(1, ...[...bySlot.values()].map(v => v.length))

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
            <th style={{ ...headCellStyle, width: 62 }}>시간</th>
            {DAY_COLS.map(d => <th key={d} style={headCellStyle}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {timeRows.map(time => (
            <tr key={time}>
              {/* 30분 행 — 시간 라벨은 정시에만 표시 */}
              <td style={{ ...headCellStyle, fontWeight: 600, fontSize: 'var(--fs-caption)' }}>{time.endsWith(':00') ? time : ''}</td>
              {DAY_COLS.map((day, i) => {
                // 블록 병합 칸 — 블록 전체 가능한 학생(교집합)만 이름으로, 일부 가능은 인원수로
                const blockInfo = blockAt ? blockAt[day]?.get(time) : undefined
                if (blockInfo === 'covered') return null
                if (blockInfo) {
                  const perSlot = blockInfo.times.map(t => bySlot.get(`${day}-${t}`) ?? [])
                  const full = perSlot[0].filter(n => perSlot.every(list => list.includes(n)))
                  const partial = [...new Set(perSlot.flat())].filter(n => !full.includes(n))
                  const alpha = full.length === 0 ? 0 : 0.12 + 0.5 * (full.length / maxCount)
                  return (
                    <td
                      key={day} rowSpan={blockInfo.span}
                      title={`${blockInfo.times[0]}~ 블록 · 전체 가능 ${full.length}명${partial.length > 0 ? ` · 일부만 가능 ${partial.length}명(${partial.join(', ')})` : ''}`}
                      style={{
                        border: '1px solid var(--saint-grid)',
                        verticalAlign: 'top', padding: '3px 5px',
                        background: full.length > 0 ? `rgba(182, 0, 5, ${alpha})` : 'var(--neutral-0)',
                      }}
                    >
                      <span style={{ fontSize: 'var(--fs-caption)', lineHeight: 1.35, color: 'var(--text-strong)', wordBreak: 'keep-all' }}>
                        {full.join(' ')}
                      </span>
                      {partial.length > 0 && (
                        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-subtle)' }}>일부 {partial.length}명</div>
                      )}
                    </td>
                  )
                }

                const names = bySlot.get(`${day}-${time}`) ?? []
                const open = isOpen(i + 1, toMin(time))
                // 가능 인원이 많을수록 진하게 — 담당자가 취약 시간대를 한눈에 찾도록
                const alpha = names.length === 0 ? 0 : 0.12 + 0.5 * (names.length / maxCount)
                return (
                  <td
                    key={day}
                    title={names.length > 0 ? `${time} · ${names.join(', ')}` : undefined}
                    style={{
                      border: '1px solid var(--saint-grid)',
                      verticalAlign: 'top', padding: '2px 5px', height: 20,
                      background: !open
                        ? 'repeating-linear-gradient(45deg, var(--neutral-25), var(--neutral-25) 4px, var(--neutral-50) 4px, var(--neutral-50) 8px)'
                        : names.length > 0 ? `rgba(182, 0, 5, ${alpha})` : 'var(--neutral-0)',
                    }}
                  >
                    {!open ? (
                      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-subtle)' }}>휴관</span>
                    ) : names.length === 0 ? null : (
                      <span style={{ fontSize: 'var(--fs-caption)', lineHeight: 1.35, color: 'var(--text-strong)', wordBreak: 'keep-all' }}>
                        {names.join(' ')}
                      </span>
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
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(182, 0, 5, 0.15)', border: '1px solid var(--saint-grid)' }} />
          가능자 적음
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(182, 0, 5, 0.62)', border: '1px solid var(--saint-grid)' }} />
          가능자 많음
        </span>
        {dayBlocks && (
          <span style={{ color: 'var(--text-subtle)' }}>
            근무 슬롯(블록) 단위 — 이름은 블록 전체 가능자, &lsquo;일부 n명&rsquo;은 블록 일부만 가능해 배정할 수 없는 학생입니다
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid var(--saint-grid)', background: 'var(--neutral-0)' }} />
          가능자 없음
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid var(--saint-grid)', background: 'repeating-linear-gradient(45deg, var(--neutral-25), var(--neutral-25) 3px, var(--neutral-50) 3px, var(--neutral-50) 6px)' }} />
          휴관
        </span>
      </div>
    </div>
  )
}

const headCellStyle = {
  border: '1px solid var(--saint-grid)',
  background: 'var(--saint-tan)',
  color: 'var(--saint-maroon)',
  fontSize: 'var(--fs-sm)', fontWeight: 700,
  padding: '6px 4px', textAlign: 'center',
}

// ---- 2단계: 제약 기반 생성 ----

function GenerateStage({ form, onChange, startDateIso, endDateIso, submitting, error, onSubmit, submittedCount }) {
  const notMonday = startDateIso && !isMondayIso(startDateIso)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      <AdminPanel title="적용되는 제약 조건" right={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>부서 정책 기준 · 항상 적용</span>}>
        <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          아래 필수 제약(Hard Constraint)은 부서 스케줄링 정책에 정의되어 있어 생성 시 항상 적용됩니다.
          화면에서 켜고 끄지 않습니다 — 값을 바꾸려면 부서 정책을 수정해야 합니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {APPLIED_CONSTRAINTS.map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-25)' }}>
              <CircleCheck size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>{title}</span>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>{desc}</span>
              </span>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel title="생성 조건">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FieldLabel required>시작일</FieldLabel>
            <DatePicker value={form.startDate} onChange={v => onChange('startDate', v)} placeholder="YYYY.MM.DD" />
            {notMonday && (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--warning)' }}>
                월요일로 시작하는 것을 권장합니다 (주간 상한이 월~일 기준으로 계산됩니다).
              </p>
            )}
          </div>
          <div>
            <FieldLabel required>생성 기간</FieldLabel>
            <Select
              value={form.semesterFixed ? 'semester' : form.numDays}
              onChange={e => {
                const v = e.target.value
                if (v === 'semester') {
                  onChange('numDays', 14)
                  onChange('semesterFixed', true)
                } else {
                  onChange('numDays', Number(v))
                  onChange('semesterFixed', false)
                }
              }}
            >
              <option value={7}>1주 (7일)</option>
              <option value={14}>2주 (14일) · 권장</option>
              <option value={21}>3주 (21일)</option>
              <option value={28}>4주 (28일)</option>
              <option value="semester">한 학기 고정 (2주 패턴 반복)</option>
            </Select>
            {endDateIso && (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
                {isoToDots(startDateIso)} ~ {isoToDots(endDateIso)}
                {form.semesterFixed && ' — 2주 패턴을 생성해 확정 시 학기 종료일까지 반복합니다'}
              </p>
            )}
          </div>
          <div>
            <FieldLabel>풀이 시간 제한 (초)</FieldLabel>
            <Input type="number" min={1} max={120} value={form.timeLimit}
              onChange={e => onChange('timeLimit', e.target.value)} />
            <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>배정안 하나당 상한 (1~120초)</p>
          </div>
          <div>
            <FieldLabel>비교할 배정안 개수</FieldLabel>
            <Select value={form.numAlternatives} onChange={e => onChange('numAlternatives', Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}개</option>)}
            </Select>
            <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>동률 배정안을 여러 개 받아 비교합니다</p>
          </div>
        </div>
      </AdminPanel>

      {submittedCount === 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--warning)' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>가능시간이 확보된 학생이 없습니다. 생성 결과가 비거나 실패할 수 있습니다.</span>
        </div>
      )}
      {error && <ErrorNote message={error} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onSubmit} disabled={submitting}>
          <Sparkles size={14} /> {submitting ? '근무표 생성 중...' : '근무표 생성'}
        </Button>
      </div>
      {submitting && (
        <p style={{ margin: 0, textAlign: 'right', fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
          제약조건 최적화 중입니다. 설정한 풀이 시간(최대 {form.timeLimit}초 × {form.numAlternatives}개)만큼 걸릴 수 있습니다.
        </p>
      )}
    </div>
  )
}

// ---- 3단계: 주간 그리드 · 비교 ----

// 배정안 지표 — 디자인의 미충원·배정 편차·출근 횟수를 API 응답에서 파생한다.
// (디자인의 '충원율'은 전체 개관 슬롯 수가 응답에 없어 계산 불가 → 배정 건수로 대체)
function planMetrics(plan) {
  const hours = (plan.per_student ?? []).map(s => s.total_hours ?? 0)
  const commutes = new Set((plan.schedules ?? []).map(s => `${s.student_id}|${s.date}`)).size
  return {
    assigned: plan.generated_count ?? 0,
    shortage: (plan.shortages ?? []).length,
    balanceGap: hours.length > 0 ? Math.round((Math.max(...hours) - Math.min(...hours)) * 10) / 10 : 0,
    commutes,
    penaltyTotal: Object.values(plan.penalty_summary ?? {}).reduce((a, b) => a + b, 0),
  }
}

// 생성 결과(날짜 단위)를 주차별로 나눈다 — 주간 그리드는 한 주씩 본다
function splitWeeks(draft) {
  const weeks = []
  for (let offset = 0; offset < draft.requested.numDays; offset += 7) {
    const start = addDaysIso(draft.requested.startDate, offset)
    const end = addDaysIso(draft.requested.startDate, Math.min(offset + 6, draft.requested.numDays - 1))
    weeks.push({ index: weeks.length, start, end })
  }
  return weeks
}

// 한 주의 배정·미충원을 요일×시간 그리드로 변환.
// 시간 행은 그 주에 실제로 등장하는 시각에서 30분 단위로 만든다 (08:00·30분 슬롯 포함).
function buildWeekGrid(plan, week) {
  const inWeek = x => x.date >= week.start && x.date <= week.end
  const rowsOf = plan.schedules.filter(inWeek)
  const shortages = (plan.shortages ?? []).filter(inWeek)

  const bounds = [...rowsOf, ...shortages].flatMap(x => [toMin(x.start_time), toMin(x.end_time)])
  if (bounds.length === 0) return null
  const from = Math.floor(Math.min(...bounds) / 30) * 30
  const to = Math.ceil(Math.max(...bounds) / 30) * 30

  const rows = []
  for (let m = from; m < to; m += 30) rows.push(minToHhmm(m))

  const byCell = new Map()  // "월-08:00" → { names:[], shortage:bool }
  const cell = key => {
    if (!byCell.has(key)) byCell.set(key, { names: [], shortage: false })
    return byCell.get(key)
  }
  rowsOf.forEach(r => {
    for (let m = toMin(r.start_time); m < toMin(r.end_time); m += 30) {
      cell(`${r.day_of_week}-${minToHhmm(m)}`).names.push(r.student_name ?? r.student_id)
    }
  })
  shortages.forEach(s => {
    for (let m = toMin(s.start_time); m < toMin(s.end_time); m += 30) {
      cell(`${s.day_of_week}-${minToHhmm(m)}`).shortage = true
    }
  })

  const filledSlots = [], slotLabels = {}, slotColors = {}
  byCell.forEach((v, key) => {
    filledSlots.push(key)
    if (v.names.length > 0) {
      // 블록 병합 칸에서 이름이 전부 보이도록 축약("외 N") 없이 그대로 담는다
      slotLabels[key] = v.names.join(' · ')
      slotColors[key] = 'var(--sogang-red)'
    } else {
      slotLabels[key] = '미충원'
      slotColors[key] = 'var(--warning)'
    }
  })
  return { rows, filledSlots, slotLabels, slotColors, assignedCount: rowsOf.length, shortageCount: shortages.length }
}

// AI 검토 심각도 표기 — 백엔드 ReviewFinding.severity와 같은 키
const REVIEW_SEVERITY = {
  critical: { label: '위반', color: 'var(--danger)', bg: 'var(--danger-50)', border: 'var(--danger-100)' },
  warning: { label: '우려', color: 'var(--warning)', bg: 'var(--warning-50)', border: 'var(--warning-100)' },
  info: { label: '참고', color: 'var(--info)', bg: 'var(--info-50)', border: 'var(--info-100)' },
}

// review_available=false일 때의 reason 안내 (백엔드 review.py의 조용한 실패 사유)
const REVIEW_UNAVAILABLE_REASONS = {
  no_rules: '부서 운영 규칙이 등록되어 있지 않습니다. 1단계의 근무표 설정에서 AI 검토 규칙을 등록하면 사용할 수 있습니다.',
  not_configured: '서버에 AI 키(GEMINI_API_KEY)가 설정되어 있지 않아 검토를 수행할 수 없습니다.',
  ai_error: 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.',
}

function ReviewStage({ draft, planIndex, onPick, weekIndex, onWeek, policy, aiReview, reviewing, reviewError, onReview }) {
  const plan = draft.plans[planIndex]
  const weeks = useMemo(() => splitWeeks(draft), [draft])
  const week = weeks[Math.min(weekIndex, weeks.length - 1)]
  const grid = useMemo(() => (week ? buildWeekGrid(plan, week) : null), [plan, week])
  const metrics = planMetrics(plan)
  const dayBlocks = blocksByDayLabel(policy)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--info)' }}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>아래 결과는 <b>초안</b>입니다. 미충원 칸과 개인별 시간 집계를 확인한 뒤 4단계에서 확정하면 근무표로 저장됩니다.</span>
      </div>

      {draft.plans.length > 1 && (
        <AdminPanel title="배정안 비교" right={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>동률 배정안 {draft.plans.length}개</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(draft.plans.length, 3)}, 1fr)`, gap: 14 }}>
            {draft.plans.map((p, i) => {
              const m = planMetrics(p)
              const on = i === planIndex
              return (
                <div key={i} onClick={() => onPick(i)} style={{ cursor: 'pointer', border: `1.5px solid ${on ? 'var(--sogang-red)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-lg)', padding: 18, position: 'relative' }}>
                  {i === 0 && <span style={{ position: 'absolute', top: -10, left: 16, background: 'var(--sogang-red)', color: 'var(--text-on-brand)', fontSize: 'var(--fs-caption)', fontWeight: 700, padding: '2px 10px', borderRadius: 5 }}>기본안</span>}
                  <div style={{ fontSize: 'var(--fs-title)', fontWeight: 800, color: 'var(--text-strong)', marginBottom: 12 }}>배정안 {String.fromCharCode(65 + i)}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                    <Metric label="배정 건수" value={`${m.assigned}건`} tone="var(--text-strong)" />
                    <Metric label="미충원" value={`${m.shortage}칸`} tone={m.shortage === 0 ? 'var(--success)' : 'var(--warning)'} />
                    <Metric label="배정 편차" value={`${m.balanceGap}시간`} tone={m.balanceGap <= 5 ? 'var(--success)' : 'var(--warning)'} />
                    <Metric label="출근 횟수" value={`${m.commutes}회`} tone="var(--text-strong)" />
                  </div>
                  <Button variant={on ? 'primary' : 'secondary'} size="sm" onClick={() => onPick(i)}>
                    {on ? '선택됨' : '이 배정안 선택'}
                  </Button>
                </div>
              )
            })}
          </div>
        </AdminPanel>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <AdminStatCard stat={{ label: '풀이 상태', value: plan.status === 'OPTIMAL' ? '최적해' : '실행가능해', sub: plan.status, icon: 'BadgeCheck', tone: plan.status === 'OPTIMAL' ? 'success' : 'info' }} />
        <AdminStatCard stat={{ label: '배정 건수', value: `${metrics.assigned}건`, sub: `${isoToDots(draft.requested.startDate)} ~ ${isoToDots(draft.requested.endDate)}`, icon: 'CalendarCheck', tone: 'neutral' }} />
        <AdminStatCard stat={{ label: '미충원', value: `${metrics.shortage}칸`, sub: '최소 인원 미달', icon: 'TriangleAlert', tone: metrics.shortage === 0 ? 'success' : 'warning' }} />
        <AdminStatCard stat={{ label: '풀이 시간', value: `${plan.solve_time_seconds ?? 0}초`, sub: '솔버 실행 시간', icon: 'Timer', tone: 'info' }} />
      </div>

      <AdminPanel
        title="AI 검토 (부서 운영 규칙 기준)"
        right={
          <Button variant="secondary" size="sm" onClick={onReview} disabled={reviewing}>
            <Sparkles size={13} /> {reviewing ? '검토 중...' : aiReview ? '다시 검토' : 'AI 검토 실행'}
          </Button>
        }
      >
        <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          부서가 등록한 <b style={{ color: 'var(--text-body)' }}>자연어 운영 규칙</b>을 기준으로 AI가
          저장된 초안(기본안 배정)을 점검합니다. AI는 <b style={{ color: 'var(--text-body)' }}>의견만 제시</b>하며
          확정은 항상 담당자가 합니다.
        </p>
        {reviewError && <ErrorNote message={reviewError} />}
        {reviewing && <EmptyNote>AI가 배정 초안을 검토하는 중입니다... (수 초 정도 걸릴 수 있어요)</EmptyNote>}
        {!reviewing && aiReview && aiReview.review_available === false && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--warning)' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{REVIEW_UNAVAILABLE_REASONS[aiReview.reason] ?? `검토를 수행할 수 없습니다. (${aiReview.reason})`}</span>
          </div>
        )}
        {!reviewing && aiReview?.review_available && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.6 }}>
              {aiReview.review.summary}
            </p>
            {aiReview.review.findings.length === 0 ? (
              <EmptyNote>규칙 위반이나 우려 사항이 발견되지 않았습니다.</EmptyNote>
            ) : (
              aiReview.review.findings.map((f, i) => {
                const sev = REVIEW_SEVERITY[f.severity] ?? REVIEW_SEVERITY.info
                return (
                  <div key={i} style={{ padding: '12px 16px', background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', lineHeight: 1.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-on-brand)', background: sev.color, padding: '1px 8px', borderRadius: 4 }}>{sev.label}</span>
                      {f.rule && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>규칙: {f.rule}</span>}
                    </div>
                    <div style={{ color: 'var(--text-body)', fontWeight: 600 }}>{f.message}</div>
                    {f.evidence && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: 2 }}>근거: {f.evidence}</div>}
                    {f.suggestion && <div style={{ fontSize: 'var(--fs-sm)', color: sev.color, marginTop: 2 }}>제안: {f.suggestion}</div>}
                  </div>
                )
              })
            )}
          </div>
        )}
        {!reviewing && !aiReview && !reviewError && (
          <EmptyNote>아직 검토를 실행하지 않았습니다. 오른쪽 버튼으로 AI 검토를 시작하세요.</EmptyNote>
        )}
      </AdminPanel>

      <AdminPanel
        title={`주간 근무 시간표 (배정안 ${String.fromCharCode(65 + planIndex)})`}
        right={weeks.length > 1 ? (
          <div style={{ display: 'flex', gap: 6 }}>
            {weeks.map(w => (
              <button key={w.index} onClick={() => onWeek(w.index)} style={weekTabStyle(w.index === week.index)}>
                {w.index + 1}주차
              </button>
            ))}
          </div>
        ) : null}
      >
        {grid === null ? (
          <EmptyNote>이 주에는 배정된 근무가 없습니다.</EmptyNote>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)', lineHeight: 1.6 }}>
              {isoToDots(week.start)} ~ {isoToDots(week.end)} · 배정 {grid.assignedCount}건
              {grid.shortageCount > 0 && <> · <span style={{ color: 'var(--warning)', fontWeight: 700 }}>미충원 {grid.shortageCount}칸</span></>}
              {' '}— {dayBlocks ? '부서가 설정한 근무 슬롯(블록) 단위로 묶여 있고, ' : ''}배정된 칸에는 학생 이름이 전부, 최소 인원을 못 채운 칸에는 <span style={{ color: 'var(--warning)', fontWeight: 700 }}>미충원</span>이 표시됩니다.
            </p>
            <TimeGrid
              rows={grid.rows} classSlots={grid.filledSlots}
              slotLabels={grid.slotLabels} slotColors={grid.slotColors} legend={false}
              dayBlocks={dayBlocks ?? undefined}
            />
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 13, height: 13, background: 'var(--sogang-red)', borderRadius: 3 }} /> 학생 배정됨
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 13, height: 13, background: 'var(--warning)', borderRadius: 3 }} /> 미충원
              </span>
            </div>
          </>
        )}
      </AdminPanel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <AdminPanel title="개인별 근무 시간 집계">
          {(plan.per_student ?? []).length === 0 ? (
            <EmptyNote>집계할 학생이 없습니다.</EmptyNote>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--saint-tan)' }}>{th('학생')}{th('구분', 'center', 70)}{th('총 시간', 'center', 80)}{th('주별')}</tr></thead>
              <tbody>
                {plan.per_student.map(s => (
                  <tr key={s.student_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '9px 12px', fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-strong)' }}>{s.student_name}</td>
                    <td style={{ padding: '9px 12px', fontSize: 'var(--fs-sm)', textAlign: 'center', color: 'var(--text-muted)' }}>{s.funding_type === 'gukga' ? '국가' : '교비'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 'var(--fs-body)', textAlign: 'center', fontWeight: 700, color: s.total_hours > 0 ? 'var(--text-strong)' : 'var(--text-subtle)' }}>{s.total_hours}h</td>
                    <td style={{ padding: '9px 12px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                      {/* "2026-W35" → "35주차" — ISO 주 표기를 사람이 읽는 형태로 */}
                      {Object.entries(s.weekly_hours ?? {}).map(([w, h]) => `${Number(w.split('-W')[1])}주차 ${h}h`).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminPanel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AdminPanel title="Soft Constraint 희생량" right={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>낮을수록 좋음</span>}>
            {Object.keys(plan.penalty_summary ?? {}).length === 0 ? (
              <EmptyNote>페널티 없이 배정되었습니다.</EmptyNote>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(plan.penalty_summary).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-body)' }}>
                    <span style={{ color: 'var(--text-body)' }}>{PENALTY_LABELS[k] ?? k}</span>
                    <b style={{ color: 'var(--text-strong)' }}>{v}</b>
                  </div>
                ))}
              </div>
            )}
          </AdminPanel>

          <AdminPanel title={`최소 인원 미달 슬롯 (${(plan.shortages ?? []).length}건)`}>
            {(plan.shortages ?? []).length === 0 ? (
              <EmptyNote>미달 슬롯이 없습니다.</EmptyNote>
            ) : (
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'var(--saint-tan)' }}>{th('날짜')}{th('시간', 'center', 110)}{th('배정', 'center', 66)}{th('가능 후보')}</tr></thead>
                  <tbody>
                    {plan.shortages.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '9px 12px', fontSize: 'var(--fs-body)', whiteSpace: 'nowrap' }}>{isoToDots(s.date)} ({s.day_of_week})</td>
                        <td style={{ padding: '9px 12px', fontSize: 'var(--fs-body)', textAlign: 'center', whiteSpace: 'nowrap' }}>{hhmm(s.start_time)}–{hhmm(s.end_time)}</td>
                        <td style={{ padding: '9px 12px', fontSize: 'var(--fs-body)', textAlign: 'center', color: 'var(--warning)', fontWeight: 700 }}>{s.assigned}/{s.required}</td>
                        <td style={{ padding: '9px 12px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                          {(s.candidates ?? []).length === 0
                            ? <span style={{ color: 'var(--sogang-red)' }}>가능자 없음 (추가 수합 필요)</span>
                            : s.candidates.map(c => c.student_name).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        </div>
      </div>
    </div>
  )
}

// ---- 4단계: 최종 확정 ----

function ConfirmStage({ plan, draft, planIndex, hiredCount, confirming, error, confirmed, saved, onConfirm, onBack, onRestart }) {
  // 한 학기 고정 시간표 옵션 — 이 배정안의 주간 패턴을 학기 종료일까지 반복 적용해 확정
  // 생성 시 '한 학기 고정'을 골랐으면 확정 단계에서 미리 켜 두고,
  // 학사 캘린더가 준 학기 종료일을 기본값으로 채운다 (없으면 15주 근사치)
  const [repeatSemester, setRepeatSemester] = useState(draft?.requested?.semesterFixed ?? false)
  const [semesterEndDots, setSemesterEndDots] = useState(() =>
    draft?.requested?.semesterFixed
      ? isoToDots(draft.requested.semesterEnd ?? addDaysIso(draft.requested.startDate, 7 * 15 - 1))
      : '',
  )

  if (!plan) {
    return <AdminPanel><EmptyNote>확정할 배정안이 없습니다. 이전 단계에서 근무표를 생성해 주세요.</EmptyNote></AdminPanel>
  }

  if (confirmed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AdminPanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><CalendarCheck size={32} color="var(--success)" /></span>
            <h2 style={{ margin: '0 0 8px', fontSize: 'var(--fs-h2)', fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표가 확정되었습니다</h2>
            <p style={{ margin: '0 0 20px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              배정안 {String.fromCharCode(65 + planIndex)} · {confirmed.confirmed_count}건 저장 · 배치 #{confirmed.batch_id}<br />
              {isoToDots(draft.requested.startDate)} ~ {isoToDots(confirmed.period_end ?? draft.requested.endDate)} 기간의 확정 근무표로 학생 화면에 노출됩니다.
            </p>
            {(confirmed.adjusted_dates?.length ?? 0) > 0 && (
              <div style={{ maxWidth: 560, marginBottom: 20, padding: '12px 16px', background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--info)', textAlign: 'left', lineHeight: 1.7 }}>
                <b>공휴일·폐관으로 {confirmed.adjusted_dates.length}개 날짜가 자동 조정되었습니다.</b><br />
                {confirmed.adjusted_dates.map(a => `${isoToDots(a.date)} (${a.reason})`).join(' · ')}
              </div>
            )}
            <Button variant="secondary" onClick={onRestart}><CalendarDays size={14} /> 다른 기간 근무표 생성</Button>
          </div>
        </AdminPanel>

        <AdminPanel title="저장된 확정 근무표" right={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{saved ? `${saved.length}건` : '조회 중'}</span>}>
          {saved === null ? <EmptyNote>저장된 근무표를 불러오는 중...</EmptyNote> : <SavedByDate rows={saved} />}
        </AdminPanel>
      </div>
    )
  }

  const m = planMetrics(plan)

  // 학기 반복 미리보기 — 기간을 7일 배수로 올려 요일을 유지한 채 몇 회 반복되는지 계산
  const semesterEndIso = dotsToIso(semesterEndDots)
  const semesterEndValid = /^\d{4}-\d{2}-\d{2}$/.test(semesterEndIso) && semesterEndIso > draft.requested.endDate
  const periodDays = Math.round((new Date(draft.requested.endDate) - new Date(draft.requested.startDate)) / 86400000) + 1
  const stride = Math.ceil(periodDays / 7) * 7
  const repeatCount = semesterEndValid
    ? Math.floor(Math.round((new Date(semesterEndIso) - new Date(draft.requested.startDate)) / 86400000) / stride) + 1
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AdminPanel>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
          <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><CalendarCheck size={32} color="var(--success)" /></span>
          <h2 style={{ margin: '0 0 8px', fontSize: 'var(--fs-h2)', fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표를 확정하시겠습니까?</h2>
          <p style={{ margin: '0 0 20px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 560 }}>
            배정안 {String.fromCharCode(65 + planIndex)} · 배정 {m.assigned}건 · 미충원 {m.shortage}칸 · 배정 편차 {m.balanceGap}시간 · 선발 학생 {hiredCount}명<br />
            {repeatSemester && semesterEndValid
              ? <>{isoToDots(draft.requested.startDate)} ~ {isoToDots(semesterEndIso)} <b style={{ color: 'var(--text-body)' }}>한 학기 고정 시간표</b>로 저장되며, 확정 후 학생 화면에서 조회됩니다.</>
              : <>{isoToDots(draft.requested.startDate)} ~ {isoToDots(draft.requested.endDate)} 기간으로 저장되며, 확정 후 학생 화면에서 조회됩니다.</>}
            {' '}같은 기간을 이미 확정했다면 이전 확정본은 대체됩니다.
          </p>

          <div style={{ width: '100%', maxWidth: 560, marginBottom: 20, padding: '14px 18px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-25)', textAlign: 'left' }}>
            <Checkbox
              checked={repeatSemester}
              onChange={() => {
                setRepeatSemester(v => !v)
                // 처음 켤 때 기본값: 학사 캘린더의 학기 종료일 (없으면 15주 근사치)
                if (!repeatSemester && !semesterEndDots) {
                  setSemesterEndDots(isoToDots(
                    draft.requested.semesterEnd ?? addDaysIso(draft.requested.startDate, 7 * 15 - 1),
                  ))
                }
              }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
              label={
                <span>
                  <span style={{ display: 'block', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>한 학기 고정 시간표로 확정</span>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>이 배정안의 주간 패턴을 학기 종료일까지 매주 반복 적용해 저장합니다. 공휴일 단축·폐관일에 걸친 배정은 그날 개관 시간에 맞춰 자동 조정됩니다.</span>
                </span>
              }
            />
            {repeatSemester && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingLeft: 27, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-body)' }}>학기 종료일</span>
                <div style={{ width: 140 }}>
                  <DatePicker value={semesterEndDots} onChange={setSemesterEndDots} placeholder="YYYY.MM.DD" />
                </div>
                <span style={{ fontSize: 'var(--fs-sm)', color: semesterEndValid ? 'var(--text-subtle)' : 'var(--warning)' }}>
                  {semesterEndValid
                    ? `${periodDays <= 7 ? '1주' : `${stride / 7}주`} 패턴 × ${repeatCount}회 반복 · 약 ${m.assigned * repeatCount}건 저장`
                    : '생성 기간 종료일 이후 날짜를 입력해 주세요'}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onBack} disabled={confirming}>다시 검토</Button>
            <Button
              onClick={() => onConfirm(repeatSemester && semesterEndValid ? { semesterEnd: semesterEndIso } : {})}
              disabled={confirming || (repeatSemester && !semesterEndValid)}
            >
              <Check size={14} /> {confirming ? '확정 중...' : repeatSemester ? '한 학기 시간표 확정' : '시간표 확정'}
            </Button>
          </div>
        </div>
      </AdminPanel>
      {error && <ErrorNote message={error} />}
    </div>
  )
}

// 확정 저장분(날짜 단위 — REQ-SCHED-010)을 날짜별로 묶어 보여준다
function SavedByDate({ rows }) {
  const byDate = useMemo(() => {
    const map = new Map()
    rows.forEach(r => {
      if (!map.has(r.date)) map.set(r.date, [])
      map.get(r.date).push(r)
    })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  if (byDate.length === 0) return <EmptyNote>저장된 근무가 없습니다.</EmptyNote>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
      {byDate.map(([date, list]) => (
        <div key={date} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>
              {isoToDots(date)} <span style={{ color: 'var(--text-subtle)', fontWeight: 600 }}>({list[0].day_of_week})</span>
            </span>
            <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{list.length}건</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {list.slice().sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))).map(r => (
              <div key={r.schedule_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)' }}>
                <span style={{ minWidth: 84, color: 'var(--text-body)', fontVariantNumeric: 'tabular-nums' }}>{hhmm(r.start_time)}–{hhmm(r.end_time)}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{r.student_name ?? r.student_id}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- 공용 조각 ----

function Stepper({ stage }) {
  return (
    <div style={{ display: 'flex', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 26px', marginBottom: 18 }}>
      {STEPS.map((s, i) => {
        const done = i < stage, active = i === stage
        return (
          <div key={s} style={{ flex: i < 3 ? 1 : '0 0 auto', display: 'flex', alignItems: 'center' }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%',
              background: done ? 'var(--success)' : (active ? 'var(--sogang-red)' : 'var(--surface-card)'),
              border: `2px solid ${done ? 'var(--success)' : (active ? 'var(--sogang-red)' : 'var(--border-default)')}`,
              color: 'var(--text-on-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-sm)', fontWeight: 700, flexShrink: 0,
            }}>
              {done ? <Check size={13} strokeWidth={3} /> : (i + 1)}
            </span>
            <span style={{ marginLeft: 10, fontSize: 'var(--fs-body)', fontWeight: active ? 700 : 500, color: (done || active) ? 'var(--text-strong)' : 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{s}</span>
            {i < 3 && <span style={{ flex: 1, height: 2, background: done ? 'var(--success)' : 'var(--border-subtle)', margin: '0 16px' }} />}
          </div>
        )
      })}
    </div>
  )
}


function Metric({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 800, color: tone }}>{value}</div>
    </div>
  )
}

function FieldLabel({ children, required }) {
  return (
    <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-body)', fontWeight: 600, marginBottom: 6 }}>
      {children} {required && <span style={{ color: 'var(--sogang-red)' }}>*</span>}
    </div>
  )
}

function EmptyNote({ children }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>{children}</div>
}

function ErrorNote({ message }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--sogang-red)' }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  )
}

function th(t, align, width) {
  return <th style={{ padding: '9px 12px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>
}

const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const weekArrowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, background: 'none', border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer', flexShrink: 0 }
const weekTabStyle = on => ({
  height: 28, padding: '0 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', fontWeight: 700,
  border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
  background: on ? 'var(--sogang-red-50)' : 'var(--surface-card)', color: on ? 'var(--sogang-red)' : 'var(--text-body)',
})

// ---- 확정 근무표 (#71 화면명세 이식) ----
// 확정된 주간 근무 시간표 하나만 보여준다. 주 이동은 헤더의 화살표(±7일)가 맡고,
// 몇 달 전처럼 멀리 이동할 때만 달력 아이콘을 눌러 월 달력 팝업을 띄운다.
// 승인된 대타가 반영된 칸은 금색으로 구분해 클릭하면 "누가 → 누구로" 바뀌었는지 상세를 보여준다.

const SUB_GOLD = 'var(--warning)'

const todayIsoDate = () => {
  const t = new Date()
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`
}

function ConfirmedScheduleSection({ departmentId, policy }) {
  const [rows, setRows] = useState(null) // null = 로딩 중
  const [subs, setSubs] = useState([]) // 승인된 대타 요청
  const [weekStart, setWeekStart] = useState(() => mondayOfIso(todayIsoDate()))
  const [detail, setDetail] = useState(null) // 금색 칸 클릭 → 대타 상세 목록

  useEffect(() => {
    if (!departmentId) return
    let alive = true
    fetchDepartmentSchedule(departmentId)
      .then(data => {
        if (!alive) return
        setRows(data)
        // 이번 주에 확정 근무가 없으면 배정이 있는 가장 가까운 주를 보여준다
        const thisMonday = mondayOfIso(todayIsoDate())
        if (data.length > 0 && !data.some(r => mondayOfIso(r.date) === thisMonday)) {
          const upcoming = data.find(r => r.date.slice(0, 10) >= thisMonday) ?? data[data.length - 1]
          setWeekStart(mondayOfIso(upcoming.date))
        }
      })
      .catch(() => { if (alive) setRows([]) })
    fetchDepartmentSubstituteRequests(departmentId)
      .then(list => { if (alive) setSubs(list.filter(r => r.status === '승인')) })
      .catch(() => {})
    return () => { alive = false }
  }, [departmentId])

  const weekEnd = addDaysIso(weekStart, 6)
  const subBySchedule = useMemo(() => new Map(subs.map(s => [s.schedule_id, s])), [subs])

  const grid = useMemo(() => {
    const weekRows = (rows ?? []).filter(r => {
      const d = r.date.slice(0, 10)
      return d >= weekStart && d <= weekEnd
    })
    if (weekRows.length === 0) return null

    const bounds = weekRows.flatMap(r => [toMin(r.start_time), toMin(r.end_time)])
    const from = Math.floor(Math.min(...bounds) / 30) * 30
    const to = Math.ceil(Math.max(...bounds) / 30) * 30
    const timeRows = []
    for (let m = from; m < to; m += 30) timeRows.push(minToHhmm(m))

    const byCell = new Map() // "월-09:00" → { names: [], subs: [] }
    weekRows.forEach(r => {
      const sub = subBySchedule.get(r.schedule_id)
      for (let m = toMin(r.start_time); m < toMin(r.end_time); m += 30) {
        const key = `${r.day_of_week}-${minToHhmm(m)}`
        if (!byCell.has(key)) byCell.set(key, { names: [], subs: [] })
        const cell = byCell.get(key)
        cell.names.push(r.student_name ?? r.student_id)
        if (sub) cell.subs.push(sub)
      }
    })

    const filledSlots = [], slotLabels = {}, slotColors = {}
    const subCells = new Map()
    byCell.forEach((v, key) => {
      filledSlots.push(key)
      if (v.subs.length > 0) {
        const s = v.subs[0]
        slotLabels[key] = `${s.requester_name ?? s.requester_id}→${s.substitute_name ?? s.substitute_id}`
        slotColors[key] = SUB_GOLD
        subCells.set(key, v.subs)
      } else {
        // 블록 병합 칸에서 이름이 전부 보이도록 축약("외 N") 없이 그대로 담는다
        slotLabels[key] = v.names.join(' · ')
        slotColors[key] = 'var(--sogang-red)'
      }
    })
    return { timeRows, filledSlots, slotLabels, slotColors, subCells, count: weekRows.length }
  }, [rows, weekStart, weekEnd, subBySchedule])

  // 확정 근무표가 아예 없으면 섹션 자체를 숨긴다 — 진입 화면이 생성 플로우에 집중하도록
  if (rows === null || rows.length === 0) return null

  const thisMonday = mondayOfIso(todayIsoDate())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 18 }}>
      <AdminPanel
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, -7))} style={weekArrowStyle}><ChevronLeft size={16} color="var(--text-muted)" /></button>
            <span>확정된 주간 근무 시간표 · {isoToDots(weekStart)} ~ {isoToDots(weekEnd)}</span>
            <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, 7))} style={weekArrowStyle}><ChevronRight size={16} color="var(--text-muted)" /></button>
          </span>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {weekStart !== thisMonday && (
              <Button variant="secondary" size="sm" onClick={() => setWeekStart(thisMonday)}>이번 주로</Button>
            )}
            <WeekCalendarButton
              subDates={subs.map(s => s.date.slice(0, 10))}
              weekStart={weekStart} onSelectWeek={setWeekStart}
            />
          </div>
        }
      >
        {grid === null ? (
          <EmptyNote>이 주에는 확정된 근무가 없습니다. 화살표나 달력 아이콘으로 다른 주를 선택해 보세요.</EmptyNote>
        ) : (
          <>
            <TimeGrid
              rows={grid.timeRows} classSlots={grid.filledSlots}
              slotLabels={grid.slotLabels} slotColors={grid.slotColors} legend={false}
              clickableSlots={[...grid.subCells.keys()]}
              onSlotClick={key => setDetail(grid.subCells.get(key) ?? null)}
              dayBlocks={blocksByDayLabel(policy) ?? undefined}
            />
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 13, height: 13, background: 'var(--sogang-red)', borderRadius: 3 }} /> 학생 배정됨
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 13, height: 13, background: SUB_GOLD, borderRadius: 3 }} /> 대타로 근무자 변경됨 (클릭하면 상세 확인)
              </span>
            </div>
          </>
        )}
      </AdminPanel>

      {detail && <SubstituteDetailModal subs={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

