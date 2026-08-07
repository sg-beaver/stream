import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, CircleCheck, TriangleAlert,
  CalendarCheck, CalendarDays, Sparkles, Download, Settings2,
} from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Button from '../../components/ui/Button'
import DatePicker from '../../components/ui/DatePicker'
import TimeGrid from '../../components/ui/TimeGrid'
import { AdminPanel, AdminStatCard } from '../../components/admin/AdminPanel'
import OpeningHoursEditor from '../../components/admin/OpeningHoursEditor'
import { getSessionUser } from '../../utils/session'
import { timeRows as defaultTimeRows, dayCols } from '../../data/mockData'
import {
  fetchPostings,
  fetchApplicants,
  fetchDepartmentAvailability,
  fetchDepartmentPolicy,
  updateDepartmentOpeningHours,
  importAvailabilityFromApplications,
  generateSchedule,
  confirmSchedule,
  fetchDepartmentSchedule,
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
  ['최대 연속 근무시간', '부서 정책에 설정된 연속 근무 상한을 넘지 않습니다.'],
  ['최소 인원 확보', '개관 시간대의 최소 배정 인원을 맞추고, 못 맞춘 칸은 미충원으로 보고합니다.'],
]

// Soft Constraint 페널티 항목 표기 — backend reporting_html.py의 _PENALTY_LABELS와 같은 문구
const PENALTY_LABELS = {
  understaffing: '최소 인원 미달',
  preferred_staffing: '선호 인원(2명) 미충족',
  preference_match: '희망 외 시간 배정',
  contiguity: '근무 블록 분절',
  meal_break: '식사 시간 미확보',
  morning_rules: '아침 근무 규칙 위반',
  exam_proximity: '시험 직전 배정',
  avoid_range: '회피 요청 시간 배정',
  non_campus_day: '비등교일 배정',
  fair_hours: '주간 목표 시간 미달',
}

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

