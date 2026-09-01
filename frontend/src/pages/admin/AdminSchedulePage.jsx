import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X,
  CalendarCheck, CalendarDays, Sparkles, Settings2,
} from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Checkbox from '../../components/ui/Checkbox'
import Button from '../../components/ui/Button'
import DatePicker from '../../components/ui/DatePicker'
import Select from '../../components/ui/Select'
import TimeGrid from '../../components/ui/TimeGrid'
import { mondayOfIso } from '../../components/ui/MonthCalendar'
import WeekCalendarButton from '../../components/ui/WeekCalendarButton'
import SubstituteDetailModal from '../../components/ui/SubstituteDetailModal'
import Tabs from '../../components/ui/Tabs'
import { AdminPanel, AdminStatCard } from '../../components/admin/AdminPanel'
import ClarificationRequests from '../../components/admin/ClarificationRequests'
import { AiFinding, AiUnavailableNote } from '../../components/admin/aiFindings'
import DepartmentAvailability from '../../components/admin/DepartmentAvailability'
import StudentWorkTimetable, { WORK_FILL } from '../../components/admin/StudentWorkTimetable'
import { EmptyNote, ErrorNote, weekArrowStyle, weekTabStyle } from '../../components/admin/scheduleBits'
import { PENALTY_LABELS, ADJUSTABLE, SCALE_LEVELS } from '../../components/admin/DepartmentPolicyEditor'
import ScheduleChatPanel from '../../components/admin/ScheduleChatPanel'
import { getSessionUser } from '../../utils/session'
import { blocksByDayLabel, closedSlotKeys, periodByDayOfWeek } from '../../utils/workSlots'
import { termKeyForDate } from '../../utils/terms'
import {
  DAY_COLS, DAY_LABELS, addDaysIso, buildRoster, dateAvailabilityToSlotKeys,
  dayLabelOfIso, fmtHours, gridRowsFromPolicy,
  hhmm, hoursBetween, isoToDate, isoToDots, minToHhmm, pad2, subtractSpan, toMin, todayIsoDate,
  weekDayDates, weekDaySubLabels, weekScheduleSlotKeys,
} from '../../utils/scheduleGrid'
import {
  fetchPostings,
  fetchDepartmentStudents,
  fetchDepartmentAvailability,
  fetchAvailabilityDates,
  fetchDepartmentClassTimeDates,
  fetchTerms,
  fetchDepartmentClassTime,
  fetchDepartmentPolicy,
  generateSchedule,
  reviewSchedule,
  fetchDraftSchedule,
  confirmSchedule,
  editDraftSchedules,
  fetchDepartmentSchedule,
  fetchDepartmentSubstituteRequests,
} from '../../api/client'

// 생성 흐름은 담당자가 실제로 하는 일만 남긴다 (#154).
// 단계(stepper)는 두지 않는다 — '생성 시작'을 누르면 바로 근무표 검토 화면이고,
// 확정은 그 화면 위 모달로 끝낸다. 수합 확인은 진입 화면의 '수합된 근무 시간표' 탭이,
// 부서 정책은 '부서 설정'이 담당한다.

// 진입 화면 탭 — 생성 전에 확인하는 두 시간표
const ENTRY_TABS = [
  { id: 'confirmed', label: '확정 근무 시간표' },
  { id: 'availability', label: '수합된 근무 시간표' },
]

const dotsToIso = dots => (dots ? dots.replaceAll('.', '-') : '')
const isMondayIso = iso => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return true
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 1
}
function nextMondayIso() {
  const today = new Date()
  const shift = (8 - today.getDay()) % 7 || 7
  const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + shift)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

