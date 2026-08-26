import { useEffect, useState } from 'react'
import { ChevronLeft, Info, User, Check, X } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Textarea from '../../components/ui/Textarea'
import Button from '../../components/ui/Button'
import StatusPill from '../../components/ui/StatusPill'
import { AdminPanel, AdminStatCard } from '../../components/admin/AdminPanel'
import { adminStatusSlug } from '../../utils/adminStatus'
import { formatDate, formatDateTime } from '../../utils/format'
import { getSessionUser } from '../../utils/session'
import { fetchDepartmentSubstituteRequests, fetchSubstituteCandidates, approveSubstituteRequest, rejectSubstituteRequest } from '../../api/client'

export default function AdminSubstitutePage() {
  const user = getSessionUser()
  const [requests, setRequests] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')
  const [stage, setStage] = useState('list') // list | search | done
  const [sel, setSel] = useState(null)
  const [candidates, setCandidates] = useState(null)
  const [candidatesError, setCandidatesError] = useState('')
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [doneAction, setDoneAction] = useState('approved') // 'approved' | 'rejected'

  function loadRequests() {
    if (!user?.department_id) return
    fetchDepartmentSubstituteRequests(user.department_id)
      .then(setRequests)
      .catch(err => setLoadError(err.message))
  }

  useEffect(loadRequests, [user?.department_id])

  function openSearch(request) {
    setSel(request)
    setStage('search')
    setCandidates(null)
    setCandidatesError('')
    setApproveError('')
    setRejectReason('')
    fetchSubstituteCandidates(request.request_id)
      .then(setCandidates)
      .catch(err => setCandidatesError(err.message))
  }

  async function approve() {
    setApproving(true)
    setApproveError('')
    try {
      await approveSubstituteRequest(sel.request_id)
      setDoneAction('approved')
      setStage('done')
    } catch (err) {
      setApproveError(err.message)
    } finally {
      setApproving(false)
    }
  }

  async function reject() {
    setRejecting(true)
    setApproveError('')
    try {
      await rejectSubstituteRequest(sel.request_id, rejectReason.trim() || undefined)
      setDoneAction('rejected')
      setStage('done')
    } catch (err) {
      setApproveError(err.message)
    } finally {
      setRejecting(false)
    }
  }

  function backToList() {
    setStage('list')
    setSel(null)
    setRequests(null)
    loadRequests()
  }

  const stats = requests && [
    { key: 'pending', label: '대기 중', value: `${requests.filter(r => r.status === '대기').length}건`, sub: '후보 응답 대기', icon: 'Clock', tone: 'warning' },
    { key: 'accepted', label: '승인 대기', value: `${requests.filter(r => r.status === '수락').length}건`, sub: '후보가 수락함', icon: 'CircleCheck', tone: 'info' },
    { key: 'approved', label: '승인 완료', value: `${requests.filter(r => r.status === '승인').length}건`, sub: '근무표 반영됨', icon: 'Check', tone: 'success' },
    { key: 'total', label: '전체 요청', value: `${requests.length}건`, sub: '누적', icon: 'Files', tone: 'neutral' },
  ]

  if (stage === 'search' && sel) {
    return (
      <AdminShell activeMenu="substitute">
        <button onClick={backToList} style={backBtnStyle}><ChevronLeft size={17} /> 요청 목록으로</button>
        <h1 style={{ margin: '14px 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--text-strong)' }}>대타 요청 상세</h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>후보 탐색과 수락은 학생이 직접 합니다. 여기서는 진행 상황을 확인하고, 후보가 수락한 요청만 최종 승인합니다.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>
          <AdminPanel title="요청 정보">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              {[
                ['요청자', `${sel.requester_name ?? sel.requester_id} (${sel.department_name ?? ''})`],
                ['근무일', formatDate(sel.date)],
                ['시간', `${sel.start_time?.slice(0, 5)}-${sel.end_time?.slice(0, 5)}`],
                ['사유', sel.reason || '(작성 안 함)'],
                ['요청일', formatDateTime(sel.requested_at)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12 }}><span style={{ width: 52, color: 'var(--text-subtle)', fontWeight: 600 }}>{k}</span><span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{v}</span></div>
              ))}
              <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--neutral-25)', borderRadius: 'var(--radius-lg)', marginTop: 4, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <Info size={14} color="var(--text-subtle)" style={{ marginTop: 1, flexShrink: 0 }} /> 해당 시간에 이미 근무 중인 학생은 후보에서 자동 제외됩니다.
              </div>
            </div>
          </AdminPanel>

          <AdminPanel title={sel.status === '수락' ? '수락한 후보' : '적합 후보'}>
            {sel.status === '수락' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ border: '1px solid var(--sogang-red)', background: 'var(--saint-row-hover)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={18} color="var(--text-muted)" /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{sel.substitute_name ?? sel.substitute_id}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>이 요청을 수락했습니다. 승인하면 근무표가 즉시 교체됩니다.</div>
                  </div>
                </div>
                {approveError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{approveError}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 18, borderTop: '1px solid var(--border-subtle)' }}>
                  <Button onClick={approve} disabled={approving}><Check size={14} /> {approving ? '승인 처리 중...' : '대타 승인 · 근무표 반영'}</Button>
                </div>
              </div>
            ) : candidatesError ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{candidatesError}</p>
            ) : !candidates ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--warning-50)', borderRadius: 'var(--radius-lg)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  아직 수락한 후보가 없습니다. 아래 후보 중 한 명이 요청을 수락하면 이 화면에서 승인할 수 있습니다.
                </div>
                {candidates.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-subtle)' }}>해당 시간대에 가능한 후보가 없습니다.</p>
                ) : candidates.map(c => (
                  <div key={c.student_id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={18} color="var(--text-muted)" /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{c.name ?? c.student_id}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{c.student_id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminPanel>
        </div>

        <div style={{ marginTop: 18 }}>
          <AdminPanel title="요청 반려">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                반려하면 근무는 원래 근무자에게 그대로 남고, 학생은 같은 근무로 다시 요청할 수 있습니다. 반려 사유는 학생의 요청 기록에 표시됩니다.
              </p>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={2}
                placeholder="반려 사유를 입력해 주세요 (선택)"
              />
              {approveError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{approveError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={reject} disabled={rejecting || approving}>
                  <X size={14} /> {rejecting ? '반려 처리 중...' : '요청 반려'}
                </Button>
              </div>
            </div>
          </AdminPanel>
        </div>
      </AdminShell>
    )
  }

  if (stage === 'done') {
    const approved = doneAction === 'approved'
    return (
      <AdminShell activeMenu="substitute">
        <h1 style={{ margin: '0 0 20px', fontSize: 21, fontWeight: 800, color: 'var(--text-strong)' }}>{approved ? '대타 승인 완료' : '대타 요청 반려'}</h1>
        <AdminPanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 68, height: 68, borderRadius: '50%', background: approved ? 'var(--success-50)' : 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              {approved
                ? <Check size={30} color="var(--success)" strokeWidth={2.5} />
                : <X size={30} color="var(--neutral-600)" strokeWidth={2.5} />}
            </span>
            <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--text-strong)' }}>
              {approved ? '대타 신청이 승인되었습니다' : '대타 요청이 반려되었습니다'}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
              {approved ? (
                <>
                  {sel.requester_name ?? sel.requester_id} → {sel.substitute_name ?? sel.substitute_id} · {formatDate(sel.date)} {sel.start_time?.slice(0, 5)}-{sel.end_time?.slice(0, 5)}
                  <br />근무 시간표가 업데이트되었습니다.
                </>
              ) : (
                <>
                  {sel.requester_name ?? sel.requester_id} · {formatDate(sel.date)} {sel.start_time?.slice(0, 5)}-{sel.end_time?.slice(0, 5)}
                  <br />근무는 원래 근무자에게 그대로 유지됩니다.
                </>
              )}
            </p>
            <Button onClick={backToList}>요청 목록으로</Button>
          </div>
        </AdminPanel>
      </AdminShell>
    )
  }

  return (
    <AdminShell activeMenu="substitute">
      <PageTitle>대타 승인</PageTitle>

      {loadError ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{loadError}</p></AdminPanel>
      ) : !requests ? (
        <AdminPanel><p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중...</p></AdminPanel>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
            {stats.map(s => <AdminStatCard key={s.key} stat={s} />)}
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--saint-tan)' }}>
                  {th('요청자 / 부서')}{th('근무일', 'center')}{th('시간', 'center')}{th('사유')}{th('요청일', 'center')}{th('상태', 'center')}{th('처리', 'center')}
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>대타 요청이 없습니다.</td></tr>
                ) : requests.map(r => (
                  <tr key={r.request_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '13px 16px' }}><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{r.requester_name ?? r.requester_id}</div><div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{r.department_name}</div></td>
                    <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13 }}>{formatDate(r.date)}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13 }}>{r.start_time?.slice(0, 5)}-{r.end_time?.slice(0, 5)}</td>
                    <td style={{ padding: '13px 16px', fontSize: 13 }}>
                      {r.reason || '-'}
                      {r.status === '반려' && r.reject_reason && (
                        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>반려 사유: {r.reject_reason}</div>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>{formatDate(r.requested_at)}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(r.status)} label={r.status} /></td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                      {r.status === '승인'
                        ? <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{r.approver_name ?? r.approved_by} 처리</span>
                        : r.status === '반려'
                          ? <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>반려됨</span>
                          : <button onClick={() => openSearch(r)} style={searchBtnStyle}>{r.status === '수락' ? '검토·승인' : '상세 보기'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  )
}

function th(t, align) {
  return <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap' }}>{t}</th>
}
const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const searchBtnStyle = { height: 30, padding: '0 14px', background: 'var(--sogang-red)', color: 'var(--text-on-brand)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