// 가능시간 구간(요일 + 시작~끝) → TimeGrid 슬롯 키 목록 ("월-14:00" 1시간 단위)
function availabilityToSlotKeys(rows) {
  const keys = new Set()
  rows.forEach(r => {
    const day = DAY_LABELS[r.day_of_week]
    if (!day) return
    for (let m = toMin(r.start_time); m + 60 <= toMin(r.end_time); m += 60) {
      keys.add(`${day}-${minToHhmm(m)}`)
    }
  })
  return [...keys]
}

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
  }))
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  const [draft, setDraft] = useState(null)
  const [planIndex, setPlanIndex] = useState(0)
  const [weekIndex, setWeekIndex] = useState(0)

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

  const handleSaveHours = async openingHours => {
    setSavingHours(true)
    setHoursError('')
    try {
      // 응답이 갱신된 정책이므로 그대로 반영하면 수합 시간표 세로축도 함께 바뀐다
      setPolicy(await updateDepartmentOpeningHours(departmentId, openingHours))
      setEditingHours(false)
    } catch (e) {
      setHoursError(`개관 시간을 저장하지 못했습니다. ${e.message}`)
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
      })
      const { alternatives = [], ...primary } = res
      setDraft({
        requested: { startDate: startDateIso, endDate: endDateIso, numDays: Number(form.numDays) },
        plans: [primary, ...alternatives],
      })
      setPlanIndex(0)
      setWeekIndex(0)
      setConfirmed(null)
      setSavedSchedule(null)
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

  const handleConfirm = async () => {
    if (!selectedPlan) return
    setConfirming(true)
    setConfirmError('')
    try {
      const res = await confirmSchedule({
        department_id: departmentId,
        period_start: draft.requested.startDate,
        period_end: draft.requested.endDate,
        schedules: selectedPlan.schedules.map(s => ({
          student_id: s.student_id, date: s.date,
          start_time: s.start_time, end_time: s.end_time,
        })),
      })
      setConfirmed(res)
      const saved = await fetchDepartmentSchedule(departmentId, {
        from_date: draft.requested.startDate, to_date: draft.requested.endDate,
      }).catch(() => null)
      setSavedSchedule(saved)
    } catch (e) {
      setConfirmError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  const roster = deptData?.roster ?? []

  // ---- 진입 화면: 부서 담당 공고 선발 현황 (디자인의 공고 카드) ----
  if (!started) {
    return (
      <AdminShell activeMenu="schedule">
        <PageTitle>근로 시간표</PageTitle>
        <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          학생 선발이 끝난 뒤 근무표를 생성합니다. 생성은 <b style={{ color: 'var(--text-body)' }}>부서 단위</b>로,
          부서 정책(개관 시간·최소 인원·근로시간 상한)을 기준으로 이루어집니다.
        </p>

        {loadError && <ErrorNote message={loadError} />}

        <AdminPanel title={`${user?.department_name ?? '우리 부서'} 담당 공고`}>
          {deptData === null ? (
            <EmptyNote>공고를 불러오는 중...</EmptyNote>
          ) : deptData.postings.length === 0 ? (
            <EmptyNote>담당 공고가 없습니다.</EmptyNote>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {deptData.postings.map(p => {
                const ready = p.hired.length > 0
                return (
                  <div key={p.id} style={{ border: `1px solid ${ready ? 'var(--border-subtle)' : 'var(--border-subtle)'}`, background: ready ? 'var(--neutral-0)' : 'var(--neutral-25)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 14 }}>{user?.department_name} · {p.status}</div>
                    <div style={{ display: 'flex', gap: 18, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>선발 인원</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: ready ? 'var(--success)' : 'var(--text-subtle)' }}>{p.hired.length}/{p.headcount}명</div>
                      </div>
                    </div>
                    {!ready && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)' }}>
                        선발된 학생 없음 · 학생 선발에서 먼저 선발하세요
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </AdminPanel>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 18, padding: '16px 22px', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            선발 학생 <b style={{ color: 'var(--text-strong)' }}>{roster.filter(r => r.inHiredList).length}명</b> ·
            가능시간 제출 <b style={{ color: 'var(--success)' }}>{roster.filter(r => r.submitted).length}명</b>
          </span>
          <Button disabled={deptData === null} onClick={() => { setStarted(true); setStage(0) }}>
            <CalendarDays size={14} /> 부서 근무표 생성 시작
          </Button>
        </div>
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
          <p style={{ margin: '-8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
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
          onSaveHours={handleSaveHours}
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
            weekIndex={weekIndex} onWeek={setWeekIndex}
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
  const expanded = expandedId ? roster.find(r => r.studentId === expandedId) : null
  const gridRows = policyRows(policy)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <AdminStatCard stat={{ label: '선발 학생', value: `${roster.filter(r => r.inHiredList).length}명`, sub: '합격 처리 기준', icon: 'Users', tone: 'neutral' }} />
        <AdminStatCard stat={{ label: '가능시간 확보', value: `${submitted.length}명`, sub: `지원서 연동 ${fromApplication.length} · 직접 입력 ${submitted.length - fromApplication.length}`, icon: 'CircleCheck', tone: 'success' }} />
        <AdminStatCard stat={{ label: '미확보', value: `${missing.length}명`, sub: '생성 전 확인 필요', icon: 'Clock', tone: 'warning' }} />
        <AdminStatCard stat={{ label: '총 가능시간', value: `${roster.reduce((n, r) => n + r.hours, 0)}h`, sub: '주간 패턴 합계', icon: 'CalendarClock', tone: 'info' }} />
      </div>

      <AdminPanel
        title={editingHours ? '개관 시간 설정' : '전체 수합 시간표'}
        right={
          editingHours ? null : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {policy
                  ? `${departmentName ?? '부서'} 개관 ${policy.grid_start_time}~${policy.grid_end_time}`
                  + (policy.opening_hours_source === 'department' ? ' · 직접 설정' : ' · 기본 정책')
                  : '개관 시간 불러오는 중...'}
              </span>
              <Button variant="secondary" size="sm" onClick={onEditHours} disabled={!policy}>
                <Settings2 size={13} /> 개관 시간 설정
              </Button>
            </div>
          )
        }
      >
        {editingHours ? (
          <OpeningHoursEditor
            policy={policy}
            onSave={onSaveHours}
            saving={savingHours}
            error={hoursError}
            onClose={onCloseHours}
          />
        ) : (
          <>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
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
        right={<span style={{ fontSize: 13, color: 'var(--text-muted)' }}>선발 {roster.filter(r => r.inHiredList).length}명 중 <b style={{ color: 'var(--success)' }}>{submitted.length}</b>명 확보</span>}
      >
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--text-body)' }}>신규 선발 학생</b>은 시간을 다시 받지 않고 지원서에서 체크한 근무 가능 시간을 그대로 연동합니다.
          이미 근로 중이던 <b style={{ color: 'var(--text-body)' }}>기존 학생</b>은 지원서가 없어 직접 입력한 시간을 사용합니다.
          카드를 클릭하면 수합된 시간표를 볼 수 있습니다.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Button variant="secondary" size="sm" onClick={onImport} disabled={importing}>
            <Download size={13} /> {importing ? '연동 중...' : '지원서 시간 연동'}
          </Button>
          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
            합격 처리 시 자동 연동되지만, 지원서를 나중에 채운 학생이 있으면 다시 실행하세요. 직접 입력분은 덮어쓰지 않습니다.
          </span>
        </div>
        {importNote && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', marginBottom: 14, background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--info)' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{importNote}</span>
          </div>
        )}

        {roster.length === 0 ? (
          <EmptyNote>합격 처리된 학생이 없습니다. 학생 선발을 먼저 진행해 주세요.</EmptyNote>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {roster.map(r => {
              const on = expandedId === r.studentId
              const ok = r.submitted
              return (
                <button
                  key={r.studentId} type="button" onClick={() => onExpand(on ? null : r.studentId)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    border: `1.5px solid ${on ? 'var(--sogang-red)' : (ok ? 'var(--success-100)' : 'var(--warning-100)')}`,
                    background: on ? 'var(--sogang-red-50)' : (ok ? 'var(--success-50)' : 'var(--warning-50)'),
                    borderRadius: 'var(--radius-lg)', padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{r.name}</span>
                    {ok ? <CircleCheck size={18} color="var(--success)" /> : <TriangleAlert size={18} color="var(--warning)" />}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: ok ? 'var(--success)' : 'var(--warning)' }}>
                    {ok ? (r.source === 'application' ? '지원서 연동' : '직접 입력') : '가능 시간 미확보'}
                    {!r.inHiredList && <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}> · 합격 명단 외</span>}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)', marginTop: 8 }}>
                    {r.hours}<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-subtle)' }}> 가능시간</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>
                    {r.days.length > 0 ? r.days.map(d => DAY_LABELS[d] ?? d).join(' · ') : '등록된 요일 없음'}
                  </div>
                  <div style={{ fontSize: 11, color: on ? 'var(--sogang-red)' : 'var(--text-subtle)', fontWeight: 600, marginTop: 10 }}>
                    {on ? '시간표 접기 ▲' : '수합된 시간표 보기 ▼'}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </AdminPanel>

      {expanded && (
        <AdminPanel
          title={`${expanded.name} · 수합된 근무 가능 시간`}
          right={<button onClick={() => onExpand(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>닫기</button>}
        >
          {expanded.slotKeys.length === 0 ? (
            <EmptyNote>수합된 가능 시간이 없습니다. 지원서 연동 또는 학생의 직접 입력이 필요합니다.</EmptyNote>
          ) : (
            <>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
                체크 표시는 학생이 <b style={{ color: 'var(--sogang-red)' }}>근무 가능</b>하다고 제출한 시간
                ({expanded.source === 'application' ? '지원서에서 연동' : '직접 입력'})입니다.
              </p>
              <TimeGrid
                rows={gridRows}
                availableSlots={expanded.slotKeys}
                availableLegendText="근무 가능 시간"
              />
            </>
          )}
        </AdminPanel>
      )}
    </div>
  )
}

// 부서 개관 시간(정책)에서 시간표 그리드의 시간 행을 만든다.
// 정책을 못 불러오면 TimeGrid 기본값(09:00~18:00)을 쓰도록 undefined를 반환한다.
function policyRows(policy) {
  if (!policy) return undefined
  const start = toMin(policy.grid_start_time)
  const end = toMin(policy.grid_end_time)
  const rows = []
  for (let m = start; m + 60 <= end; m += 60) rows.push(minToHhmm(m))
  return rows.length > 0 ? rows : undefined
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
    // 수합 표는 1시간 행이므로, 그 시간대에 30분이라도 열려 있으면 열린 칸으로 본다
    return ranges.some(([start, end]) => minute < end && minute + 60 > start)
  }
}

// 부서 전체 수합 — 칸마다 그 시간에 가능하다고 제출한 학생 이름을 모아 보여준다.
// TimeGrid는 칸당 한 줄만 그리도록 되어 있어, 이름이 여러 개 들어가는 이 표는 따로 그린다.
function AvailabilityHeatmap({ roster, rows, policy }) {
  // 부서 정책을 못 불러오면 TimeGrid와 같은 기본 시간 범위를 쓴다
  const timeRows = rows ?? defaultTimeRows
  const isOpen = openRangeLookup(policy)

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
              <td style={{ ...headCellStyle, fontWeight: 600, fontSize: 11 }}>{time}</td>
              {DAY_COLS.map((day, i) => {
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
                      verticalAlign: 'top', padding: '4px 5px', height: 34,
                      background: !open
                        ? 'repeating-linear-gradient(45deg, var(--neutral-25), var(--neutral-25) 4px, var(--neutral-50) 4px, var(--neutral-50) 8px)'
                        : names.length > 0 ? `rgba(182, 0, 5, ${alpha})` : 'var(--neutral-0)',
                    }}
                  >
                    {!open ? (
                      <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>휴관</span>
                    ) : names.length === 0 ? null : (
                      <span style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--text-strong)', wordBreak: 'keep-all' }}>
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
  fontSize: 12, fontWeight: 700,
  padding: '6px 4px', textAlign: 'center',
}

// ---- 2단계: 제약 기반 생성 ----

function GenerateStage({ form, onChange, startDateIso, endDateIso, submitting, error, onSubmit, submittedCount }) {
  const notMonday = startDateIso && !isMondayIso(startDateIso)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      <AdminPanel title="적용되는 제약 조건" right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>부서 정책 기준 · 항상 적용</span>}>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          아래 필수 제약(Hard Constraint)은 부서 스케줄링 정책에 정의되어 있어 생성 시 항상 적용됩니다.
          화면에서 켜고 끄지 않습니다 — 값을 바꾸려면 부서 정책을 수정해야 합니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {APPLIED_CONSTRAINTS.map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--neutral-25)' }}>
              <CircleCheck size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</span>
                <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{desc}</span>
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
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--warning)' }}>
                월요일로 시작하는 것을 권장합니다 (주간 상한이 월~일 기준으로 계산됩니다).
              </p>
            )}
          </div>
          <div>
            <FieldLabel required>생성 기간</FieldLabel>
            <select value={form.numDays} onChange={e => onChange('numDays', Number(e.target.value))} style={selectStyle}>
              <option value={7}>1주 (7일)</option>
              <option value={14}>2주 (14일) · 권장</option>
              <option value={21}>3주 (21일)</option>
              <option value={28}>4주 (28일)</option>
            </select>
            {endDateIso && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-subtle)' }}>
                {isoToDots(startDateIso)} ~ {isoToDots(endDateIso)}
              </p>
            )}
          </div>
          <div>
            <FieldLabel>풀이 시간 제한 (초)</FieldLabel>
            <input type="number" min={1} max={120} value={form.timeLimit}
              onChange={e => onChange('timeLimit', e.target.value)} style={inputStyle} />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-subtle)' }}>배정안 하나당 상한 (1~120초)</p>
          </div>
          <div>
            <FieldLabel>비교할 배정안 개수</FieldLabel>
            <select value={form.numAlternatives} onChange={e => onChange('numAlternatives', Number(e.target.value))} style={selectStyle}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}개</option>)}
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-subtle)' }}>동률 배정안을 여러 개 받아 비교합니다</p>
          </div>
        </div>
      </AdminPanel>

      {submittedCount === 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--warning)' }}>
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
        <p style={{ margin: 0, textAlign: 'right', fontSize: 12, color: 'var(--text-subtle)' }}>
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
      slotLabels[key] = v.names.length === 1 ? v.names[0] : `${v.names[0]} 외 ${v.names.length - 1}`
      slotColors[key] = 'var(--sogang-red)'
    } else {
      slotLabels[key] = '미충원'
      slotColors[key] = 'var(--warning)'
    }
  })
  return { rows, filledSlots, slotLabels, slotColors, assignedCount: rowsOf.length, shortageCount: shortages.length }
}

function ReviewStage({ draft, planIndex, onPick, weekIndex, onWeek }) {
  const plan = draft.plans[planIndex]
  const weeks = useMemo(() => splitWeeks(draft), [draft])
  const week = weeks[Math.min(weekIndex, weeks.length - 1)]
  const grid = useMemo(() => (week ? buildWeekGrid(plan, week) : null), [plan, week])
  const metrics = planMetrics(plan)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--info-50)', border: '1px solid var(--info-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--info)' }}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>아래 결과는 <b>초안</b>입니다. 미충원 칸과 개인별 시간 집계를 확인한 뒤 4단계에서 확정하면 근무표로 저장됩니다.</span>
      </div>

      {draft.plans.length > 1 && (
        <AdminPanel title="배정안 비교" right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>동률 배정안 {draft.plans.length}개</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(draft.plans.length, 3)}, 1fr)`, gap: 14 }}>
            {draft.plans.map((p, i) => {
              const m = planMetrics(p)
              const on = i === planIndex
              return (
                <div key={i} onClick={() => onPick(i)} style={{ cursor: 'pointer', border: `1.5px solid ${on ? 'var(--sogang-red)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-lg)', padding: 18, position: 'relative' }}>
                  {i === 0 && <span style={{ position: 'absolute', top: -10, left: 16, background: 'var(--sogang-red)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 5 }}>기본안</span>}
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 12 }}>배정안 {String.fromCharCode(65 + i)}</div>
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
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.6 }}>
              {isoToDots(week.start)} ~ {isoToDots(week.end)} · 배정 {grid.assignedCount}건
              {grid.shortageCount > 0 && <> · <span style={{ color: 'var(--warning)', fontWeight: 700 }}>미충원 {grid.shortageCount}칸</span></>}
              {' '}— 배정된 칸에는 학생 이름이, 최소 인원을 못 채운 칸에는 <span style={{ color: 'var(--warning)', fontWeight: 700 }}>미충원</span>이 표시됩니다.
            </p>
            <TimeGrid
              rows={grid.rows} classSlots={grid.filledSlots}
              slotLabels={grid.slotLabels} slotColors={grid.slotColors} legend={false}
            />
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
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
                    <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{s.student_name}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>{s.funding_type === 'gukga' ? '국가' : '교비'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'center', fontWeight: 700, color: s.total_hours > 0 ? 'var(--text-strong)' : 'var(--text-subtle)' }}>{s.total_hours}h</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {Object.entries(s.weekly_hours ?? {}).map(([w, h]) => `${w.split('-')[1]} ${h}h`).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminPanel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AdminPanel title="Soft Constraint 희생량" right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>낮을수록 좋음</span>}>
            {Object.keys(plan.penalty_summary ?? {}).length === 0 ? (
              <EmptyNote>페널티 없이 배정되었습니다.</EmptyNote>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(plan.penalty_summary).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
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
                        <td style={{ padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap' }}>{isoToDots(s.date)} ({s.day_of_week})</td>
                        <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'center', whiteSpace: 'nowrap' }}>{hhmm(s.start_time)}–{hhmm(s.end_time)}</td>
                        <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'center', color: 'var(--warning)', fontWeight: 700 }}>{s.assigned}/{s.required}</td>
                        <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
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
  if (!plan) {
    return <AdminPanel><EmptyNote>확정할 배정안이 없습니다. 이전 단계에서 근무표를 생성해 주세요.</EmptyNote></AdminPanel>
  }

  if (confirmed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AdminPanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><CalendarCheck size={32} color="var(--success)" /></span>
            <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표가 확정되었습니다</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              배정안 {String.fromCharCode(65 + planIndex)} · {confirmed.confirmed_count}건 저장 · 배치 #{confirmed.batch_id}<br />
              {isoToDots(draft.requested.startDate)} ~ {isoToDots(draft.requested.endDate)} 기간의 확정 근무표로 학생 화면에 노출됩니다.
            </p>
            <Button variant="secondary" onClick={onRestart}><CalendarDays size={14} /> 다른 기간 근무표 생성</Button>
          </div>
        </AdminPanel>

        <AdminPanel title="저장된 확정 근무표" right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{saved ? `${saved.length}건` : '조회 중'}</span>}>
          {saved === null ? <EmptyNote>저장된 근무표를 불러오는 중...</EmptyNote> : <SavedByDate rows={saved} />}
        </AdminPanel>
      </div>
    )
  }

  const m = planMetrics(plan)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AdminPanel>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
          <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><CalendarCheck size={32} color="var(--success)" /></span>
          <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표를 확정하시겠습니까?</h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 560 }}>
            배정안 {String.fromCharCode(65 + planIndex)} · 배정 {m.assigned}건 · 미충원 {m.shortage}칸 · 배정 편차 {m.balanceGap}시간 · 선발 학생 {hiredCount}명<br />
            {isoToDots(draft.requested.startDate)} ~ {isoToDots(draft.requested.endDate)} 기간으로 저장되며, 확정 후 학생 화면에서 조회됩니다.
            같은 기간을 이미 확정했다면 이전 확정본은 대체됩니다.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onBack} disabled={confirming}>다시 검토</Button>
            <Button onClick={onConfirm} disabled={confirming}><Check size={14} /> {confirming ? '확정 중...' : '시간표 확정'}</Button>
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
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
              {isoToDots(date)} <span style={{ color: 'var(--text-subtle)', fontWeight: 600 }}>({list[0].day_of_week})</span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{list.length}건</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {list.slice().sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))).map(r => (
              <div key={r.schedule_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
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
              background: done ? 'var(--success)' : (active ? 'var(--sogang-red)' : '#fff'),
              border: `2px solid ${done ? 'var(--success)' : (active ? 'var(--sogang-red)' : 'var(--border-default)')}`,
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {done ? <Check size={13} strokeWidth={3} /> : (i + 1)}
            </span>
            <span style={{ marginLeft: 10, fontSize: 13, fontWeight: active ? 700 : 500, color: (done || active) ? 'var(--text-strong)' : 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{s}</span>
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
      <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: tone }}>{value}</div>
    </div>
  )
}

function FieldLabel({ children, required }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--text-body)', fontWeight: 600, marginBottom: 6 }}>
      {children} {required && <span style={{ color: 'var(--sogang-red)' }}>*</span>}
    </div>
  )
}

function EmptyNote({ children }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>{children}</div>
}

function ErrorNote({ message }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--sogang-red)' }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  )
}

function th(t, align, width) {
  return <th style={{ padding: '9px 12px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>
}

const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const inputStyle = {
  width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
}
const selectStyle = { ...inputStyle, background: '#fff', color: 'var(--text-body)', cursor: 'pointer' }
const weekTabStyle = on => ({
  height: 28, padding: '0 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
  border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-default)'}`,
  background: on ? 'var(--sogang-red-50)' : '#fff', color: on ? 'var(--sogang-red)' : 'var(--text-body)',
})
