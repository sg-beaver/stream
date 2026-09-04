import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, Info, UserMinus, UserPlus, Users } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import EmptyState from '../../components/ui/EmptyState'
import Tabs from '../../components/ui/Tabs'
import DepartmentAvailability from '../../components/admin/DepartmentAvailability'
import {
  assignCourseTa, fetchCourses, fetchCourseTaCandidates, unassignCourseTa,
} from '../../api/client'
import { getSessionUser } from '../../utils/session'

// 수업 조교 — 학과를 고르면 그 학기 개설 과목이 주간 시간표로 정리되고, 과목마다
// 배정된 TA가 보인다. 근무 단위가 시간대가 아니라 **과목**인 부서를 위한 화면이다
// (같은 시간에 여러 과목이 열려, 시간 격자만으로는 누가 어느 수업에 들어가는지 말할 수 없다).
//
// 배정은 담당자가 직접 한다. 막아야 할 조합(본인 수강 시간 겹침·이미 맡은 과목과 겹침·
// 과목 수 상한)은 서버가 판정하고, 화면은 그 사유를 그대로 보여준다 — 눌러 보고
// 오류를 받는 흐름을 만들지 않기 위해 후보 목록에 미리 표시한다.

// 배정(과목에 조교 붙이기)과 그 근거(학생 가능 시간)를 같은 화면에서 오간다 —
// 근무표 편성의 진입 탭과 같은 구성이라 담당자가 두 화면을 같은 방식으로 읽는다.
const TABS = [
  { id: 'assign', label: '수업 조교 편성' },
  { id: 'availability', label: '가능 시간 확인' },
]

