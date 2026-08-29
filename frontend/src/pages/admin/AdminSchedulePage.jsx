import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, CircleCheck,
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
import DepartmentAvailability from '../../components/admin/DepartmentAvailability'
import { EmptyNote, ErrorNote, weekArrowStyle, weekTabStyle } from '../../components/admin/scheduleBits'
import { PENALTY_LABELS } from '../../components/admin/DepartmentPolicyEditor'
import ScheduleChatPanel from '../../components/admin/ScheduleChatPanel'
import { getSessionUser } from '../../utils/session'
import {
  blocksByDayLabel, periodByDayOfWeek, periodOfDate, policyRows,
} from '../../utils/workSlots'
import { termKeyForDate } from '../../utils/terms'
import {
  HALF_HOUR_ROWS, addDaysIso, buildRoster, hhmm, isoToDate, isoToDots,
  minToHhmm, pad2, toMin, todayIsoDate,
} from '../../utils/scheduleGrid'
import {
  fetchPostings,
  fetchDepartmentStudents,
  fetchDepartmentAvailability,
  fetchTerms,
  fetchDepartmentClassTime,
  fetchDepartmentPolicy,
  generateSchedule,
  reviewSchedule,
  fetchDraftSchedule,
  confirmSchedule,
  fetchDepartmentSchedule,
  fetchDepartmentSubstituteRequests,
} from '../../api/client'

