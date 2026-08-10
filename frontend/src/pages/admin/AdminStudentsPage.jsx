import { useEffect, useMemo, useState } from 'react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import StatusPill from '../../components/ui/StatusPill'
import TimeGrid from '../../components/ui/TimeGrid'
import ComingSoonPanel from '../../components/ui/ComingSoonPanel'
import { AdminPanel } from '../../components/admin/AdminPanel'
import { adminStatusSlug } from '../../utils/adminStatus'
import { formatDate } from '../../utils/format'
import { getSessionUser } from '../../utils/session'
import { fetchDepartmentSchedule, fetchDepartmentSubstituteRequests } from '../../api/client'

const pad2 = n => String(n).padStart(2, '0')
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const minToHhmm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`

// 확정 근무 목록(날짜 단위, REQ-SCHED-010) → TimeGrid가 다루는 "요일-HH:00" 슬롯 키로 펼침.
// 실제 배정은 주차마다 달라질 수 있으므로, 여기서는 "이 학생이 그 요일·시간대에 근무한 적이 있다"는
// 요약 표시일 뿐 — 특정 한 주의 확정 시간표를 그대로 보여주는 것은 아니다.
function scheduleToSlotKeys(rows) {
  const keys = new Set()
  for (const r of rows) {
    for (let m = toMin(r.start_time); m + 60 <= toMin(r.end_time); m += 60) {
      keys.add(`${r.day_of_week}-${minToHhmm(m)}`)
    }
  }
  return [...keys]
}

function totalHours(rows) {
  return rows.reduce((sum, r) => sum + (toMin(r.end_time) - toMin(r.start_time)) / 60, 0)
}

export default function AdminStudentsPage() {
  const user = getSessionUser()
  const [schedules, setSchedules] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')
  const [subRequests, setSubRequests] = useState(null) // 대타 이력 — 실패해도 페이지 전체는 동작해야 하므로 별도 상태
  const [selId, setSelId] = useState(null)

  useEffect(() => {
    if (!user?.department_id) { setLoadError('로그인 정보에 소속 부서가 없습니다.'); setSchedules([]); return }
    let alive = true
    fetchDepartmentSchedule(user.department_id)
      .then(rows => { if (alive) setSchedules(rows) })
      .catch(err => { if (alive) setLoadError(err.message) })
    fetchDepartmentSubstituteRequests(user.department_id)
      .then(rows => { if (alive) setSubRequests(rows) })
      .catch(() => { if (alive) setSubRequests([]) })
    return () => { alive = false }
  }, [user?.department_id])

  // student_id별로 확정 근무를 묶는다 — 근무표(WorkSchedule)에 등장한 학생만 "선발 학생"으로 본다
  const roster = useMemo(() => {
    if (!schedules) return []
    const byStudent = new Map()
    for (const row of schedules) {
      if (!row.student_id) continue
      if (!byStudent.has(row.student_id)) {
        byStudent.set(row.student_id, { student_id: row.student_id, name: row.student_name, rows: [] })
      }
      byStudent.get(row.student_id).rows.push(row)
    }
    return [...byStudent.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [schedules])

  useEffect(() => {
    if (roster.length > 0 && (!selId || !roster.some(x => x.student_id === selId))) {
      setSelId(roster[0].student_id)
    }
  }, [roster, selId])

  const selected = roster.find(x => x.student_id === selId)
  const selectedSubs = subRequests?.filter(r => r.requester_id === selId) ?? []

  return (
    <AdminShell activeMenu="students">
      <PageTitle>학생 관리</PageTitle>
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>확정 근무표에 등록된 근로 학생의 배정 현황과 대타 이력을 관리합니다.</p>

      {loadError ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{loadError}</p></AdminPanel>
      ) : !schedules ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중...</p></AdminPanel>
      ) : roster.length === 0 ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>확정된 근무표가 없습니다. 근무표 생성·확정 후 이 화면에 학생이 표시됩니다.</p></AdminPanel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18, alignItems: 'start' }}>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>선발 학생 ({roster.length}명)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--saint-tan)' }}>
                  {th('이름')}{th('배정 시간', 'center')}{th('근무 건수', 'center')}
                </tr>
              </thead>
              <tbody>
                {roster.map(x => {
                  const on = x.student_id === selId
                  return (
                    <tr key={x.student_id} onClick={() => setSelId(x.student_id)} style={{ borderBottom: '1px solid var(--border-subtle)', background: on ? 'var(--saint-row-hover)' : '#fff', cursor: 'pointer' }}>
                      <td style={{ padding: '12px 16px', borderLeft: `3px solid ${on ? 'var(--sogang-red)' : 'transparent'}` }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{x.name ?? x.student_id}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{x.student_id}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center' }}>{totalHours(x.rows)}시간</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center' }}>{x.rows.length}건</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <AdminPanel>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text-strong)' }}>{selected.name ?? selected.student_id}</h2>
                    <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>{selected.student_id}{user?.department_name ? ` · ${user.department_name}` : ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  {stat('총 배정 시간', totalHours(selected.rows) + '시간')}
                  {stat('확정 근무 건수', selected.rows.length + '건')}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 10 }}>근무 요일·시간대</div>
                <TimeGrid classSlots={[]} availableSlots={scheduleToSlotKeys(selected.rows)} editable={false} availableLegendText="확정 근무" />
              </AdminPanel>

              <AdminPanel title={`대타 이력 (${selectedSubs.length}건)`}>
                {selectedSubs.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'var(--saint-tan)' }}>{th('날짜')}{th('시간')}{th('사유')}{th('상태', 'center')}</tr></thead>
                    <tbody>
                      {selectedSubs.map(s => (
                        <tr key={s.request_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '11px 16px', fontSize: 13 }}>{formatDate(s.date)}</td>
                          <td style={{ padding: '11px 16px', fontSize: 13 }}>{s.start_time?.slice(0, 5)}-{s.end_time?.slice(0, 5)}</td>
                          <td style={{ padding: '11px 16px', fontSize: 13 }}>{s.reason || '-'}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(s.status)} label={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '6px 0' }}>대타 이력이 없습니다.</div>}
              </AdminPanel>

              <ComingSoonPanel description="시급·급여 지급 현황, 출결, 관리자 메모는 아직 관련 데이터베이스 항목이 없어 표시할 수 없습니다." />
            </div>
          )}
        </div>
      )}
    </AdminShell>
  )
}

function stat(label, value) {
  return (
    <div style={{ flex: 1, background: 'var(--neutral-25)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>{value}</div>
    </div>
  )
}

function th(t, align) {
  return <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap' }}>{t}</th>
}