const DAYS = [
  { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
  { value: 4, label: '목' }, { value: 5, label: '금' },
]

// 세로 범위는 실제 수업 시간에서 뽑는다 — 22시까지 고정으로 그리면 저녁 수업이 없는
// 학기엔 화면의 3할이 빈 칸이 되고 그만큼 카드가 납작해져 과목명이 안 보인다.
const DEFAULT_RANGE = [9 * 60, 18 * 60]
const PX_PER_MIN = 0.62
const SNAP = 60                  // 정시 경계로 맞춰야 시간축 눈금과 어긋나지 않는다

const toMin = t => {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
function gridRange(courses) {
  const times = courses.flatMap(c => c.meetings.flatMap(m => [toMin(m.start_time), toMin(m.end_time)]))
  if (!times.length) return DEFAULT_RANGE
  return [
    Math.min(DEFAULT_RANGE[0], Math.floor(Math.min(...times) / SNAP) * SNAP),
    Math.max(DEFAULT_RANGE[1], Math.ceil(Math.max(...times) / SNAP) * SNAP),
  ]
}

// 같은 요일에 시간이 겹치는 과목들을 가로로 나눠 놓기 위한 열 계산.
// 금 10:30~13:15에만 4과목이 열리는 학기가 있어, 겹침 처리가 없으면 카드가 서로 가린다.
function layoutDay(cards) {
  const sorted = [...cards].sort((a, b) => a.start - b.start || a.end - b.end)
  const groups = []
  sorted.forEach(card => {
    const group = groups.find(g => g.some(c => c.start < card.end && card.start < c.end))
    if (group) group.push(card)
    else groups.push([card])
  })
  const placed = []
  groups.forEach(group => {
    // 한 그룹 안에서 서로 겹치지 않는 카드는 같은 열을 다시 쓴다
    const columns = []
    group.forEach(card => {
      let index = columns.findIndex(col => col.every(c => c.end <= card.start || card.end <= c.start))
      if (index === -1) { columns.push([]); index = columns.length - 1 }
      columns[index].push(card)
      placed.push({ ...card, column: index })
    })
    placed.slice(-group.length).forEach(card => { card.columns = columns.length })
  })
  return placed
}

export default function AdminCoursesPage() {
  const user = getSessionUser()
  const departmentId = user?.department_id

  const [data, setData] = useState(null)
  // 빈 문자열이면 서버가 학기를 고른다 (오늘 기준 학기 → 과목이 없으면 과목이 있는 최근 학기)
  const [term, setTerm] = useState('')
  const [major, setMajor] = useState('')
  const [tab, setTab] = useState('assign')
  const [selectedId, setSelectedId] = useState(null)
  const [candidates, setCandidates] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = async (nextMajor = major, nextTerm = term) => {
    if (!departmentId) return
    try {
      const body = await fetchCourses(departmentId, {
        term: nextTerm || undefined,
        department_name: nextMajor || undefined,
      })

      setData(body)
      setLoadError('')
      // 서버가 고른 학기를 선택기에 반영한다 — 어느 학기를 보고 있는지 화면에 남아야 한다
      if (!nextTerm && body.term) setTerm(body.term)
      // 학과를 아직 고르지 않았으면 우리 부서 학과를 먼저 보여준다 — 단과대 과목이
      // 함께 들어 있어(43과목) 전체를 한 격자에 그리면 읽을 수 없다.
      // 부서명("아트&테크놀로지학과-test")에 학과명이 들어 있는 것을 고르고,
      // 못 찾으면 과목이 가장 많은 학과로 떨어진다.
      if (!nextMajor && !major && body.department_names?.length) {
        const own = body.department_names.find(
          name => (user?.department_name ?? '').includes(name),
        )
        if (own) {
          setMajor(own)
        } else {
          const counts = {}
          body.courses.forEach(c => { counts[c.department_name] = (counts[c.department_name] ?? 0) + 1 })
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
          if (top) setMajor(top[0])
        }
      }
    } catch (e) {
      setLoadError(`개설 과목을 불러오지 못했습니다. ${e.message}`)
    }
  }

  useEffect(() => {
    if (!departmentId) {
      setLoadError('로그인 정보에 소속 부서가 없습니다. 직원 계정으로 다시 로그인해 주세요.')
      return
    }
    load('', '')
    // 최초 1회만 — 이후에는 학기·학과 변경 effect가 다시 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId])

  useEffect(() => {
    if (major || term) load(major, term)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [major, term])

  const courses = data?.courses ?? []
  const selected = courses.find(c => c.course_id === selectedId) ?? null

  useEffect(() => {
    if (!selected || !departmentId) { setCandidates(null); return }
    let alive = true
    fetchCourseTaCandidates(departmentId, selected.course_id)
      .then(rows => { if (alive) setCandidates(rows) })
      .catch(() => { if (alive) setCandidates([]) })
    return () => { alive = false }
  }, [selected?.course_id, departmentId, notice])

  const cardsByDay = useMemo(() => {
    const result = {}
    DAYS.forEach(d => {
      const cards = []
      courses.forEach(course => {
        course.meetings
          .filter(m => m.day_of_week === d.value)
          .forEach(m => cards.push({
            key: `${course.course_id}-${m.day_of_week}-${m.start_time}`,
            course,
            start: toMin(m.start_time),
            end: toMin(m.end_time),
            room: m.room,
          }))
      })
      result[d.value] = layoutDay(cards)
    })
    return result
  }, [courses])

  const [gridStart, gridEnd] = useMemo(() => gridRange(courses), [courses])
  const height = (gridEnd - gridStart) * PX_PER_MIN
  const yOf = m => (m - gridStart) * PX_PER_MIN

  const assignedCount = courses.filter(c => c.tas.length > 0).length
  const totalTaHours = courses.reduce((sum, c) => sum + c.weekly_hours * c.tas.length, 0)

  const act = async (fn, message) => {
    setBusy(true)
    setActionError('')
    try {
      await fn()
      setNotice(message)
      await load(major, term)
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell activeMenu="courses">
      <PageTitle>수업 조교 편성</PageTitle>
      <p style={{ margin: '0 0 14px 2px', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        학과를 고르면 그 학기 개설 과목이 시간표로 정리됩니다. 과목을 클릭해 출결 체크를 맡을
        학생을 배정하세요 — 본인 수강 시간과 겹치거나 이미 맡은 과목과 겹치는 학생은 사유와 함께
        선택할 수 없게 표시됩니다.
      </p>

      <Tabs tabs={TABS} active={tab} onChange={setTab} style={{ marginBottom: 18 }} />

      {tab === 'availability' ? (
        <DepartmentAvailability
          departmentId={departmentId}
          departmentName={user?.department_name}
          // 한 시간대에 가능한 학생이 많아 이름을 다 늘어놓으면 표가 안 읽힌다 (#110)
          foldNamesOver={3}
        />
      ) : loadError ? (
        <Alert tone="danger">{loadError}</Alert>
      ) : data === null ? (
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)' }}>개설 과목을 불러오는 중...</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <Select
              value={term}
              onChange={e => { setTerm(e.target.value); setMajor(''); setSelectedId(null) }}
              style={{ width: 150 }}
            >
              {/* 과목이 등록된 학기만 고를 수 있다 — 빈 학기를 고르는 길을 만들지 않는다 */}
              {(data.available_terms?.length ? data.available_terms : [data.term]).map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </Select>
            <Select value={major} onChange={e => { setMajor(e.target.value); setSelectedId(null) }} style={{ width: 260 }}>
              <option value="">전체 학과</option>
              {(data.department_names ?? []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
            <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
              과목 {courses.length}개 · TA 배정된 과목 {assignedCount}개
              {totalTaHours > 0 && ` · 주간 TA 근무 합계 ${totalTaHours.toFixed(1)}시간`}
            </span>
          </div>

          {notice && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14, background: 'var(--success-50)', border: '1px solid var(--success-100)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-body)', color: 'var(--success)' }}>
              <CircleCheck size={15} style={{ flexShrink: 0 }} /> {notice}
            </div>
          )}

          {courses.length === 0 ? (
            <EmptyState
              icon={<Users size={22} />}
              title="이 학기에 등록된 개설 과목이 없습니다"
              message="scripts/import_courses.py 로 SAINT 개설교과목정보를 넣으면 여기에 시간표로 정리됩니다."
            />
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* 주간 시간표 */}
              <div style={{ flex: 1, minWidth: 0, background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '14px 16px' }}>
                <div style={{ display: 'flex' }}>
                  <div style={{ width: 46, flexShrink: 0 }} />
                  {DAYS.map(d => (
                    <div key={d.value} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--saint-maroon)', paddingBottom: 6 }}>
                      {d.label}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', position: 'relative' }}>
                  <div style={{ width: 46, flexShrink: 0, position: 'relative', height }}>
                    {Array.from({ length: (gridEnd - gridStart) / 60 + 1 }, (_, i) => gridStart + i * 60).map(m => (
                      <div key={m} style={{ position: 'absolute', top: yOf(m) - 6, right: 6, fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
                        {hhmm(m)}
                      </div>
                    ))}
                  </div>
                  {DAYS.map(d => (
                    <div
                      key={d.value}
                      style={{
                        flex: 1, position: 'relative', height,
                        borderLeft: '1px solid var(--saint-grid)',
                        background: `repeating-linear-gradient(to bottom, var(--neutral-100) 0 1px, transparent 1px ${60 * PX_PER_MIN}px)`,
                      }}
                    >
                      {cardsByDay[d.value].map(card => {
                        const active = card.course.course_id === selectedId
                        const staffed = card.course.tas.length > 0
                        const width = 100 / (card.columns || 1)
                        return (
                          <div
                            key={card.key}
                            onClick={() => setSelectedId(active ? null : card.course.course_id)}
                            title={`${card.course.course_code}-${card.course.section} ${card.course.title}\n${hhmm(card.start)}~${hhmm(card.end)}${card.room ? ` [${card.room}]` : ''}`}
                            style={{
                              position: 'absolute',
                              left: `calc(${(card.column || 0) * width}% + 2px)`,
                              width: `calc(${width}% - 4px)`,
                              top: yOf(card.start) + 1,
                              height: Math.max(18, (card.end - card.start) * PX_PER_MIN - 2),
                              boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer',
                              padding: '3px 5px', borderRadius: 4,
                              background: staffed ? 'var(--success-50)' : 'var(--sogang-red-50)',
                              border: `${active ? 2 : 1}px solid ${
                                active ? 'var(--sogang-red)'
                                  : staffed ? 'var(--success)' : 'var(--sogang-red-200)'
                              }`,
                              color: 'var(--saint-maroon)',
                            }}
                          >
                            <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {card.course.title}
                            </div>
                            {(card.end - card.start) * PX_PER_MIN > 38 && (
                              <div style={{ fontSize: 'var(--fs-caption)', color: staffed ? 'var(--success)' : 'var(--sogang-red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {staffed ? card.course.tas.map(t => t.name).join(', ') : 'TA 미배정'}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--success-50)', border: '1px solid var(--success)' }} /> TA 배정됨
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--sogang-red-50)', border: '1px solid var(--sogang-red-200)' }} /> 미배정
                  </span>
                </div>
              </div>

              {/* 선택한 과목의 배정 패널 */}
              <div style={{ width: 340, flexShrink: 0, background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 18px' }}>
                {!selected ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '30px 0', textAlign: 'center' }}>
                    <Users size={22} color="var(--text-subtle)" />
                    <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-subtle)', lineHeight: 1.6 }}>
                      시간표에서 과목을 클릭하면<br />그 과목의 TA를 배정할 수 있습니다.
                    </span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.4 }}>
                      {selected.title}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                      {selected.course_code}-{selected.section} · {selected.professor || '교수 미정'}<br />
                      {selected.meetings.map(m => `${DAYS.find(d => d.value === m.day_of_week)?.label ?? m.day_of_week} ${m.start_time}~${m.end_time}`).join(' · ')}<br />
                      수강생 {selected.enrolled_count ?? '-'}명 · 주 {selected.weekly_hours}시간 근무
                    </div>

                    <div style={{ margin: '14px 0 8px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-strong)' }}>
                      배정된 TA {selected.tas.length}명
                    </div>
                    {selected.tas.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>아직 없습니다.</p>
                    ) : selected.tas.map(ta => (
                      <div key={ta.student_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
                        <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-strong)' }}>
                          {ta.name} <span style={{ color: 'var(--text-subtle)', fontSize: 'var(--fs-sm)' }}>{ta.student_id}</span>
                        </span>
                        <Button
                          variant="secondary" size="sm" disabled={busy}
                          onClick={() => act(
                            () => unassignCourseTa(departmentId, selected.course_id, ta.student_id),
                            `${ta.name} 학생의 배정을 해제했습니다.`,
                          )}
                        >
                          <UserMinus size={13} /> 해제
                        </Button>
                      </div>
                    ))}

                    {actionError && (
                      <div style={{ marginTop: 10 }}><Alert tone="danger">{actionError}</Alert></div>
                    )}

                    <div style={{ margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-strong)' }}>배정할 학생</span>
                      <span title="회색으로 표시된 학생은 서버가 막는 조합입니다 — 본인 수강 시간과 겹치거나, 이미 맡은 과목과 겹치거나, 과목 수·근로시간 상한을 넘는 경우입니다."
                        style={{ display: 'inline-flex', cursor: 'help', color: 'var(--text-subtle)' }}>
                        <Info size={13} />
                      </span>
                    </div>
                    {candidates === null ? (
                      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-subtle)' }}>불러오는 중...</p>
                    ) : (
                      <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        {candidates.map(c => (
                          <div
                            key={c.student_id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              gap: 8, padding: '8px 0', borderTop: '1px solid var(--border-subtle)',
                            }}
                          >
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 'var(--fs-body)', color: c.assignable ? 'var(--text-strong)' : 'var(--text-subtle)' }}>
                                {c.name} <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
                                  {c.assigned_course_count}과목 · {c.assigned_weekly_hours}h
                                </span>
                              </span>
                              {!c.assignable && (
                                <span style={{ display: 'block', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                                  {c.reason}
                                </span>
                              )}
                            </span>
                            <Button
                              size="sm" disabled={!c.assignable || busy}
                              onClick={() => act(
                                () => assignCourseTa(departmentId, selected.course_id, c.student_id),
                                `${c.name} 학생을 ${selected.title}에 배정했습니다.`,
                              )}
                            >
                              <UserPlus size={13} /> 배정
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </AdminShell>
  )
}