// 생성 흐름은 담당자가 실제로 하는 일만 남긴다 (#154).
// 수합 확인은 진입 화면의 '수합된 근무 시간표' 탭이, 부서 정책은 '부서 설정'이 담당한다.
const STEPS = ['근무표 생성', '근무표 검토', '확정']
const LAST_STEP = STEPS.length - 1

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
  // 학생팀장은 근무표만 짠다 — 부서 설정·지원서 연동은 직원 권한이라 버튼을 감춘다 (#156)
  const isTeamLead = Boolean(user) && user.role !== 'staff' && user.is_team_lead
  const departmentId = user?.department_id
  const navigate = useNavigate()

  const [started, setStarted] = useState(false)
  const [stage, setStage] = useState(0)
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
      setSavedSchedule(null)
      setAiReview(null)
      setReviewError('')
      setChatEditedAt(null)
      setChatSyncError('')
      setStage(1)
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
    setStage(0)
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

  // ---- 진입 화면: 확정·수합 시간표 탭 + 근무표 생성 시작 ----
  if (!started) {
    return (
      <AdminShell activeMenu="schedule">
        <PageTitle>근무표 편성</PageTitle>
        <p style={{ margin: '0 0 20px 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          근무표는 <b style={{ color: 'var(--text-body)' }}>부서 단위</b>로 생성되며,
          개관 시간·근무 슬롯·배정 인원 등 생성 기준은 <b style={{ color: 'var(--text-body)' }}>부서 설정</b>에서 미리 정해둡니다.
          {isTeamLead ? ' 설정 변경은 부서 담당 직원에게 요청해 주세요.' : (
            <>
              {' '}
              <button type="button" onClick={() => navigate('/admin/settings')} style={linkBtnStyle}>
                <Settings2 size={13} /> 부서 설정 열기
              </button>
            </>
          )}
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
            onOpenSettings={isTeamLead ? null : () => navigate('/admin/settings')}
          />
        )}
      </AdminShell>
    )
  }

  const canGoNext = stage === 0 ? !!draft : stage === 1 ? !!selectedPlan : false

  return (
    <AdminShell activeMenu="schedule">
      {/* 제목은 진입 화면과 같은 폭이어야 한다 — flex 아이템 안에 넣으면 내용 폭으로
          줄어들어 화면을 옮길 때마다 테두리 상자 크기가 달라 보인다.
          단계 이동 버튼은 제목이 아니라 설명 줄과 나란히 둔다. */}
      {/* 돌아가는 곳은 공고가 아니라 확정·수합 시간표를 보는 진입 화면이다 */}
      <button onClick={() => { setStarted(false); setStage(0); setGenerateError('') }} style={{ ...backBtnStyle, marginBottom: 6 }}>
        <ChevronLeft size={15} /> 시간표 현황으로
      </button>
      <PageTitle>근무표 편성</PageTitle>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <p style={{ margin: '0 0 0 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
          {user?.department_name ?? '우리 부서'} — 부서 설정에 정해둔 기준으로 근무표를 생성하고, 검토·조정한 뒤 확정합니다.
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {stage > 0 && !confirmed && <Button variant="secondary" size="sm" onClick={() => setStage(stage - 1)}><ChevronLeft size={14} /> 이전 단계</Button>}
          {stage < LAST_STEP && <Button size="sm" disabled={!canGoNext} onClick={() => setStage(stage + 1)}>다음 단계 <ChevronRight size={14} /></Button>}
        </div>
      </div>

      <Stepper stage={stage} />

      {stage === 0 && (
        <GenerateStage
          form={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
          startDateIso={startDateIso} endDateIso={endDateIso}
          submitting={generating} error={generateError} onSubmit={handleGenerate}
          policy={policy} departmentName={user?.department_name}
          hiredCount={roster.filter(r => r.inHiredList).length}
          submittedCount={roster.filter(r => r.submitted).length}
          onOpenSettings={isTeamLead ? null : () => navigate('/admin/settings')}
          onOpenAvailability={() => { setStarted(false); setGenerateError(''); setEntryTab('availability') }}
        />
      )}

      {stage === 1 && (
        draft ? (
          <ReviewStage
            draft={draft}
            weekIndex={weekIndex} onWeek={setWeekIndex} policy={policy}
            aiReview={aiReview} reviewing={reviewing} reviewError={reviewError} onReview={handleReview}
            departmentId={departmentId}
            onScheduleChanged={reloadDraftFromServer}
            chatEditedAt={chatEditedAt} chatSyncError={chatSyncError}
          />
        ) : (
          <AdminPanel><EmptyNote>아직 생성된 근무표가 없습니다. 이전 단계에서 근무표를 생성해 주세요.</EmptyNote></AdminPanel>
        )
      )}

      {stage === 2 && (
        <ConfirmStage
          plan={selectedPlan} draft={draft} hiredCount={roster.filter(r => r.inHiredList).length}
          confirming={confirming} error={confirmError} confirmed={confirmed} saved={savedSchedule}
          onConfirm={handleConfirm} onBack={() => setStage(1)}
          onRestart={() => { setStarted(false); setStage(0); setDraft(null); setConfirmed(null); setGenerateError('') }}
        />
      )}
    </AdminShell>
  )
}

// ---- 1단계: 근무표 생성 ----
// 제약 조건 목록과 부서 정책 편집은 '부서 설정'으로, 생성 조건 입력은 진입 화면으로
// 옮겼다 (#154). 이 단계는 생성이 도는 동안의 진행 상태와, 조건을 고쳐 다시 돌리는 자리다.

function GenerateStage({
  form, onChange, startDateIso, endDateIso, submitting, error, onSubmit,
  policy, departmentName, hiredCount, submittedCount, onOpenSettings, onOpenAvailability,
}) {
  const notMonday = startDateIso && !isMondayIso(startDateIso)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      {/* 생성 기준 요약 — 값을 바꾸려면 부서 설정으로 간다 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--neutral-25)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
        <CircleCheck size={16} color="var(--success)" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {policy
            ? <>
                <b style={{ color: 'var(--text-body)' }}>{departmentName ?? '부서'} 설정 기준</b>으로 생성합니다 —
                개관 {policy.grid_start_time}~{policy.grid_end_time} · 시간대당 {policy.min_per_slot}~{policy.max_per_slot}명.
                수업시간 회피와 주간·2주 근로시간 상한은 항상 적용됩니다.
              </>
            : '부서 설정을 불러오는 중입니다. 개관 시간·배정 인원·근로시간 상한이 생성에 그대로 적용됩니다.'}
        </span>
        {onOpenSettings && (
          <Button variant="secondary" size="sm" onClick={onOpenSettings}>
            <Settings2 size={13} /> 부서 설정
          </Button>
        )}
      </div>

      {/* 수합 상태 — 자세한 확인은 진입 화면의 수합 탭이 담당한다 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
        <CalendarCheck size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          선발 {hiredCount}명 중 <b style={{ color: submittedCount === hiredCount ? 'var(--success)' : 'var(--warning)' }}>{submittedCount}명</b>의 가능 시간이 수합되어 있습니다.
        </span>
        <Button variant="secondary" size="sm" onClick={onOpenAvailability}>
          수합 시간표 보기
        </Button>
      </div>

      {submittedCount === 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--warning)' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>가능시간이 확보된 학생이 없습니다. 생성 결과가 비거나 실패할 수 있습니다.</span>
        </div>
      )}

      {submitting ? (
        <AdminPanel title="근무표 생성 중">
          <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            {isoToDots(startDateIso)} ~ {isoToDots(endDateIso)} 기간의 근무표를 제약조건 최적화로 만들고 있습니다.
            최대 30초까지 걸리며, 끝나면 근무표 검토 단계로 넘어갑니다.
          </p>
        </AdminPanel>
      ) : (
        // 조건은 진입 화면에서 이미 받았다 — 여기서는 결과가 마음에 안 들 때 조건을 고쳐 다시 돌린다
        <AdminPanel title="조건 바꿔 다시 생성">
          <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            기간을 바꿔 다시 만들 수 있습니다. 다시 생성하면 이전 초안은 대체됩니다.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <GenerateConditionFields
              form={form}
              onChange={onChange}
              onChangePeriod={v => {
                if (v === 'semester') { onChange('numDays', 14); onChange('semesterFixed', true) }
                else { onChange('numDays', Number(v)); onChange('semesterFixed', false) }
              }}
            />
            <Button onClick={onSubmit}>
              <Sparkles size={14} /> 근무표 생성
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>
            <span>{endDateIso && `${isoToDots(startDateIso)} ~ ${isoToDots(endDateIso)}${form.semesterFixed ? ' 패턴을 학기 종료일까지 반복' : ''}`}</span>
            {notMonday && (
              <span style={{ color: 'var(--warning)' }}>월요일 시작을 권장합니다 (주간 상한이 월~일 기준입니다).</span>
            )}
          </div>
          {error && <div style={{ marginTop: 14 }}><ErrorNote message={error} /></div>}
        </AdminPanel>
      )}
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

// ---- 2단계: 근무표 검토 ----

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
  no_rules: '부서 운영 규칙이 등록되어 있지 않습니다. 부서 설정에서 AI 검토 규칙을 등록하면 사용할 수 있습니다.',
  not_configured: '서버에 AI 키(GEMINI_API_KEY)가 설정되어 있지 않아 검토를 수행할 수 없습니다.',
  ai_error: 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.',
}

function ReviewStage({
  draft, weekIndex, onWeek, policy,
  aiReview, reviewing, reviewError, onReview,
  departmentId, onScheduleChanged, chatEditedAt, chatSyncError,
}) {
  const plan = draft.plan
  const weeks = useMemo(() => splitWeeks(draft), [draft])
  const week = weeks[Math.min(weekIndex, weeks.length - 1)]
  const grid = useMemo(() => (week ? buildWeekGrid(plan, week) : null), [plan, week])
  const metrics = planMetrics(plan)
  // 그 주 날짜로 요일마다 학기/방학을 가린다 — 방학 주에 학기 블록을 그리면 안 된다
  const dayBlocks = blocksByDayLabel(policy, week ? periodByDayOfWeek(policy, isoToDate(week.start)) : undefined)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--info)' }}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>아래 결과는 <b>초안</b>입니다. 미충원 칸과 개인별 시간 집계를 확인한 뒤 확정 단계로 넘어가면 근무표로 저장됩니다.</span>
      </div>

      {chatSyncError && <ErrorNote message={chatSyncError} />}
      {chatEditedAt && !chatSyncError && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--success-50)', border: '1px solid var(--success-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--success)' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>AI와의 대화로 초안이 수정되어 아래 표를 <b>최신 상태로 갱신</b>했습니다. 이 상태 그대로 확정 단계로 넘어갑니다.</span>
        </div>
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
          저장된 초안을 점검합니다. AI는 <b style={{ color: 'var(--text-body)' }}>의견만 제시</b>하며
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

      <ScheduleChatPanel
        departmentId={departmentId}
        periodStart={draft.requested.startDate}
        periodEnd={draft.requested.endDate}
        onScheduleChanged={onScheduleChanged}
      />

      <AdminPanel
        title="주간 근무 시간표"
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

// ---- 3단계: 확정 ----

function ConfirmStage({ plan, draft, hiredCount, confirming, error, confirmed, saved, onConfirm, onBack, onRestart }) {
  // 한 학기 고정 시간표 옵션 — 이 근무표의 주간 패턴을 학기 종료일까지 반복 적용해 확정
  // 생성 시 '한 학기 고정'을 골랐으면 확정 단계에서 미리 켜 두고,
  // 학사 캘린더가 준 학기 종료일을 기본값으로 채운다 (없으면 15주 근사치)
  const [repeatSemester, setRepeatSemester] = useState(draft?.requested?.semesterFixed ?? false)
  const [semesterEndDots, setSemesterEndDots] = useState(() =>
    draft?.requested?.semesterFixed
      ? isoToDots(draft.requested.semesterEnd ?? addDaysIso(draft.requested.startDate, 7 * 15 - 1))
      : '',
  )

  if (!plan) {
    return <AdminPanel><EmptyNote>확정할 근무표가 없습니다. 이전 단계에서 근무표를 생성해 주세요.</EmptyNote></AdminPanel>
  }

  if (confirmed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AdminPanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><CalendarCheck size={32} color="var(--success)" /></span>
            <h2 style={{ margin: '0 0 8px', fontSize: 'var(--fs-h2)', fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표가 확정되었습니다</h2>
            <p style={{ margin: '0 0 20px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {confirmed.confirmed_count}건 저장 · 배치 #{confirmed.batch_id}<br />
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
            배정 {m.assigned}건 · 미충원 {m.shortage}칸 · 배정 편차 {m.balanceGap}시간 · 선발 학생 {hiredCount}명<br />
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
          <div key={s} style={{ flex: i < LAST_STEP ? 1 : '0 0 auto', display: 'flex', alignItems: 'center' }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%',
              background: done ? 'var(--success)' : (active ? 'var(--sogang-red)' : 'var(--surface-card)'),
              border: `2px solid ${done ? 'var(--success)' : (active ? 'var(--sogang-red)' : 'var(--border-default)')}`,
              color: 'var(--text-on-brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-sm)', fontWeight: 700, flexShrink: 0,
            }}>
              {done ? <Check size={13} strokeWidth={3} /> : (i + 1)}
            </span>
            <span style={{ marginLeft: 10, fontSize: 'var(--fs-body)', fontWeight: active ? 700 : 500, color: (done || active) ? 'var(--text-strong)' : 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{s}</span>
            {i < LAST_STEP && <span style={{ flex: 1, height: 2, background: done ? 'var(--success)' : 'var(--border-subtle)', margin: '0 16px' }} />}
          </div>
        )
      })}
    </div>
  )
}

function th(t, align, width) {
  return <th style={{ padding: '9px 12px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>
}

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

  // 탭 하나를 차지하므로 비어 있어도 숨기지 않는다 (#154) — 빈 탭은 고장으로 보인다
  if (rows === null) {
    return <AdminPanel title="확정된 주간 근무 시간표"><EmptyNote>확정 근무표를 불러오는 중...</EmptyNote></AdminPanel>
  }
  if (rows.length === 0) {
    return (
      <AdminPanel title="확정된 주간 근무 시간표">
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
              dayBlocks={blocksByDayLabel(policy, periodByDayOfWeek(policy, isoToDate(weekStart))) ?? undefined}
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

