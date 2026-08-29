import { useEffect, useMemo, useState } from 'react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import StatusPill from '../../components/ui/StatusPill'
import TimeGrid from '../../components/ui/TimeGrid'
import DatePicker from '../../components/ui/DatePicker'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import { AdminPanel } from '../../components/admin/AdminPanel'
import { mondayOfIso } from '../../components/ui/MonthCalendar'
import { adminStatusSlug } from '../../utils/adminStatus'
import { formatDate } from '../../utils/format'
import { getSessionUser } from '../../utils/session'
import {
  fetchDepartmentStudents,
  updateStudentActivePeriod,
  fetchAvailabilityDates,
  fetchDepartmentClassTimeDates,
  fetchDepartmentPolicy,
  fetchDepartmentSchedule,
  fetchDepartmentSubstituteRequests,
  fetchTerms,
} from '../../api/client'
import { termLabel } from '../../utils/terms'

const pad2 = n => String(n).padStart(2, '0')
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const minToHhmm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
const isoToDots = iso => (iso ? iso.replaceAll('-', '.') : '')
const dotsToIso = dots => (dots ? dots.replaceAll('.', '-') : '')

const addDaysIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}
const todayIsoDate = () => {
  const t = new Date()
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`
}
// 다음 주 월요일 — 근무표 생성 화면의 기본 기간과 같은 기준(AdminSchedulePage.nextMondayIso).
// 이번 주는 이미 확정된 근무가 도는 주라, 담당자가 수합을 확인하는 대상은 다음 주부터다.
const nextMondayIso = () => {
  const t = new Date()
  const shift = (8 - t.getDay()) % 7 || 7
  const dt = new Date(t.getFullYear(), t.getMonth(), t.getDate() + shift)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

// 그 주(월~일 7일)가 가장 많이 걸친 학기 키. 가능 시간은 학기 단위로 저장되는데
// 개강 주처럼 한 주가 두 학기에 걸치는 경우가 있어, 날짜 수로 다수결을 낸다.
function weekTermKey(terms, weekStartIso) {
  if (!terms?.length) return null
  const days = {}
  for (let i = 0; i < 7; i += 1) {
    const iso = addDaysIso(weekStartIso, i)
    const hit = terms.find(t => iso >= t.start.slice(0, 10) && iso <= t.end.slice(0, 10))
    if (hit) days[hit.key] = (days[hit.key] ?? 0) + 1
  }
  const entries = Object.entries(days)
  if (entries.length === 0) return null
  return entries.reduce((a, b) => (a[1] >= b[1] ? a : b))[0]
}

const DAY_LABELS = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' }
const FUNDING_LABELS = { gyobi: '교비', gukga: '국가' }

// 확정 근무 목록(날짜 단위, REQ-SCHED-010) → TimeGrid 슬롯 키로 펼침 (30분 단위 —
// 배정이 30분 단위라 60분 스텝이면 09:30 시작·30분 근무가 표에서 사라진다).
// 실제 배정은 주차마다 달라질 수 있으므로, 여기서는 "이 학생이 그 요일·시간대에 근무한 적이 있다"는
// 요약 표시일 뿐 — 특정 한 주의 확정 시간표를 그대로 보여주는 것은 아니다.
function scheduleToSlotKeys(rows) {
  const keys = new Set()
  for (const r of rows) {
    for (let m = toMin(r.start_time); m + 30 <= toMin(r.end_time); m += 30) {
      keys.add(`${r.day_of_week}-${minToHhmm(m)}`)
    }
  }
  return [...keys]
}

// 수합 API(요일 정수 1~7 + 시간 구간) → TimeGrid 슬롯 키 (30분 스텝)
function rowsToSlotKeys(rows, dayOf) {
  const keys = new Set()
  for (const r of rows) {
    const day = dayOf(r)
    if (!day) continue
    for (let m = toMin(r.start_time); m + 30 <= toMin(r.end_time); m += 30) {
      keys.add(`${day}-${minToHhmm(m)}`)
    }
  }
  return [...keys]
}

// 부서 개관 시간(정책)에서 시간표 그리드의 30분 행을 만든다 — 못 불러오면 TimeGrid 기본 행
function policyRows(policy) {
  if (!policy) return undefined
  const start = toMin(policy.grid_start_time)
  const end = toMin(policy.grid_end_time)
  const rows = []
  for (let m = start; m + 30 <= end; m += 30) rows.push(minToHhmm(m))
  return rows.length > 0 ? rows : undefined
}

// 요일별 가능 시간 합 (30분 슬롯 수 × 0.5) — 가능 시간표 맨 아래 요약 행용
function dayHourTotals(slotKeys) {
  const values = {}
  Object.values(DAY_LABELS).forEach(day => {
    const h = slotKeys.filter(k => k.startsWith(`${day}-`)).length * 0.5
    values[day] = Number.isInteger(h) ? String(h) : h.toFixed(1)
  })
  return values
}

function totalHours(rows) {
  return rows.reduce((sum, r) => sum + (toMin(r.end_time) - toMin(r.start_time)) / 60, 0)
}

// iso 날짜 → 요일 라벨 ('월'~'일')
function dayLabelOfIso(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()]
}

export default function AdminStudentsPage() {
  const user = getSessionUser()
  const [members, setMembers] = useState(null) // null = 로딩 중 — 부서 소속(=부서 공고 합격자) 학생 정보
  const [schedules, setSchedules] = useState(null) // 확정 근무 — 로딩 실패해도 로스터 자체는 보여야 하므로 별도 상태
  const [classTime, setClassTime] = useState(null) // 학생 직접 입력 수업 시간 (그 주의 날짜별)
  const [policy, setPolicy] = useState(null) // 그리드 세로축(개관 시간) 기준
  const [loadError, setLoadError] = useState('')
  const [subRequests, setSubRequests] = useState(null) // 대타 이력 — 마찬가지로 별도 상태
  const [selId, setSelId] = useState(null)

  // 주차별 가능 시간 — 주간 패턴에 그 주의 날짜 예외(그날 불가/추가 가능)가 반영된 값.
  // 기본값이 '이번 주'면 학기 마지막 주(방학 끝자락)에 화면을 열었을 때 다음 학기 수합이
  // 통째로 안 보인다 (#184). 근무표 생성 화면과 같이 '다음 주'를 기본으로 둔다.
  const [weekStart, setWeekStart] = useState(nextMondayIso)
  const [weekAvail, setWeekAvail] = useState(null) // 그 주의 날짜별 가능 시간 rows
  const [terms, setTerms] = useState([]) // 학기 선택기 — 가능 시간·수업 시간표가 학기 단위라 필요
  const weekEnd = addDaysIso(weekStart, 6)
  const weekTerm = weekTermKey(terms, weekStart)

  // 활동 기간 편집 상태
  const [editingPeriod, setEditingPeriod] = useState(false)
  // 근로 구분 — SAINT로는 교비 학생만 신청하고 국가는 장학재단 배정이라 학생이 못 고른다.
  // 주당 상한(교비 14h / 국가 20h)이 달라지므로 담당자가 직접 관리한다
  const [savingFunding, setSavingFunding] = useState(false)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodUntil, setPeriodUntil] = useState('')
  const [savingPeriod, setSavingPeriod] = useState(false)
  const [periodError, setPeriodError] = useState('')

  useEffect(() => {
    if (!user?.department_id) { setLoadError('로그인 정보에 소속 부서가 없습니다.'); setMembers([]); return }
    let alive = true

    // 부서 소속 판정은 백엔드와 동일 기준(부서 공고 합격자) — 학과·연락처·재원 구분·
    // 활동 기간까지 이 API 한 번으로 가져온다 (기존 공고×지원자 N+1 조합 대체)
    fetchDepartmentStudents(user.department_id)
      .then(rows => { if (alive) setMembers(rows) })
      .catch(err => { if (alive) setLoadError(err.message) })

    fetchDepartmentSchedule(user.department_id)
      .then(rows => { if (alive) setSchedules(rows) })
      .catch(() => { if (alive) setSchedules([]) })
    fetchDepartmentPolicy(user.department_id)
      .then(setPolicy)
      .catch(() => { if (alive) setPolicy(null) })
    fetchDepartmentSubstituteRequests(user.department_id)
      .then(rows => { if (alive) setSubRequests(rows) })
      .catch(() => { if (alive) setSubRequests([]) })
    return () => { alive = false }
  }, [user?.department_id])

  // 학기 선택기가 쓰는 목록 — 주차 이동만으로는 "다른 학기를 보고 있다"가 드러나지 않는다
  useEffect(() => {
    let alive = true
    fetchTerms()
      .then(res => { if (alive) setTerms(res.terms ?? []) })
      .catch(() => { if (alive) setTerms([]) })
    return () => { alive = false }
  }, [])

  // 수업 시간표도 가능 시간과 같이 날짜로 받는다 — 학기마다 시간표가 다르고 개강 주처럼
  // 한 주가 학기 경계를 넘을 수 있어, 주간 패턴 하나로는 그 주를 정확히 그릴 수 없다.
  // (#186이 이 방식으로 바꿨다 — 학기 하나로 한 주를 덮던 이 브랜치의 방식보다 정확하다)
  useEffect(() => {
    if (!user?.department_id) return
    let alive = true
    fetchDepartmentClassTimeDates(user.department_id, weekStart, weekEnd)
      .then(rows => { if (alive) setClassTime(rows) })
      .catch(() => { if (alive) setClassTime([]) })
    return () => { alive = false }
  }, [user?.department_id, weekStart, weekEnd])

  // 주가 바뀔 때마다 그 주의 날짜별 가능 시간을 다시 가져온다 (예외 반영)
  useEffect(() => {
    if (!user?.department_id) return
    let alive = true
    setWeekAvail(null)
    fetchAvailabilityDates(user.department_id, weekStart, weekEnd)
      .then(rows => { if (alive) setWeekAvail(rows) })
      .catch(() => { if (alive) setWeekAvail([]) })
    return () => { alive = false }
  }, [user?.department_id, weekStart, weekEnd])

  // 학생별로 확정 근무·수업 시간·이번 주 가능 시간을 붙인다 (없으면 빈 배열)
  const roster = useMemo(() => {
    if (!members) return []
    const group = rows => {
      const map = new Map()
      for (const row of rows ?? []) {
        if (!row.student_id) continue
        if (!map.has(row.student_id)) map.set(row.student_id, [])
        map.get(row.student_id).push(row)
      }
      return map
    }
    const scheduleBy = group(schedules)
    const classBy = group(classTime)
    const weekBy = group(weekAvail)
    return members.map(m => {
      const weekRows = weekBy.get(m.student_id) ?? []
      return {
        ...m,
        rows: scheduleBy.get(m.student_id) ?? [],
        classSlotKeys: rowsToSlotKeys(classBy.get(m.student_id) ?? [], r => dayLabelOfIso(r.date)),
        weekSlotKeys: rowsToSlotKeys(weekRows, r => dayLabelOfIso(r.date)),
        weekHours: totalHours(weekRows),
      }
    })
  }, [members, schedules, classTime, weekAvail])

  useEffect(() => {
    if (roster.length > 0 && (!selId || !roster.some(x => x.student_id === selId))) {
      setSelId(roster[0].student_id)
    }
  }, [roster, selId])

  const selected = roster.find(x => x.student_id === selId)
  const selectedSubs = subRequests?.filter(r => r.requester_id === selId) ?? []
  const gridRows = policyRows(policy)
  const thisMonday = mondayOfIso(todayIsoDate())

  const startPeriodEdit = () => {
    setPeriodFrom(isoToDots(selected?.active_from ?? ''))
    setPeriodUntil(isoToDots(selected?.active_until ?? ''))
    setPeriodError('')
    setEditingPeriod(true)
  }

  const saveFunding = async fundingType => {
    setSavingFunding(true)
    try {
      const updated = await updateStudentActivePeriod(selected.student_id, {
        active_from: selected.active_from ?? null,
        active_until: selected.active_until ?? null,
        funding_type: fundingType || null,
      })
      setMembers(prev => prev.map(m => (m.student_id === updated.student_id ? { ...m, ...updated } : m)))
    } finally {
      setSavingFunding(false)
    }
  }

  const savePeriod = async () => {
    setSavingPeriod(true)
    setPeriodError('')
    try {
      const updated = await updateStudentActivePeriod(selected.student_id, {
        active_from: dotsToIso(periodFrom) || null,
        active_until: dotsToIso(periodUntil) || null,
      })
      setMembers(prev => prev.map(m => (m.student_id === updated.student_id ? { ...m, ...updated } : m)))
      setEditingPeriod(false)
    } catch (e) {
      setPeriodError(e.message)
    } finally {
      setSavingPeriod(false)
    }
  }

  return (
    <AdminShell activeMenu="students">
      <PageTitle>학생 관리</PageTitle>
      <p style={{ margin: '0 0 20px 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>본인 부서 공고에 합격한 근로 학생의 정보·가능 시간·배정 현황과 대타 이력을 관리합니다.</p>

      {loadError ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--danger)' }}>{loadError}</p></AdminPanel>
      ) : !members ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>불러오는 중...</p></AdminPanel>
      ) : roster.length === 0 ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>합격 처리된 학생이 없습니다. 학생 선발에서 합격 처리하면 이 화면에 표시됩니다.</p></AdminPanel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: 18, alignItems: 'start' }}>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>선발 학생 ({roster.length}명)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--saint-tan)' }}>
                  {th('이름')}{th('학과')}{th('구분', 'center')}{th('활동 시작일', 'center')}{th('배정', 'center')}
                </tr>
              </thead>
              <tbody>
                {roster.map(x => {
                  const on = x.student_id === selId
                  return (
                    <tr key={x.student_id} onClick={() => { setSelId(x.student_id); setEditingPeriod(false) }} style={{ borderBottom: '1px solid var(--border-subtle)', background: on ? 'var(--saint-row-hover)' : 'var(--surface-card)', cursor: 'pointer' }}>
                      <td style={{ padding: '11px 14px', borderLeft: `3px solid ${on ? 'var(--sogang-red)' : 'transparent'}` }}>
                        <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)' }}>{x.name ?? x.student_id}</div>
                        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{x.student_id}</div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>{x.department_name ?? '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 'var(--fs-sm)', textAlign: 'center', color: 'var(--text-body)' }}>{FUNDING_LABELS[x.funding_type] ?? '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 'var(--fs-sm)', textAlign: 'center', color: 'var(--text-body)', whiteSpace: 'nowrap' }}>{x.active_from ? formatDate(x.active_from) : '무제한'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 'var(--fs-sm)', textAlign: 'center', whiteSpace: 'nowrap' }}>{totalHours(x.rows)}시간</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <AdminPanel>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 800, color: 'var(--text-strong)' }}>{selected.name ?? selected.student_id}</h2>
                    <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)', marginTop: 4 }}>{selected.student_id}</div>
                  </div>
                </div>

                {/* 기본 정보 — 학과·연락처·재원 구분·활동 기간(담당자 관리 값, 없으면 공고 기간 파생) */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['학과', selected.department_name ?? '—'],
                      ['연락처', selected.phone ?? '—'],
                    ].map(([label, value]) => (
                      <tr key={label} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={infoLabelStyle}>{label}</td>
                        <td style={infoValueStyle}>{value}</td>
                      </tr>
                    ))}
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={infoLabelStyle}>근로 구분</td>
                      <td style={infoValueStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 150 }}>
                            <Select
                              size="sm"
                              value={selected.funding_type ?? ''}
                              disabled={savingFunding}
                              onChange={e => saveFunding(e.target.value)}
                            >
                              <option value="">미지정</option>
                              <option value="gyobi">교비 근로</option>
                              <option value="gukga">국가 근로</option>
                            </Select>
                          </div>
                          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
                            주당 상한이 달라집니다 (교비 14시간 / 국가 20시간)
                          </span>
                        </div>
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={infoLabelStyle}>활동 기간</td>
                      <td style={infoValueStyle}>
                        {editingPeriod ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ width: 130 }}><DatePicker value={periodFrom} onChange={setPeriodFrom} /></div>
                            <span style={{ color: 'var(--text-subtle)' }}>~</span>
                            <div style={{ width: 130 }}><DatePicker value={periodUntil} onChange={setPeriodUntil} /></div>
                            <Button size="sm" onClick={savePeriod} disabled={savingPeriod}>{savingPeriod ? '저장 중...' : '저장'}</Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditingPeriod(false)} disabled={savingPeriod}>취소</Button>
                            {periodError && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{periodError}</span>}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span>
                              {selected.active_from ? formatDate(selected.active_from) : '무제한'} ~ {selected.active_until ? formatDate(selected.active_until) : '무제한'}
                            </span>
                            <span style={{ fontSize: 'var(--fs-caption)', color: selected.active_source === 'student' ? 'var(--sogang-red)' : 'var(--text-subtle)' }}>
                              {selected.active_source === 'student' ? '직접 관리' : '공고 기간 기준'}
                            </span>
                            <button type="button" onClick={startPeriodEdit} style={{ border: 'none', background: 'none', padding: 0, fontSize: 'var(--fs-sm)', color: 'var(--info)', cursor: 'pointer', fontFamily: 'var(--font-sans)', textDecoration: 'underline' }}>수정</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </AdminPanel>

              <AdminPanel
                title="근무 가능 시간표"
                right={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* 가능 시간은 학기 단위로 저장된다 — 주차만으로 움직이면 "다른 학기를 보고 있다"는
                        사실이 드러나지 않아, 낸 적 없는 학기를 미제출로 오해하게 된다 (#184).
                        학기를 고르면 그 학기 시작일이 든 주로 넘어간다 */}
                    {terms.length > 0 && (
                      <Select
                        size="sm"
                        style={{ width: 190 }}
                        value={weekTerm ?? ''}
                        onChange={e => {
                          const hit = terms.find(t => t.key === e.target.value)
                          if (hit) setWeekStart(mondayOfIso(hit.start))
                        }}
                      >
                        {weekTerm === null && <option value="">학기 밖</option>}
                        {terms.map(t => (
                          <option key={t.key} value={t.key}>{t.label}{t.current ? ' (진행 중)' : ''}</option>
                        ))}
                      </Select>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, -7))} style={weekNavStyle}>◀</button>
                      {/* 연도는 학기 선택기가 이미 달고 있어 월.일만 — 한 줄에 들어와야
                          제목·학기·주차가 세 줄로 흩어지지 않는다 */}
                      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-body)', whiteSpace: 'nowrap' }}>
                        {isoToDots(weekStart).slice(5)} ~ {isoToDots(weekEnd).slice(5)}
                      </span>
                      <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, 7))} style={weekNavStyle}>▶</button>
                      {weekStart !== thisMonday && (
                        <Button size="sm" variant="secondary" onClick={() => setWeekStart(thisMonday)}>이번 주</Button>
                      )}
                    </div>
                  </div>
                }
              >
                {weekAvail === null ? (
                  <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>이 주의 가능 시간을 불러오는 중...</p>
                ) : selected.weekSlotKeys.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-subtle)', lineHeight: 1.6 }}>
                    <b style={{ color: 'var(--text-body)' }}>{termLabel(terms, weekTerm) || '이 학기'}</b>
                    {' '}{isoToDots(weekStart)} ~ {isoToDots(weekEnd)} 주에는 가능 시간이 없습니다.
                    {' '}미제출이거나 그날 불가 예외가 등록된 주일 수 있고,
                    다른 학기에 낸 시간은 위 학기 선택기에서 그 학기를 골라야 보입니다.
                  </p>
                ) : (
                  <>
                    <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      선택한 주의 <b style={{ color: 'var(--text-body)' }}>실제 가능 시간</b>입니다 — 주간 반복 패턴에 그 주의
                      날짜 예외(그날 불가·추가 가능)가 반영됩니다. 붉은 칸(수업)은 학생이 직접 입력한 수업 시간,
                      맨 아래 행은 요일별 가능 시간 합계입니다.
                    </p>
                    <TimeGrid
                      rows={gridRows} rowHeight={17}
                      classSlots={selected.classSlotKeys} classLabel="수업"
                      availableSlots={selected.weekSlotKeys}
                      availableLegendText={`근무 가능 시간: 총 ${selected.weekHours}시간`}
                      classLegendText="수업 시간 (학생 직접 입력, SAINT 연동 전)"
                      footer={{ label: '가능 시간', values: dayHourTotals(selected.weekSlotKeys) }}
                    />
                  </>
                )}
              </AdminPanel>

              <AdminPanel title="확정 근무 요일·시간대">
                {selected.rows.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>아직 확정된 근무가 없습니다. 근무표 생성·확정 후 표시됩니다.</p>
                ) : (
                  <TimeGrid rows={gridRows} rowHeight={17} classSlots={[]} availableSlots={scheduleToSlotKeys(selected.rows)} editable={false} availableLegendText="확정 근무" />
                )}
              </AdminPanel>

              <AdminPanel title={`대타 이력 (${selectedSubs.length}건)`}>
                {selectedSubs.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'var(--saint-tan)' }}>{th('날짜')}{th('시간')}{th('사유')}{th('상태', 'center')}</tr></thead>
                    <tbody>
                      {selectedSubs.map(s => (
                        <tr key={s.request_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '11px 16px', fontSize: 'var(--fs-body)' }}>{formatDate(s.date)}</td>
                          <td style={{ padding: '11px 16px', fontSize: 'var(--fs-body)' }}>{s.start_time?.slice(0, 5)}-{s.end_time?.slice(0, 5)}</td>
                          <td style={{ padding: '11px 16px', fontSize: 'var(--fs-body)' }}>{s.reason || '-'}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(s.status)} label={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)', padding: '6px 0' }}>대타 이력이 없습니다.</div>}
              </AdminPanel>

            </div>
          )}
        </div>
      )}
    </AdminShell>
  )
}

const infoLabelStyle = { padding: '8px 10px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--saint-maroon)', background: 'var(--saint-tan-soft)', width: 110 }
const infoValueStyle = { padding: '8px 12px', fontSize: 'var(--fs-body)', color: 'var(--text-body)' }
const weekNavStyle = {
  width: 26, height: 26, border: '1px solid var(--border-default)', borderRadius: 6,
  background: 'var(--surface-card)', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', cursor: 'pointer',
}

function th(t, align) {
  return <th style={{ padding: '11px 16px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap' }}>{t}</th>
}