export default function AdminSchedulePage() {
  const user = getSessionUser()
  // 학생팀장은 근무표를 짜고 그 기준(부서 설정)도 잡는다 — 지원서 연동만 직원
  // 권한이라 버튼을 감춘다 (#156).
  const isTeamLead = Boolean(user) && user.role !== 'staff' && user.is_team_lead
  const departmentId = user?.department_id
  const navigate = useNavigate()

  // 검토 화면에 들어와 있는지 — 단계 번호는 없다 (생성 시작 → 검토 → 확정 모달)
  const [started, setStarted] = useState(false)
  // 진입 화면에서 보고 있는 시간표 — 확정본 / 수합본
  const [entryTab, setEntryTab] = useState('confirmed')

  // 부서 공고 · 합격자 · 가능시간 수합
  const [deptData, setDeptData] = useState(null) // { postings, roster }
  const [loadError, setLoadError] = useState('')
  // 부서 개관 시간대 — 시간표 그리드의 세로 범위 기준 (학생 제출 시간이 아니라 부서 운영 시간)
  const [policy, setPolicy] = useState(null)
  // 수합은 학기마다 다르다 — 기본값은 생성 기간이 속한 학기이고, 담당자가 직접 바꿀 수도 있다
  const [terms, setTerms] = useState([])
  const [rosterTerm, setRosterTerm] = useState(null)
  const [rosterTermPinned, setRosterTermPinned] = useState(false)

  // 풀이 시간 제한은 화면에서 받지 않는다 — 담당자가 판단할 값이 아니고,
  // 서버 기본값(30초)으로 충분하다.
  const [form, setForm] = useState(() => ({
    startDate: isoToDots(nextMondayIso()), numDays: 14,
    // 한 학기 고정: 2주 대표 패턴을 생성해 학기 종료일까지 주 단위 반복 확정한다.
    // 생성 시 국가근로 주간 상한이 조여져(월 46h 보장) 반복해도 규정을 지킨다.
    semesterFixed: false,
  }))
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  const [draft, setDraft] = useState(null)
  const [weekIndex, setWeekIndex] = useState(0)

  // 챗봇이 초안을 고친 시각 — 표가 갱신됐음을 담당자에게 알린다 (#137)
  const [chatEditedAt, setChatEditedAt] = useState(null)
  const [chatSyncError, setChatSyncError] = useState('')

  // AI 검토 (REQ-SCHED-016) — draft 배치 기준이라 생성마다 초기화한다
  const [aiReview, setAiReview] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [confirmed, setConfirmed] = useState(null)

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
      const postings = list.map(p => ({
        id: p.posting_id,
        title: p.title,
        status: p.status,
        headcount: p.headcount ?? 0,
      }))
      // 부서 근로 학생 명단. 지원자 API(공고별 합격자)를 쓰면 자소서 본문까지 딸려 오는데
      // 이 화면은 이름만 필요하고, 학생팀장에게 동료 자소서를 열어줄 수도 없다 (#156).
      // 판정 기준은 같다 — 둘 다 '부서 공고에 합격'이 부서 소속이다
      const deptStudents = await fetchDepartmentStudents(departmentId).catch(() => [])

      const availability = await fetchDepartmentAvailability(departmentId, rosterTerm ?? undefined)
      // 학생별 수업 시간 (REQ-SCHED-015) — SAINT 연동 전까지 학생이 직접 입력한 값
      const classTime = await fetchDepartmentClassTime(departmentId, rosterTerm ?? undefined).catch(() => [])
      // 로스터 구성은 수합 화면과 같은 함수를 쓴다 — '확보/미확보' 판정이 두 화면에서 갈리면 안 된다
      const { roster } = buildRoster(deptStudents, availability, classTime)

      setDeptData({ postings, roster })
    } catch (e) {
      setLoadError(e.message)
      setDeptData({ postings: [], roster: [] })
    }
  }, [departmentId, rosterTerm])

  useEffect(() => {
    let alive = true
    fetchTerms()
      .then(res => { if (alive) setTerms(res.terms ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // 생성 기간을 바꾸면 수합도 그 학기 것으로 따라간다 (직접 고른 뒤에는 그대로 둔다)
  useEffect(() => {
    if (rosterTermPinned || terms.length === 0) return
    const iso = dotsToIso(form.startDate)
    if (!iso) return
    const [y, m, d] = iso.split('-').map(Number)
    const key = termKeyForDate(terms, new Date(y, m - 1, d), null)
    if (key) setRosterTerm(key)
  }, [terms, form.startDate, rosterTermPinned])

  useEffect(() => { load() }, [load])

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
        semester_pattern: form.semesterFixed,
      })
      // 동률 대안은 화면에서 다루지 않는다 — 초안 하나를 챗봇으로 다듬는 흐름이다
      const { alternatives: _ignored, ...plan } = res
      setDraft({
        requested: {
          startDate: startDateIso, endDate: endDateIso, numDays: Number(form.numDays),
          semesterFixed: form.semesterFixed,
          // 학사 캘린더 기준 학기 종료일 — 확정 단계의 반복 종료일 기본값
          semesterEnd: plan.semester_end ?? null,
        },
        plan,
      })
      setWeekIndex(0)
      setConfirmed(null)
      setConfirmOpen(false)
      setConfirmError('')
      setAiReview(null)
      setReviewError('')
      setChatEditedAt(null)
      setChatSyncError('')
      // 생성 응답에는 배정 id가 없다(솔버 결과 그대로). 화면에서 배정을 지우려면
      // id가 필요하므로 저장된 초안을 한 번 다시 읽어 채운다.
      const saved = await fetchDraftSchedule({
        department_id: departmentId, period_start: startDateIso, period_end: endDateIso,
      }).catch(() => null)
      if (saved) {
        setDraft(prev => (prev ? { ...prev, plan: { ...prev.plan, schedules: saved.schedules } } : prev))
      }
    } catch (e) {
      if (e.status === 409) {
        setGenerateError(`${e.message} 진입 화면의 '수합된 근무 시간표' 탭에서 미제출자를 먼저 확인해 주세요.`)
      } else if (e.status === 504) {
        setGenerateError(`${e.message} (기간을 줄여 보세요)`)
      } else {
        setGenerateError(e.message)
      }
    } finally {
      setGenerating(false)
    }
  }

  // 진입 화면의 시작 버튼 — 조건은 이미 위 바에서 받았으니 들어가면서 바로 생성한다.
  // 날짜가 형식에 안 맞으면 화면을 옮기지 않고 그 자리에서 알려준다.
  const handleStartGenerate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateIso)) {
      setGenerateError('시작일을 YYYY.MM.DD 형식으로 입력해 주세요.')
      return
    }
    setStarted(true)
    handleGenerate()
  }

  const selectedPlan = draft?.plan ?? null

  // 챗봇이 draft를 고친 뒤 화면을 서버 상태로 맞춘다 (#137).
  // 이게 없으면 화면은 generate 응답을 그대로 들고 있어, 챗봇 변경이 빠진
  // 옛 배정으로 확정된다.
  const reloadDraftFromServer = useCallback(async () => {
    if (!draft) return
    try {
      const fresh = await fetchDraftSchedule({
        department_id: departmentId,
        period_start: draft.requested.startDate,
        period_end: draft.requested.endDate,
      })
      setDraft(prev => {
        if (!prev) return prev
        const base = prev.plan
        return {
          ...prev,
          plan: {
            ...base,
            batch_id: fresh.batch_id,
            schedules: fresh.schedules,
            shortages: fresh.shortages ?? base.shortages,
            per_student: fresh.per_student ?? base.per_student,
            penalty_summary: fresh.penalty_summary ?? base.penalty_summary,
            status: fresh.status ?? base.status,
            solve_time_seconds: fresh.solve_time_seconds ?? base.solve_time_seconds,
          },
        }
      })
      // 배정이 바뀌었으므로 이전 AI 검토 결과는 더 이상 이 초안의 것이 아니다
      setAiReview(null)
      setChatEditedAt(Date.now())
    } catch (e) {
      setChatSyncError(
        e.status === 404
          ? '초안을 다시 불러오지 못했습니다. 근무표를 다시 생성해 주세요.'
          : `초안을 다시 불러오지 못했습니다: ${e.message}`,
      )
    }
  }, [draft, departmentId])

  // AI 검토 — 검토 대상은 generate가 저장한 draft 배치다.
  // 규칙 미등록·AI 실패도 200으로 오므로(review_available=false) 여기서 throw되지 않는다.
  const handleReview = async () => {
    const batchId = draft?.plan?.batch_id
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
    } catch (e) {
      setConfirmError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  const roster = deptData?.roster ?? []

  // ---- 진입 화면: 확정·수합 시간표 탭 + 근무표 생성 시작 ----
  if (!started) {
    return (
      <AdminShell activeMenu="schedule">
        <PageTitle>근무표 편성</PageTitle>
        <p style={{ margin: '0 0 20px 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          근무표는 <b style={{ color: 'var(--text-body)' }}>부서 단위</b>로 생성되며,
          개관 시간·근무 슬롯·배정 인원 등 생성 기준은 <b style={{ color: 'var(--text-body)' }}>부서 설정</b>에서 미리 정해둡니다.
          {' '}
          <button type="button" onClick={() => navigate('/admin/settings')} style={linkBtnStyle}>
            <Settings2 size={13} /> 부서 설정 열기
          </button>
        </p>

        {loadError && <ErrorNote message={loadError} />}

        {/* 생성 조건을 여기서 다 정하고 누르면 바로 생성이 시작된다 (#154) —
            들어가서 다시 폼을 채우게 하지 않는다. 조건은 생성 단계에서 다시 생성할 때 고칠 수 있다. */}
        <div style={{ marginBottom: 18, padding: '16px 22px', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <GenerateConditionFields
              form={form}
              onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
              onChangePeriod={v => setForm(f => v === 'semester'
                ? { ...f, numDays: 14, semesterFixed: true }
                : { ...f, numDays: Number(v), semesterFixed: false })}
            />
            <Button disabled={deptData === null || generating} onClick={handleStartGenerate}>
              <CalendarDays size={14} /> {generating ? '생성 중...' : '부서 근무표 생성 시작'}
            </Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
            <span>{endDateIso && `${isoToDots(startDateIso)} ~ ${isoToDots(endDateIso)}${form.semesterFixed ? ' 패턴을 학기 종료일까지 반복' : ''}`}</span>
            {startDateIso && !isMondayIso(startDateIso) && (
              <span style={{ color: 'var(--warning)' }}>월요일 시작을 권장합니다 (주간 상한이 월~일 기준입니다).</span>
            )}
          </div>
          {generateError && <div style={{ marginTop: 12 }}><ErrorNote message={generateError} /></div>}
        </div>

        {/* 생성에 들어가지 않고도 확정본과 수합본을 같은 자리에서 번갈아 본다 (#154) */}
        <Tabs
          tabs={ENTRY_TABS}
          active={entryTab}
          onChange={setEntryTab}
          style={{ marginBottom: 18 }}
        />

        {entryTab === 'confirmed' ? (
          <ConfirmedScheduleSection departmentId={departmentId} policy={policy} />
        ) : (
          <DepartmentAvailability
            departmentId={departmentId}
            departmentName={user?.department_name}
            term={rosterTerm}
            onChangeTerm={key => { setRosterTerm(key); setRosterTermPinned(true) }}
            onOpenSettings={() => navigate('/admin/settings')}
          />
        )}
      </AdminShell>
    )
  }

  const canConfirm = Boolean(selectedPlan) && !confirmed && !generating

  // 검토를 접고 진입 화면(확정·수합 시간표)으로 돌아간다
  const leaveToEntry = () => {
    setStarted(false)
    setConfirmOpen(false)
    setGenerateError('')
  }

  return (
    <AdminShell activeMenu="schedule">
      {/* 제목은 진입 화면과 같은 폭이어야 한다 — flex 아이템 안에 넣으면 내용 폭으로
          줄어들어 화면을 옮길 때마다 테두리 상자 크기가 달라 보인다.
          돌아가는 곳은 공고가 아니라 확정·수합 시간표를 보는 진입 화면이다. */}
      <button onClick={leaveToEntry} style={{ ...backBtnStyle, marginBottom: 6 }}>
        <ChevronLeft size={15} /> 시간표 현황으로
      </button>
      <PageTitle>근무표 검토</PageTitle>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <p style={{ margin: '0 0 0 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
          {user?.department_name ?? '우리 부서'} — 부서 설정에 정해둔 기준으로 만든 초안입니다. 검토·조정한 뒤 확정하세요.
        </p>
        {/* 확정은 별도 단계가 아니라 이 화면에서 여는 모달이다 */}
        <div style={{ flexShrink: 0 }}>
          <Button size="sm" disabled={!canConfirm} onClick={() => { setConfirmError(''); setConfirmOpen(true) }}>
            <Check size={14} /> 시간표 확정
          </Button>
        </div>
      </div>

      {/* 생성 조건은 진입 화면에서 받았다 — 여기서는 결과가 마음에 안 들 때 기간만 고쳐 다시 돌린다 */}
      {!generating && (
        <RegenerateBar
          form={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
          startDateIso={startDateIso} endDateIso={endDateIso}
          error={generateError} onSubmit={handleGenerate}
        />
      )}

      {draft ? (
        <ReviewStage
          draft={draft}
          weekIndex={weekIndex} onWeek={setWeekIndex} policy={policy}
          aiReview={aiReview} reviewing={reviewing} reviewError={reviewError} onReview={handleReview}
          departmentId={departmentId}
          onScheduleChanged={reloadDraftFromServer}
          chatEditedAt={chatEditedAt} chatSyncError={chatSyncError}
        />
      ) : generating ? (
        <AdminPanel><EmptyNote>초안이 만들어지면 이 자리에 표시됩니다.</EmptyNote></AdminPanel>
      ) : (
        <AdminPanel><EmptyNote>생성된 근무표가 없습니다. 위에서 기간을 정해 다시 생성해 주세요.</EmptyNote></AdminPanel>
      )}

      {generating && (
        <GeneratingScheduleModal
          startDateIso={startDateIso} endDateIso={endDateIso}
          semesterFixed={form.semesterFixed}
        />
      )}

      {confirmOpen && draft && selectedPlan && (
        <ConfirmScheduleModal
          plan={selectedPlan} draft={draft} hiredCount={roster.filter(r => r.inHiredList).length}
          confirming={confirming} error={confirmError} confirmed={confirmed}
          onConfirm={handleConfirm}
          onClose={() => setConfirmOpen(false)}
          onViewConfirmed={() => { setEntryTab('confirmed'); leaveToEntry() }}
          onRestart={() => { setDraft(null); setConfirmed(null); leaveToEntry() }}
        />
      )}
    </AdminShell>
  )
}

// ---- 검토 화면 상단: 조건 바꿔 다시 생성 ----
// 생성만을 위한 단계 화면은 두지 않는다 — 조건은 진입 화면에서 받고, 결과가 마음에
// 안 들 때만 여기서 기간을 고쳐 다시 돌린다. 부서 설정·수합 시간표로 가는 버튼도
// 여기 두지 않는다 (누르면 다른 화면으로 튕겨 흐름이 끊긴다) — 진입 화면이 담당한다.

function RegenerateBar({ form, onChange, startDateIso, endDateIso, error, onSubmit }) {
  const notMonday = startDateIso && !isMondayIso(startDateIso)

  return (
    <div style={{ marginBottom: 18, padding: '14px 18px', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 200, fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
          <b style={{ color: 'var(--text-body)' }}>조건 바꿔 다시 생성</b> — 다시 생성하면 이전 초안은 대체됩니다.
        </span>
        <GenerateConditionFields
          form={form}
          onChange={onChange}
          onChangePeriod={v => {
            if (v === 'semester') { onChange('numDays', 14); onChange('semesterFixed', true) }
            else { onChange('numDays', Number(v)); onChange('semesterFixed', false) }
          }}
        />
        <Button size="sm" onClick={onSubmit}>
          <Sparkles size={14} /> 다시 생성
        </Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
        <span>{endDateIso && `${isoToDots(startDateIso)} ~ ${isoToDots(endDateIso)}${form.semesterFixed ? ' 패턴을 학기 종료일까지 반복' : ''}`}</span>
        {notMonday && (
          <span style={{ color: 'var(--warning)' }}>월요일 시작을 권장합니다 (주간 상한이 월~일 기준입니다).</span>
        )}
      </div>
      {error && <div style={{ marginTop: 12 }}><ErrorNote message={error} /></div>}
    </div>
  )
}

// 생성 조건 입력 묶음 — 진입 화면의 시작 바와 '조건 바꿔 다시 생성'이 같은 컨트롤을 쓴다.
// 풀이 시간 제한은 받지 않는다 (서버 기본값 30초).
function GenerateConditionFields({ form, onChange, onChangePeriod }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-body)' }}>시작일</span>
        <div style={{ width: 140 }}>
          <DatePicker value={form.startDate} onChange={v => onChange('startDate', v)} placeholder="YYYY.MM.DD" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-body)' }}>기간</span>
        <Select
          value={form.semesterFixed ? 'semester' : form.numDays}
          // 학기 고정은 2주 대표 패턴을 풀어 학기 종료일까지 반복 확정한다
          onChange={e => onChangePeriod(e.target.value)}
          style={{ width: 'auto', minWidth: 130 }}
        >
          <option value={7}>1주 (7일)</option>
          <option value={14}>2주 (14일) · 권장</option>
          <option value={21}>3주 (21일)</option>
          <option value={28}>4주 (28일)</option>
          <option value="semester">한 학기 고정 (2주 패턴 반복)</option>
        </Select>
      </div>
    </>
  )
}

// ---- 근무표 검토 ----

// 근무표 지표 — 디자인의 미충원·배정 편차·출근 횟수를 API 응답에서 파생한다.
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
// 그 주의 학생별 요일 근무 시간 — 시간표 바로 아래에 붙이는 집계표용.
// 전체 기간 총합(plan.per_student)과 달리 "이 주에 누가 무슨 요일에 몇 시간"을 본다.
// 시간표를 눈으로 세지 않고도 요일 쏠림·개인 편차를 바로 읽으라는 표다.
function weekStudentHours(plan, week) {
  const byStudent = new Map()
  plan.schedules
    .filter(x => x.date >= week.start && x.date <= week.end)
    .forEach(x => {
      if (!byStudent.has(x.student_id)) {
        byStudent.set(x.student_id, {
          studentId: x.student_id,
          name: x.student_name ?? x.student_id,
          byDay: Object.fromEntries(DAY_COLS.map(d => [d, 0])),
          total: 0,
        })
      }
      const row = byStudent.get(x.student_id)
      const hours = hoursBetween(x.start_time, x.end_time)
      const day = DAY_LABELS[x.day_of_week] ?? dayLabelOfIso(x.date)
      row.byDay[day] = (row.byDay[day] ?? 0) + hours
      row.total += hours
    })
  return [...byStudent.values()].sort((a, b) => b.total - a.total)
}

const EMPTY_VIOLATIONS = { slots: new Set(), messages: [] }

// 수동 편집 결과가 하드 제약을 깨는지 본다. 서버는 겹침과 주간 상한만 거부하므로
// (가능 시간·시간대 인원은 솔버 제약이라 API가 모른다) 화면이 먼저 잡아 준다.
// 미충원(최소 인원 미달)은 위반으로 보지 않는다 — 초안이 원래 허용하는 상태다.
function findViolations(schedules, week, { policy, periodByDay, availSet, availRows, perStudent }) {
  const inWeek = schedules.filter(x => x.date >= week.start && x.date <= week.end)
  const slots = new Set()
  const messages = []
  const fundingOf = Object.fromEntries((perStudent ?? []).map(s => [s.student_id, s.funding_type]))
  const nameOf = Object.fromEntries((perStudent ?? []).map(s => [s.student_id, s.student_name]))

  // 1) 학생이 낸 가능 시간 밖 — 가능 시간을 아직 못 받았으면 판단하지 않는다
  if (availRows) {
    inWeek.forEach(x => {
      for (let m = toMin(x.start_time); m + 30 <= toMin(x.end_time); m += 30) {
        if (availSet.has(`${x.student_id}|${x.date}|${minToHhmm(m)}`)) continue
        slots.add(`${x.day_of_week}-${minToHhmm(m)}`)
        const who = nameOf[x.student_id] ?? x.student_id
        const at = `${isoToDots(x.date).slice(5)} ${minToHhmm(m)}`
        if (!messages.some(msg => msg.startsWith(`${who} 가능`))) {
          messages.push(`${who} 가능 시간이 아닌 시간에 배정됨 (${at} 등)`)
        }
      }
    })
  }

  // 2) 주간 근로시간 상한 — 부서 운영 상한까지 반영된 서버 값을 그대로 쓴다
  const caps = policy?.weekly_hour_limits
  if (caps) {
    const gukgaCap = Math.min(
      ...DAY_COLS.map(d => (periodByDay?.[d] === 'vacation' ? caps.gukga_vacation : caps.gukga_semester)),
    )
    const byStudent = {}
    inWeek.forEach(x => {
      byStudent[x.student_id] = (byStudent[x.student_id] ?? 0) + hoursBetween(x.start_time, x.end_time)
    })
    Object.entries(byStudent).forEach(([sid, hours]) => {
      const cap = fundingOf[sid] === 'gukga' ? gukgaCap : caps.gyobi
      if (hours <= cap) return
      messages.push(`${nameOf[sid] ?? sid} 주 ${fmtHours(hours)}시간 — 상한 ${fmtHours(cap)}시간 초과`)
      inWeek.filter(x => x.student_id === sid).forEach(x => {
        for (let m = toMin(x.start_time); m + 30 <= toMin(x.end_time); m += 30) {
          slots.add(`${x.day_of_week}-${minToHhmm(m)}`)
        }
      })
    })
  }

  // 3) 시간대 최대 인원
  const maxPer = policy?.max_per_slot
  if (maxPer) {
    const count = {}
    inWeek.forEach(x => {
      for (let m = toMin(x.start_time); m + 30 <= toMin(x.end_time); m += 30) {
        const key = `${x.day_of_week}-${minToHhmm(m)}`
        count[key] = (count[key] ?? 0) + 1
      }
    })
    Object.entries(count).forEach(([key, n]) => {
      if (n <= maxPer) return
      slots.add(key)
      messages.push(`${key} 배정 ${n}명 — 시간대 최대 ${maxPer}명 초과`)
    })
  }

  return { slots, messages }
}

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

// 부서 설정 요약 패널의 짧은 사실 하나(라벨 + 값) — 통계 카드보단 가볍게, 표보단 간결하게.
// 라벨이 제목처럼 굵고, 값은 그 아래 내용이라 일반 굵기로 둔다 (반대로 두면 눈이 값부터 가서
// "무엇에 대한 값인지"를 뒤늦게 읽게 된다).
function SummaryFact({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-strong)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-body)', fontWeight: 400, lineHeight: 1.5 }}>{value}</div>
    </div>
  )
}

function ReviewStage({
  draft, weekIndex, onWeek, policy,
  aiReview, reviewing, reviewError, onReview,
  departmentId, onScheduleChanged, chatEditedAt, chatSyncError,
}) {
  const plan = draft.plan
  const weeks = useMemo(() => splitWeeks(draft), [draft])
  const week = weeks[Math.min(weekIndex, weeks.length - 1)]

  // ---- 수동 편집 (REQ-SCHED-018) ----
  // 화면에서 모아 두었다가 '편집 완료'에 한 번에 보낸다. 중간 상태는 잠깐 위반해도
  // 괜찮아야 하고(A를 빼고 B를 넣는 사이), 되돌리기도 로컬에서 끝난다.
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [picker, setPicker] = useState(null) // 클릭한 칸 { date, day, start, end }
  const [availRows, setAvailRows] = useState(null) // 그 주 날짜별 가능 시간
  // 시간표를 학생 한 명 기준으로 바꿔 보는 탭. null = 부서 전체 (기본).
  // 확정 근무표 화면과 같은 방식이다 — 초안에서도 "이 학생 시간표가 어떻게 나왔나"를
  // 부서 전체 표에서 이름을 찾아 훑지 않고 바로 본다.
  const [tabStudentId, setTabStudentId] = useState(null)
  const [classRows, setClassRows] = useState([]) // 그 주 날짜별 수업 시간 (학생 탭에서만 쓴다)
  // 부서 설정 화면을 왔다갔다 안 해도 되게, 확정된 부서 규칙을 이 화면에서 바로 접었다 폈다
  const [policyOpen, setPolicyOpen] = useState(false)

  // 가능 시간은 검토할 때도 필요하다 — '가능 시간 아닌 배정'은 편집을 시작하기 전에
  // 알아야 하는 위반이라, 편집 모드에서만 불러오면 초안이 멀쩡해 보인다 (#110).
  useEffect(() => {
    if (!week) return
    let alive = true
    fetchAvailabilityDates(departmentId, week.start, week.end)
      .then(r => { if (alive) setAvailRows(r) })
      .catch(() => { if (alive) setAvailRows([]) })
    return () => { alive = false }
  }, [departmentId, week?.start, week?.end])

  // 수업 시간은 학생 한 명을 골랐을 때만 그린다 — 부서 전체 표에는 올릴 자리가 없다
  useEffect(() => {
    if (!week || !tabStudentId) return
    let alive = true
    fetchDepartmentClassTimeDates(departmentId, week.start, week.end)
      .then(r => { if (alive) setClassRows(r) })
      .catch(() => { if (alive) setClassRows([]) })
    return () => { alive = false }
  }, [departmentId, tabStudentId, week?.start, week?.end])

  // 편집 중 화면에 보이는 배정 = 서버 초안 + 아직 안 보낸 편집
  const effective = useMemo(() => {
    if (pending.length === 0) return plan.schedules
    const removed = new Set(pending.filter(e => e.op === 'remove').map(e => e.schedule_id))
    return [
      ...plan.schedules.filter(x => !removed.has(x.schedule_id)),
      ...pending.filter(e => e.op === 'add').map(e => e.row),
    ]
  }, [plan.schedules, pending])

  const editPlan = useMemo(() => ({ ...plan, schedules: effective }), [plan, effective])
  const grid = useMemo(() => (week ? buildWeekGrid(editPlan, week) : null), [editPlan, week])
  const metrics = planMetrics(plan)
  // 그 주 날짜로 요일마다 학기/방학을 가린다 — 방학 주에 학기 블록을 그리면 안 된다
  const periodByDay = week ? periodByDayOfWeek(policy, isoToDate(week.start)) : undefined
  const dayBlocks = blocksByDayLabel(policy, periodByDay)
  // 개관 밖이라 근무가 없는 칸 — 배정이 비어 있는 칸과 구분해야 미충원을 오해하지 않는다
  const closedSlots = grid ? closedSlotKeys(policy, grid.rows, periodByDay) : []
  const weekHours = useMemo(() => (week ? weekStudentHours(editPlan, week) : []), [editPlan, week])

  // 탭에 올릴 학생 — 초안에 이름이 오른 사람이 아니라 이 배정의 대상 학생 전부.
  // 한 주도 배정을 못 받은 학생이야말로 개인 시간표로 확인할 이유가 크다.
  const tabStudents = useMemo(() => (plan.per_student ?? [])
    .map(st => ({ id: st.student_id, name: st.student_name ?? st.student_id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko')), [plan.per_student])

  // 고른 학생의 그 주 시간표 — 초안 근무(진초록)·가능 시간(✓)·수업(분홍)을 한 격자에
  const studentWeek = useMemo(() => {
    if (!tabStudentId || !week) return null
    const mine = r => r.student_id === tabStudentId
    const availOfStudent = (availRows ?? []).filter(mine)
    return {
      workSlotKeys: weekScheduleSlotKeys(effective.filter(mine), week.start, week.end),
      availSlotKeys: dateAvailabilityToSlotKeys(availOfStudent),
      lectureSlotKeys: dateAvailabilityToSlotKeys(classRows.filter(mine)),
      availHours: availOfStudent.reduce((sum, r) => sum + hoursBetween(r.start_time, r.end_time), 0),
    }
  }, [tabStudentId, week, effective, availRows, classRows])

  // "학생|날짜|HH:MM" — 그 학생이 그 30분에 근무 가능하다고 낸 시간
  const availSet = useMemo(() => {
    const set = new Set()
    ;(availRows ?? []).forEach(r => {
      const d = String(r.date).slice(0, 10)
      for (let m = toMin(r.start_time); m + 30 <= toMin(r.end_time); m += 30) {
        set.add(`${r.student_id}|${d}|${minToHhmm(m)}`)
      }
    })
    return set
  }, [availRows])

  // 편집 여부와 무관하게 계산한다 — 초안을 여는 순간 제약 위반이 보여야 한다 (#110)
  const violations = useMemo(
    () => (week
      ? findViolations(effective, week, { policy, periodByDay, availSet, availRows, perStudent: plan.per_student })
      : EMPTY_VIOLATIONS),
    [effective, week, policy, periodByDay, availSet, availRows, plan.per_student],
  )

  // 요일 열 → 그 주의 실제 날짜. 주가 월요일에 시작하지 않을 수 있어 열 번호로는 못 센다
  const dayDates = useMemo(() => (week ? weekDayDates(week.start, week.end) : {}), [week?.start, week?.end])

  // 개관 시간 안의 칸만 편집 대상 — 근무를 두지 않는 시간에는 넣을 수 없다.
  // 이 주에 없는 요일(마지막 주가 7일이 안 될 때)도 뺀다 — 기간 밖 날짜가 만들어진다.
  const editableSlots = useMemo(() => {
    if (!editing || !grid) return []
    const closed = new Set(closedSlots)
    return DAY_COLS.filter(day => dayDates[day])
      .flatMap(day => grid.rows.map(t => `${day}-${t}`))
      .filter(k => !closed.has(k))
  }, [editing, grid, closedSlots, dayDates])

  // 칸 키 → 편집 단위. 부서가 근무 슬롯(블록)을 정해 뒀으면 블록 전체가 한 단위다
  // (솔버도 블록 단위로 배정한다). 없으면 그 30분.
  const cellOfSlot = key => {
    const [day, time] = [key.slice(0, key.indexOf('-')), key.slice(key.indexOf('-') + 1)]
    const minute = toMin(time)
    const block = (dayBlocks?.[day] ?? []).find(b => minute >= b.start && minute < b.end)
    return {
      day,
      date: dayDates[day],
      start: block ? minToHhmm(block.start) : time,
      end: block ? minToHhmm(block.end) : minToHhmm(minute + 30),
    }
  }

  // 편집은 부서 전체 표에서만 한다 — 개인 시간표에는 누를 칸이 없다
  const startEdit = () => { setPending([]); setSaveError(''); setTabStudentId(null); setEditing(true) }
  const cancelEdit = () => { setPending([]); setSaveError(''); setPicker(null); setEditing(false) }

  const handleSave = async () => {
    if (pending.length === 0) { cancelEdit(); return }
    setSaving(true)
    setSaveError('')
    try {
      await editDraftSchedules(pending.map(e => (
        e.op === 'add'
          ? {
              op: 'add', batch_id: plan.batch_id, student_id: e.row.student_id,
              work_date: e.row.date, start_time: e.row.start_time, end_time: e.row.end_time,
            }
          : { op: 'remove', schedule_id: e.schedule_id }
      )))
      setPending([])
      setEditing(false)
      setPicker(null)
      await onScheduleChanged()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // 배정 1건을 넣는 add 항목. 빼기에서 남는 구간을 되넣을 때도 같은 모양을 쓴다.
  const addEntry = ({ studentId, studentName, date, day, start, end }) => {
    const key = `a${studentId}-${date}-${start}`
    return {
      op: 'add',
      key,
      row: {
        _pendingKey: key,
        student_id: studentId,
        student_name: studentName,
        date,
        day_of_week: day,
        start_time: start,
        end_time: end,
      },
    }
  }

  // 칸 하나에서 학생을 넣고 뺀다 — 넣으면 add, 이미 있던 것을 빼면 remove,
  // 방금 넣은 것을 빼면 그 add를 취소한다(서버에 보낼 일이 없다).
  //
  // 뺄 때는 클릭한 칸만 빠져야 한다. 근무표 행은 연속 근무를 하나로 합쳐 저장하므로
  // (15:00~22:00이 블록으로는 6개인데 행은 하나) 행을 통째로 지우면 클릭하지 않은
  // 구간까지 사라진다(#214). 서버 편집에는 '행 일부 삭제'가 없어서, 행을 지운 뒤
  // 남는 앞·뒤 구간을 add로 되넣어 같은 결과를 만든다.
  const toggleStudent = (cell, student, assignedRow) => {
    setSaveError('')
    if (assignedRow) {
      const rest = subtractSpan(
        { start: assignedRow.start_time, end: assignedRow.end_time },
        { start: cell.start, end: cell.end },
      ).map(span => addEntry({
        studentId: assignedRow.student_id,
        studentName: assignedRow.student_name,
        date: assignedRow.date,
        day: assignedRow.day_of_week ?? cell.day,
        start: span.start,
        end: span.end,
      }))
      setPending(p => [
        ...(assignedRow._pendingKey
          ? p.filter(e => e.key !== assignedRow._pendingKey)
          : [...p, { op: 'remove', key: `r${assignedRow.schedule_id}`, schedule_id: assignedRow.schedule_id }]),
        ...rest,
      ])
      return
    }
    setPending(p => [...p, addEntry({
      studentId: student.student_id,
      studentName: student.student_name,
      date: cell.date,
      day: cell.day,
      start: cell.start,
      end: cell.end,
    })])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--info)' }}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>아래 결과는 <b>초안</b>입니다. 미충원 칸과 개인별 시간 집계를 확인한 뒤 오른쪽 위 <b>시간표 확정</b>을 누르면 근무표로 저장됩니다.</span>
      </div>

      {chatSyncError && <ErrorNote message={chatSyncError} />}
      {chatEditedAt && !chatSyncError && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--success-50)', border: '1px solid var(--success-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--success)' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>AI와의 대화로 초안이 수정되어 아래 표를 <b>최신 상태로 갱신</b>했습니다. 이 상태 그대로 확정됩니다.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <AdminStatCard stat={{ label: '풀이 상태', value: plan.status === 'OPTIMAL' ? '최적해' : '실행가능해', sub: plan.status, icon: 'BadgeCheck', tone: plan.status === 'OPTIMAL' ? 'success' : 'info' }} />
        <AdminStatCard stat={{ label: '배정 건수', value: `${metrics.assigned}건`, sub: `${isoToDots(draft.requested.startDate)} ~ ${isoToDots(draft.requested.endDate)}`, icon: 'CalendarCheck', tone: 'neutral' }} />
        <AdminStatCard stat={{ label: '미충원', value: `${metrics.shortage}칸`, sub: '최소 인원 미달', icon: 'TriangleAlert', tone: metrics.shortage === 0 ? 'success' : 'warning' }} />
        <AdminStatCard stat={{ label: '풀이 시간', value: `${plan.solve_time_seconds ?? 0}초`, sub: '솔버 실행 시간', icon: 'Timer', tone: 'info' }} />
      </div>

      {policy && (
        <AdminPanel
          title="부서 설정 요약"
          right={
            <Button variant="secondary" size="sm" onClick={() => setPolicyOpen(o => !o)}>
              {policyOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {policyOpen ? '접기' : '펼치기'}
            </Button>
          }
        >
          {!policyOpen ? (
            <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
              {policy.custom_rules ? '자연어 운영 규칙이 등록되어 있습니다 — 펼쳐서 확인하세요.' : '등록된 자연어 운영 규칙이 없습니다.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>자연어 운영 규칙</div>
                <p style={{
                  margin: 0, padding: '12px 16px', whiteSpace: 'pre-wrap', lineHeight: 1.75,
                  fontSize: 'var(--fs-body)', fontWeight: 400, color: policy.custom_rules ? 'var(--text-body)' : 'var(--text-subtle)',
                  background: 'var(--neutral-50)', borderLeft: '3px solid var(--sogang-red)', borderRadius: 'var(--radius-sm)',
                }}>
                  {policy.custom_rules || '등록된 규칙 없음'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <SummaryFact label="배정 인원" value={`최소 ${policy.min_per_slot}명 · 최대 ${policy.max_per_slot}명`} />
                <SummaryFact label="주간 상한" value={`교비 ${policy.weekly_hour_limits?.gyobi}h · 국가(학기) ${policy.weekly_hour_limits?.gukga_semester}h · 국가(방학) ${policy.weekly_hour_limits?.gukga_vacation}h`} />
                {policy.gukga_monthly_max_hours != null && <SummaryFact label="국가 월 상한" value={`${policy.gukga_monthly_max_hours}h`} />}
                {policy.biweekly_max_hours != null && <SummaryFact label="부서 2주 교비 총합" value={`${policy.biweekly_max_hours}h`} />}
              </div>

              <div>
                <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>배정 기준별 중요도</div>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  {ADJUSTABLE.map(([key, desc], i) => {
                    const scale = policy.soft_weight_scales?.[key] ?? 1
                    const preset = SCALE_LEVELS.find(l => l.value === scale)
                    const label = preset ? preset.label : `배율 ×${scale}`
                    const tone = scale === 0 ? 'var(--warning)' : scale === 2 ? 'var(--sogang-red)' : scale === 1 ? 'var(--text-muted)' : 'var(--info)'
                    return (
                      <div key={key} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                        padding: '13px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                        background: i % 2 === 1 ? 'var(--neutral-50)' : 'transparent',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>{PENALTY_LABELS[key]}</div>
                          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                        </div>
                        <span style={{ flexShrink: 0, fontSize: 'var(--fs-body)', fontWeight: 600, color: tone }}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </AdminPanel>
      )}

      <AdminPanel
        title="AI 검토 (부서 운영 규칙 + 규정 제약)"
        right={
          <Button variant="secondary" size="sm" onClick={onReview} disabled={reviewing}>
            <Sparkles size={13} /> {reviewing ? '검토 중...' : aiReview ? '다시 검토' : 'AI 검토 실행'}
          </Button>
        }
      >
        <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          부서가 등록한 <b style={{ color: 'var(--text-body)' }}>자연어 운영 규칙</b>과 학생 특이사항을
          기준으로 AI가 저장된 초안을 점검합니다. 여기에 더해 개관 시간·가능 시간·배정 인원·근로 시간
          상한 같은 <b style={{ color: 'var(--text-body)' }}>규정 제약</b>은 서버가 직접 채점해
          <b style={{ color: 'var(--text-body)' }}>규정 검증</b> 표시로 함께 보여줍니다. AI는
          <b style={{ color: 'var(--text-body)' }}>의견만 제시</b>하며 확정은 항상 담당자가 합니다.
        </p>
        {reviewError && <ErrorNote message={reviewError} />}
        {reviewing && <EmptyNote>AI가 배정 초안을 검토하는 중입니다... (수 초 정도 걸릴 수 있어요)</EmptyNote>}
        {!reviewing && aiReview && aiReview.review_available === false && (
          <AiUnavailableNote reason={aiReview.reason} />
        )}
        {!reviewing && aiReview?.review_available && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.6 }}>
              {aiReview.review.summary}
            </p>
            {aiReview.review.findings.length === 0 ? (
              <EmptyNote>규칙 위반·규정 제약 위반이나 우려 사항이 발견되지 않았습니다.</EmptyNote>
            ) : (
              aiReview.review.findings.map((f, i) => <AiFinding key={i} finding={f} />)
            )}
            <ClarificationRequests requests={aiReview.review.clarification_requests ?? []} />
          </div>
        )}
        {!reviewing && !aiReview && !reviewError && (
          <EmptyNote>아직 검토를 실행하지 않았습니다. 오른쪽 버튼으로 AI 검토를 시작하세요.</EmptyNote>
        )}
      </AdminPanel>

      {/* 한 번에 보는 검토(위)와 달리, 대화하며 초안을 직접 고칠 수 있다.
          패널은 화면 우하단에 떠 있고(#152), 여기서는 기능이 있다는 것만 알린다 —
          런처 버튼만으로는 처음 쓰는 담당자가 무엇인지 알기 어렵다. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)',
      }}>
        <Sparkles size={16} style={{ flexShrink: 0, color: 'var(--sogang-red)' }} />
        <span style={{ flex: 1, lineHeight: 1.6 }}>
          아래 표를 보면서 <b style={{ color: 'var(--text-body)' }}>AI와 대화로 초안을 고칠 수 있습니다</b> —
          화면 우측 아래 <b style={{ color: 'var(--text-body)' }}>시간표 검토 도우미</b>를 열어보세요.
        </span>
      </div>

      {picker && (
        <SlotStudentPicker
          cell={picker}
          students={plan.per_student ?? []}
          assigned={effective.filter(x => (
            x.date === picker.date
            && toMin(x.start_time) < toMin(picker.end)
            && toMin(x.end_time) > toMin(picker.start)
          ))}
          weekHoursOf={sid => effective
            .filter(x => x.student_id === sid && x.date >= week.start && x.date <= week.end)
            .reduce((sum, x) => sum + hoursBetween(x.start_time, x.end_time), 0)}
          capOf={sid => {
            const caps = policy?.weekly_hour_limits
            if (!caps) return null
            const funding = (plan.per_student ?? []).find(s => s.student_id === sid)?.funding_type
            if (funding !== 'gukga') return caps.gyobi
            return Math.min(...DAY_COLS.map(d => (periodByDay?.[d] === 'vacation' ? caps.gukga_vacation : caps.gukga_semester)))
          }}
          availSet={availSet}
          availReady={availRows !== null}
          maxPerSlot={policy?.max_per_slot ?? null}
          onToggle={toggleStudent}
          onClose={() => setPicker(null)}
        />
      )}

      <ScheduleChatPanel
        departmentId={departmentId}
        periodStart={draft.requested.startDate}
        periodEnd={draft.requested.endDate}
        onScheduleChanged={onScheduleChanged}
      />

      <AdminPanel
        title="주간 근무 시간표"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {weeks.length > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {weeks.map(w => (
                  <button key={w.index} onClick={() => onWeek(w.index)} style={weekTabStyle(w.index === week.index)}>
                    {w.index + 1}주차
                  </button>
                ))}
              </div>
            )}
            {editing ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>취소</Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || violations.slots.size > 0}
                  title={violations.slots.size > 0 ? '제약을 위반한 칸이 있어 저장할 수 없습니다' : undefined}
                >
                  <Check size={13} /> {saving ? '반영 중...' : `편집 완료${pending.length > 0 ? ` (${pending.length})` : ''}`}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={startEdit} disabled={!grid}>
                <Settings2 size={13} /> 배정 편집
              </Button>
            )}
          </div>
        }
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
            {/* 부서 전체 표와 학생 한 명의 시간표를 같은 자리에서 번갈아 본다.
                인원이 많아 줄바꿈으로 쌓이면 표가 아래로 밀리므로 한 줄 가로 스크롤로 둔다
                (확정 근무표 화면의 이름 탭과 같은 방식). 아래 합산표는 늘 부서 전체다. */}
            {tabStudents.length > 0 && (
              <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0', marginBottom: 12 }}>
                <button type="button" onClick={() => setTabStudentId(null)} style={studentTabStyle(tabStudentId === null)}>부서 전체</button>
                {tabStudents.map(st => (
                  <button
                    key={st.id} type="button"
                    onClick={() => setTabStudentId(st.id)}
                    disabled={editing}
                    title={editing ? '편집 중에는 부서 전체 표에서만 칸을 고칠 수 있습니다' : undefined}
                    style={{ ...studentTabStyle(tabStudentId === st.id), ...(editing ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}
                  >
                    {st.name}
                  </button>
                ))}
              </div>
            )}
            {editing && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px', marginBottom: 12, background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--info)' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  칸을 누르면 그 시간에 넣고 뺄 학생을 고를 수 있습니다. 바꾼 내용은 <b>편집 완료</b>를 눌러야 저장되고,
                  {availRows === null ? ' 가능 시간을 불러오는 중입니다.' : ' 제약을 어긴 칸은 빗금으로 표시되며 그 상태로는 저장할 수 없습니다.'}
                </span>
              </div>
            )}
            {violations.messages.length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)', color: 'var(--sogang-red)', lineHeight: 1.7 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontWeight: 700 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    이 초안은 부서 제약을 {violations.messages.length}건 어깁니다
                    {!editing && ' — 빗금 친 칸을 배정 편집에서 고칠 수 있습니다'}
                  </span>
                </div>
                {violations.messages.map(m => <div key={m}>· {m}</div>)}
              </div>
            )}
            {studentWeek ? (
              <StudentWorkTimetable
                rows={grid.rows}
                workSlotKeys={studentWeek.workSlotKeys}
                availSlotKeys={studentWeek.availSlotKeys}
                lectureSlotKeys={studentWeek.lectureSlotKeys}
                closedSlots={closedSlots}
                availHours={studentWeek.availHours}
                workFill="var(--sogang-red)"
                workLabel="배정"
                workLegendLabel="이 초안의 배정"
                daySubLabels={weekDaySubLabels(week.start, week.end)}
              />
            ) : (
              <>
                <TimeGrid
                  rows={grid.rows} classSlots={grid.filledSlots}
                  slotLabels={grid.slotLabels}
                  slotColors={violations.slots.size > 0
                    ? { ...grid.slotColors, ...Object.fromEntries([...violations.slots].map(k => [k, VIOLATION_FILL])) }
                    : grid.slotColors}
                  legend={false}
                  daySubLabels={weekDaySubLabels(week.start, week.end)}
                  disabledSlots={closedSlots}
                  clickableSlots={editing ? editableSlots : []}
                  onSlotClick={editing ? key => setPicker(cellOfSlot(key)) : undefined}
                  dayBlocks={dayBlocks ?? undefined}
                />
                <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 13, height: 13, background: 'var(--sogang-red)', borderRadius: 3 }} /> 학생 배정됨
                  </span>
                  {(editing || violations.slots.size > 0) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 13, height: 13, background: VIOLATION_FILL, borderRadius: 3 }} /> 제약 위반{editing ? ' (저장 불가)' : ''}
                    </span>
                  )}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 13, height: 13, background: 'var(--warning)', borderRadius: 3 }} /> 미충원
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 13, height: 13, background: 'var(--neutral-100)', border: '1px solid var(--saint-grid)', borderRadius: 3 }} /> 근무 없음 (개관 시간 밖)
                  </span>
                </div>
              </>
            )}

            {saveError && <div style={{ marginTop: 12 }}><ErrorNote message={saveError} /></div>}

            {/* 개인별 집계는 표와 같은 요일 축으로 바로 아래에 붙인다 — 위에서 이름을 세어
                요일 쏠림을 가늠하지 않아도 되고, 눈이 다른 패널로 옮겨가지 않는다 */}
            <WeekHoursTable rows={weekHours} />
          </>
        )}
      </AdminPanel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
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
  )
}

// 제약을 어긴 칸 — 배정(붉은색)·미충원(주황)과 색이 겹치지 않게 빗금을 덧입힌다
const VIOLATION_FILL =
  'repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 4px, rgba(255,255,255,0) 4px 9px), var(--sogang-red)'

// 칸 하나에 넣고 뺄 학생을 고르는 창. 넣을 수 없는 학생은 이유와 함께 잠근다 —
// 눌러 보고 저장할 때 거부당하는 흐름을 만들지 않는다.
function SlotStudentPicker({
  cell, students, assigned, weekHoursOf, capOf, availSet, availReady, maxPerSlot, onToggle, onClose,
}) {
  const blockHours = hoursBetween(cell.start, cell.end)
  const full = maxPerSlot !== null && assigned.length >= maxPerSlot

  const canTake = student => {
    // 가능 시간: 이 구간의 30분 칸이 모두 그 학생의 가능 시간이어야 한다
    if (availReady) {
      for (let m = toMin(cell.start); m + 30 <= toMin(cell.end); m += 30) {
        if (!availSet.has(`${student.student_id}|${cell.date}|${minToHhmm(m)}`)) {
          return '가능 시간 아님'
        }
      }
    }
    const cap = capOf(student.student_id)
    if (cap !== null && weekHoursOf(student.student_id) + blockHours > cap) {
      return `주 ${fmtHours(cap)}시간 초과`
    }
    if (full) return `시간대 최대 ${maxPerSlot}명`
    return null
  }

  const rows = students
    .map(s => {
      const row = assigned.find(a => a.student_id === s.student_id)
      return { student: s, row, blocked: row ? null : canTake(s) }
    })
    .sort((a, b) => {
      if (Boolean(a.row) !== Boolean(b.row)) return a.row ? -1 : 1
      if (Boolean(a.blocked) !== Boolean(b.blocked)) return a.blocked ? 1 : -1
      return String(a.student.student_name).localeCompare(String(b.student.student_name), 'ko')
    })

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface-card)', borderRadius: 14, width: 420, maxWidth: '100%', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(16,24,40,.25)' }}>
        <div style={{ padding: '20px 22px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 'var(--fs-h3)', fontWeight: 800, color: 'var(--text-strong)' }}>
              {isoToDots(cell.date).slice(5)}({cell.day}) {cell.start}~{cell.end}
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
              배정 {assigned.length}명{maxPerSlot !== null && ` / 최대 ${maxPerSlot}명`}
              {!availReady && ' · 가능 시간을 불러오는 중'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={20} color="var(--text-subtle)" />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 22px 20px' }}>
          {rows.length === 0 ? (
            <EmptyNote>배정할 학생이 없습니다.</EmptyNote>
          ) : rows.map(({ student, row, blocked }) => (
            <label
              key={student.student_id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.55 : 1,
              }}
            >
              <Checkbox
                checked={Boolean(row)}
                disabled={Boolean(blocked)}
                onChange={() => !blocked && onToggle(cell, student, row)}
              />
              <span style={{ flex: 1, fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-strong)' }}>
                {student.student_name}
                <span style={{ marginLeft: 6, fontSize: 'var(--fs-caption)', fontWeight: 500, color: 'var(--text-subtle)' }}>
                  {student.funding_type === 'gukga' ? '국가' : '교비'} · 주 {fmtHours(weekHoursOf(student.student_id))}h
                </span>
              </span>
              {blocked && (
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--warning)', fontWeight: 700, whiteSpace: 'nowrap' }}>{blocked}</span>
              )}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// 그 주의 학생별 요일 근무 시간 — 시간표와 같은 요일 축으로 바로 아래에 붙는다
function WeekHoursTable({ rows }) {
  if (rows.length === 0) return null
  return (
    <div style={{ marginTop: 16, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 480 }}>
        <thead>
          <tr>
            <th style={{ ...hourCellStyle, background: 'var(--saint-tan)', color: 'var(--saint-maroon)', fontWeight: 700, width: 88 }}>근무 시간</th>
            {DAY_COLS.map(d => (
              <th key={d} style={{ ...hourCellStyle, background: 'var(--saint-tan)', color: 'var(--saint-maroon)', fontWeight: 700 }}>{d}</th>
            ))}
            <th style={{ ...hourCellStyle, background: 'var(--success-50)', color: 'var(--success)', fontWeight: 700, width: 56 }}>총</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.studentId}>
              <td style={{ ...hourCellStyle, background: 'var(--saint-tan-soft)', fontWeight: 600, color: 'var(--text-strong)', textAlign: 'left', padding: '5px 8px' }}>{r.name}</td>
              {DAY_COLS.map(d => (
                <td key={d} style={{ ...hourCellStyle, color: r.byDay[d] ? 'var(--text-body)' : 'var(--text-subtle)' }}>
                  {fmtHours(r.byDay[d] ?? 0)}
                </td>
              ))}
              <td style={{ ...hourCellStyle, fontWeight: 800, color: 'var(--text-strong)', background: 'var(--success-50)' }}>{fmtHours(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const hourCellStyle = {
  border: '1px solid var(--saint-grid)',
  padding: '5px 4px',
  fontSize: 'var(--fs-caption)',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

// ---- 생성 중 모달 ----
// 솔버는 진행률을 알려주지 않는다 — 퍼센트를 지어내지 않고, 실제로 흐른 시간과
// '아직 돌고 있다'는 사실만 움직임으로 보여준다. 취소할 방법이 없으므로 닫히지 않는다.

const SOLVER_CONSTRAINTS = [
  '학생이 제출한 가능 시간 안에서만 배정',
  '수업 시간과 겹치지 않게 회피',
  '주간 · 2주 근로시간 상한 준수',
  '시간대별 최소 · 최대 인원 충족',
  '학생 간 배정 시간 편차 최소화',
]

function GeneratingScheduleModal({ startDateIso, endDateIso, semesterFixed }) {
  // 실제로 흐른 시간만 센다 (추정 진행률이 아니다)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(v => v + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 14, width: 460, maxWidth: '100%', padding: 30, boxShadow: '0 20px 50px rgba(16,24,40,.25)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <span className="stream-spinner" />
        </div>

        <h3 style={{ margin: '0 0 8px', fontSize: 'var(--fs-h3)', fontWeight: 800, color: 'var(--text-strong)' }}>
          근무표를 만들고 있습니다
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {isoToDots(startDateIso)} ~ {isoToDots(endDateIso)}
          {semesterFixed ? ' 2주 패턴' : ' 기간'}의 배정을 제약조건 최적화(CP-SAT)로 찾는 중입니다.
        </p>

        <div className="stream-progress" style={{ marginBottom: 10 }} />
        <div style={{ marginBottom: 22, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
          {elapsed}초 경과 · {elapsed < 20 ? '보통 30초 안에 끝납니다' : '거의 다 됐습니다 — 최대 30초까지 기다립니다'}
        </div>

        {/* 진행 단계가 아니라 '이 조건들을 한꺼번에 맞추는 중'이라는 설명이다 */}
        <div style={{ padding: '14px 18px', background: 'var(--neutral-25)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', textAlign: 'left' }}>
          <div style={{ marginBottom: 10, fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-body)' }}>함께 맞추는 조건</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {SOLVER_CONSTRAINTS.map((c, i) => (
              <div key={c} className="stream-pulse" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', animationDelay: `${i * 0.22}s` }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sogang-red)', flexShrink: 0 }} />
                {c}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// 승인된 대타를 새 근무표에 얹지 못한 이유 (확정 응답 released_substitutes[].reason).
// 이유가 둘로 갈리고 담당자가 할 일이 다르다 — 앞은 그 시간의 근무 자체가 없어진 것이고,
// 뒤는 대타 학생이 이미 다른 근무를 맡고 있어 얹으면 이중 배정이 되는 경우다.
// reason이 없는 응답(구버전 백엔드)은 예전 문구를 그대로 쓴다.
const RELEASE_REASON_FALLBACK = '원 근무자에게 그 시간 근무가 남아 있지 않습니다.'
const releaseReasonText = reason => reason || RELEASE_REASON_FALLBACK

// ---- 확정 모달 ----
// 확정은 별도 단계가 아니라 검토 화면 위에 뜨는 모달이다 — 표를 보던 자리를 떠나지
// 않고 끝낸다. 저장된 확정본은 진입 화면의 '확정 근무 시간표' 탭이 보여주므로
// 여기서 다시 나열하지 않는다.

function ConfirmScheduleModal({
  plan, draft, hiredCount, confirming, error, confirmed,
  onConfirm, onClose, onViewConfirmed, onRestart,
}) {
  // 한 학기 고정 시간표 옵션 — 이 근무표의 주간 패턴을 학기 종료일까지 반복 적용해 확정.
  // 생성 시 '한 학기 고정'을 골랐으면 미리 켜 두고, 학사 캘린더가 준 학기 종료일을
  // 기본값으로 채운다 (없으면 15주 근사치)
  const [repeatSemester, setRepeatSemester] = useState(draft?.requested?.semesterFixed ?? false)
  const [semesterEndDots, setSemesterEndDots] = useState(() =>
    draft?.requested?.semesterFixed
      ? isoToDots(draft.requested.semesterEnd ?? addDaysIso(draft.requested.startDate, 7 * 15 - 1))
      : '',
  )

  const m = planMetrics(plan)

  // 학기 반복 미리보기 — 기간을 7일 배수로 올려 요일을 유지한 채 몇 회 반복되는지 계산
  const semesterEndIso = dotsToIso(semesterEndDots)
  const semesterEndValid = /^\d{4}-\d{2}-\d{2}$/.test(semesterEndIso) && semesterEndIso > draft.requested.endDate
  const periodDays = Math.round((new Date(draft.requested.endDate) - new Date(draft.requested.startDate)) / 86400000) + 1
  const stride = Math.ceil(periodDays / 7) * 7
  const repeatCount = semesterEndValid
    ? Math.floor(Math.round((new Date(semesterEndIso) - new Date(draft.requested.startDate)) / 86400000) / stride) + 1
    : 0

  // 저장이 도는 중에는 바깥 클릭으로 닫히지 않게 한다
  const dismiss = confirming ? undefined : onClose

  return (
    <div
      onClick={dismiss}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface-card)', borderRadius: 14, width: 560, maxWidth: '100%', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: 26, boxShadow: '0 20px 50px rgba(16,24,40,.25)' }}
      >
        {confirmed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><CalendarCheck size={30} color="var(--success)" /></span>
            <h3 style={{ margin: '0 0 8px', fontSize: 'var(--fs-h3)', fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표가 확정되었습니다</h3>
            <p style={{ margin: '0 0 18px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {confirmed.confirmed_count}건 저장 · 배치 #{confirmed.batch_id}<br />
              {isoToDots(draft.requested.startDate)} ~ {isoToDots(confirmed.period_end ?? draft.requested.endDate)} 기간의 확정 근무표로 학생 화면에 노출됩니다.
            </p>
            {(confirmed.released_substitutes?.length ?? 0) > 0 && (
              <div style={{ width: '100%', marginBottom: 18, padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--danger)', textAlign: 'left', lineHeight: 1.7 }}>
                <b>승인된 대타 {confirmed.released_substitutes.length}건이 해제되었습니다.</b><br />
                필요하면 직접 배정해 주세요.
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {confirmed.released_substitutes.map(r => (
                    <li key={r.request_id}>
                      {isoToDots(r.work_date)} {hhmm(r.start_time)}~{hhmm(r.end_time)}
                      {' — '}
                      {releaseReasonText(r.reason)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(confirmed.adjusted_dates?.length ?? 0) > 0 && (
              <div style={{ width: '100%', marginBottom: 18, padding: '12px 16px', background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--info)', textAlign: 'left', lineHeight: 1.7 }}>
                <b>공휴일·폐관으로 {confirmed.adjusted_dates.length}개 날짜가 자동 조정되었습니다.</b><br />
                {confirmed.adjusted_dates.map(a => `${isoToDots(a.date)} (${a.reason})`).join(' · ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={onRestart}><CalendarDays size={14} /> 다른 기간 근무표 생성</Button>
              <Button onClick={onViewConfirmed}><CalendarCheck size={14} /> 확정 시간표 보기</Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-h3)', fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표를 확정하시겠습니까?</h3>
              <button onClick={onClose} disabled={confirming} style={{ background: 'none', border: 'none', cursor: confirming ? 'default' : 'pointer', padding: 4, display: 'flex' }}>
                <X size={20} color="var(--text-subtle)" />
              </button>
            </div>
            <p style={{ margin: '0 0 18px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              배정 {m.assigned}건 · 미충원 {m.shortage}칸 · 배정 편차 {m.balanceGap}시간 · 선발 학생 {hiredCount}명<br />
              {repeatSemester && semesterEndValid
                ? <>{isoToDots(draft.requested.startDate)} ~ {isoToDots(semesterEndIso)} <b style={{ color: 'var(--text-body)' }}>한 학기 고정 시간표</b>로 저장되며, 확정 후 학생 화면에서 조회됩니다.</>
                : <>{isoToDots(draft.requested.startDate)} ~ {isoToDots(draft.requested.endDate)} 기간으로 저장되며, 확정 후 학생 화면에서 조회됩니다.</>}
              {' '}같은 기간을 이미 확정했다면 이전 확정본은 대체됩니다.
            </p>

            <div style={{ marginBottom: 20, padding: '14px 18px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-25)', textAlign: 'left' }}>
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
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>이 근무표의 주간 패턴을 학기 종료일까지 매주 반복 적용해 저장합니다. 공휴일 단축·폐관일에 걸친 배정은 그날 개관 시간에 맞춰 자동 조정됩니다.</span>
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

            {error && <div style={{ marginBottom: 16 }}><ErrorNote message={error} /></div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={onClose} disabled={confirming}>다시 검토</Button>
              <Button
                onClick={() => onConfirm(repeatSemester && semesterEndValid ? { semesterEnd: semesterEndIso } : {})}
                disabled={confirming || (repeatSemester && !semesterEndValid)}
              >
                <Check size={14} /> {confirming ? '확정 중...' : repeatSemester ? '한 학기 시간표 확정' : '시간표 확정'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- 공용 조각 ----


function th(t, align, width) {
  return <th style={{ padding: '9px 12px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>
}

// 확정 시간표의 학생 선택 탭 — 한 줄 가로 스크롤에 들어가도록 알약 모양으로 작게
const studentTabStyle = on => ({
  height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
  fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', fontWeight: 700,
  border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
  background: on ? 'var(--sogang-red)' : 'var(--surface-card)',
  color: on ? 'var(--text-on-brand)' : 'var(--text-body)',
  whiteSpace: 'nowrap',
})

const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }
// 문장 안에 섞이는 링크 — 버튼처럼 보이지 않게 밑줄 텍스트로 둔다
const linkBtnStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--sogang-red)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'var(--font-sans)' }

// ---- 확정 근무표 (#71 화면명세 이식) ----
// 확정된 주간 근무 시간표 하나만 보여준다. 주 이동은 헤더의 화살표(±7일)가 맡고,
// 몇 달 전처럼 멀리 이동할 때만 달력 아이콘을 눌러 월 달력 팝업을 띄운다.
// 승인된 대타가 반영된 칸은 금색으로 구분해 클릭하면 "누가 → 누구로" 바뀌었는지 상세를 보여준다.

const SUB_GOLD = 'var(--warning)'

function ConfirmedScheduleSection({ departmentId, policy }) {
  const [rows, setRows] = useState(null) // null = 로딩 중
  const [subs, setSubs] = useState([]) // 승인된 대타 요청
  const [weekStart, setWeekStart] = useState(() => mondayOfIso(todayIsoDate()))
  const [detail, setDetail] = useState(null) // 금색 칸 클릭 → 대타 상세 목록
  // 학생 한 명을 고르면 부서 전체 표 대신 그 학생의 근무 시간표를 보여준다.
  // null = 부서 전체 (기본)
  const [studentId, setStudentId] = useState(null)
  const [weekAvail, setWeekAvail] = useState([]) // 그 주 날짜별 가능 시간 (부서 전체)
  const [weekClass, setWeekClass] = useState([]) // 그 주 날짜별 수업 시간

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

  // 가능 시간·수업 시간은 학생을 골랐을 때만 필요하다 — 부서 전체 표는 확정 근무만 그린다
  useEffect(() => {
    if (!departmentId || !studentId) return
    let alive = true
    fetchAvailabilityDates(departmentId, weekStart, weekEnd)
      .then(r => { if (alive) setWeekAvail(r) })
      .catch(() => { if (alive) setWeekAvail([]) })
    fetchDepartmentClassTimeDates(departmentId, weekStart, weekEnd)
      .then(r => { if (alive) setWeekClass(r) })
      .catch(() => { if (alive) setWeekClass([]) })
    return () => { alive = false }
  }, [departmentId, studentId, weekStart, weekEnd])

  // 탭에 올릴 학생 목록 — 확정 근무에 이름이 오른 사람 전부 (주를 넘겨도 목록은 그대로)
  const students = useMemo(() => {
    const map = new Map()
    ;(rows ?? []).forEach(r => {
      if (!map.has(r.student_id)) map.set(r.student_id, r.student_name ?? r.student_id)
    })
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [rows])

  // 고른 학생의 그 주 시간표 — 확정 근무(진초록 '근무')·가능 시간(✓)·수업(분홍)
  const studentWeek = useMemo(() => {
    if (!studentId) return null
    const mine = r => r.student_id === studentId
    const availRows = weekAvail.filter(mine)
    return {
      workSlotKeys: weekScheduleSlotKeys((rows ?? []).filter(mine), weekStart, weekEnd),
      availSlotKeys: dateAvailabilityToSlotKeys(availRows),
      lectureSlotKeys: dateAvailabilityToSlotKeys(weekClass.filter(mine)),
      availHours: availRows.reduce((sum, r) => sum + hoursBetween(r.start_time, r.end_time), 0),
    }
  }, [studentId, rows, weekAvail, weekClass, weekStart, weekEnd])

  const grid = useMemo(() => {
    const weekRows = (rows ?? []).filter(r => {
      const d = r.date.slice(0, 10)
      return d >= weekStart && d <= weekEnd
    })
    if (weekRows.length === 0) return null

    // 세로 범위는 배정 구간이 아니라 개관 시간으로 잡는다 — 학생 한 명을 골랐을 때의
    // 표와 격자가 같아야 두 화면을 오가며 같은 자리를 볼 수 있고, 개관은 하는데
    // 배정이 없는 칸도 '근무 없음'과 구분되어 드러난다
    const timeRows = policy
      ? gridRowsFromPolicy(policy)
      : (() => {
          const bounds = weekRows.flatMap(r => [toMin(r.start_time), toMin(r.end_time)])
          const from = Math.floor(Math.min(...bounds) / 30) * 30
          const to = Math.ceil(Math.max(...bounds) / 30) * 30
          const out = []
          for (let m = from; m < to; m += 30) out.push(minToHhmm(m))
          return out
        })()

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
        // 학생 한 명을 골랐을 때의 '근무' 칸과 같은 초록 — 부서 전체와 개인 표를
        // 오가며 봐도 '확정된 근무'가 같은 색이어야 한다 (초안 표는 붉은색 그대로)
        slotColors[key] = WORK_FILL
      }
    })
    return { timeRows, filledSlots, slotLabels, slotColors, subCells, count: weekRows.length }
  }, [rows, weekStart, weekEnd, subBySchedule, policy])

  // 탭 하나를 차지하므로 비어 있어도 숨기지 않는다 (#154) — 빈 탭은 고장으로 보인다
  if (rows === null) {
    return <AdminPanel><EmptyNote>확정 근무표를 불러오는 중...</EmptyNote></AdminPanel>
  }
  if (rows.length === 0) {
    return (
      <AdminPanel>
        <EmptyNote>아직 확정된 근무표가 없습니다. 위에서 기간을 정하고 &lsquo;부서 근무표 생성 시작&rsquo;을 눌러 주세요.</EmptyNote>
      </AdminPanel>
    )
  }

  const thisMonday = mondayOfIso(todayIsoDate())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 18 }}>
      <AdminPanel
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, -7))} style={weekArrowStyle}><ChevronLeft size={16} color="var(--text-muted)" /></button>
            <span>{isoToDots(weekStart)} ~ {isoToDots(weekEnd)}</span>
            <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, 7))} style={weekArrowStyle}><ChevronRight size={16} color="var(--text-muted)" /></button>
          </span>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
            {/* 학생을 고르면 그 학생 한 명의 시간표로 바뀐다. 인원이 많아 줄바꿈으로 쌓이면
                표가 아래로 밀리므로 한 줄 가로 스크롤로 둔다 (수합 화면의 이름 탭과 같은 방식) */}
            <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', minWidth: 0, padding: '2px 0' }}>
              <button type="button" onClick={() => setStudentId(null)} style={studentTabStyle(studentId === null)}>부서 전체</button>
              {students.map(st => (
                <button key={st.id} type="button" onClick={() => setStudentId(st.id)} style={studentTabStyle(studentId === st.id)}>
                  {st.name}
                </button>
              ))}
            </div>
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
        {studentWeek ? (
          <StudentWorkTimetable
            rows={gridRowsFromPolicy(policy)}
            workSlotKeys={studentWeek.workSlotKeys}
            availSlotKeys={studentWeek.availSlotKeys}
            lectureSlotKeys={studentWeek.lectureSlotKeys}
            closedSlots={closedSlotKeys(policy, gridRowsFromPolicy(policy), periodByDayOfWeek(policy, isoToDate(weekStart)))}
            availHours={studentWeek.availHours}
          />
        ) : grid === null ? (
          <EmptyNote>이 주에는 확정된 근무가 없습니다. 화살표나 달력 아이콘으로 다른 주를 선택해 보세요.</EmptyNote>
        ) : (
          <>
            <TimeGrid
              rows={grid.timeRows} rowHeight={17} classSlots={grid.filledSlots}
              slotLabels={grid.slotLabels} slotColors={grid.slotColors} legend={false}
              clickableSlots={[...grid.subCells.keys()]}
              onSlotClick={key => setDetail(grid.subCells.get(key) ?? null)}
              disabledSlots={closedSlotKeys(policy, grid.timeRows, periodByDayOfWeek(policy, isoToDate(weekStart)))}
              dayBlocks={blocksByDayLabel(policy, periodByDayOfWeek(policy, isoToDate(weekStart))) ?? undefined}
            />
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 13, height: 13, background: WORK_FILL, borderRadius: 3 }} /> 학생 배정됨
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 13, height: 13, background: SUB_GOLD, borderRadius: 3 }} /> 대타로 근무자 변경됨 (클릭하면 상세 확인)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 13, height: 13, background: 'var(--neutral-100)', border: '1px solid var(--saint-grid)', borderRadius: 3 }} /> 근무 없음 (개관 시간 밖)
              </span>
            </div>
          </>
        )}
      </AdminPanel>

      {detail && <SubstituteDetailModal subs={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

