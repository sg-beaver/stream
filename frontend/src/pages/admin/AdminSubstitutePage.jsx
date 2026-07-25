import { useState } from 'react'
import { ChevronLeft, Info, User, Check, X } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Button from '../../components/ui/Button'
import StatusPill from '../../components/ui/StatusPill'
import { AdminPanel, AdminStatCard } from '../../components/admin/AdminPanel'
import { adminStatusSlug } from '../../utils/adminStatus'
import { subStats, subRequests as initialRequests, subCandidates } from '../../data/adminMockData'

export default function AdminSubstitutePage() {
  const [requests, setRequests] = useState(initialRequests)
  const [stage, setStage] = useState('list') // list | search | done
  const [sel, setSel] = useState(null)
  const [picked, setPicked] = useState(null)

  const approve = () => {
    setRequests(rs => rs.map(r => r.id === sel.id ? { ...r, status: '승인', approver: '김직원' } : r))
    setStage('done')
  }

  if (stage === 'search' && sel) {
    return (
      <AdminShell activeMenu="substitute">
        <button onClick={() => setStage('list')} style={backBtnStyle}><ChevronLeft size={17} /> 요청 목록으로</button>
        <h1 style={{ margin: '14px 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--text-strong)' }}>대타 후보 검색</h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>요청 조건에 맞는 대타 후보를 확인하고 배정합니다.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>
          <AdminPanel title="요청 정보">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              {[['요청자', `${sel.requester} (${sel.dept})`], ['근무일', sel.date], ['시간', sel.time], ['사유', sel.reason], ['요청일', sel.reqDate]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12 }}><span style={{ width: 52, color: 'var(--text-subtle)', fontWeight: 600 }}>{k}</span><span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{v}</span></div>
              ))}
              <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--neutral-25)', borderRadius: 'var(--radius-lg)', marginTop: 4, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <Info size={14} color="var(--text-subtle)" style={{ marginTop: 1, flexShrink: 0 }} /> 해당 시간에 이미 근무 중인 학생은 후보에서 자동 제외됩니다.
              </div>
            </div>
          </AdminPanel>

          <AdminPanel title="적합 후보">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {subCandidates.map(c => {
                const on = picked === c.name
                return (
                  <div key={c.name} style={{ border: `1px solid ${on ? 'var(--sogang-red)' : 'var(--border-subtle)'}`, background: on ? 'var(--saint-row-hover)' : '#fff', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={18} color="var(--text-muted)" /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{c.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{c.dept}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.fit === '높음' ? 'var(--success)' : 'var(--warning)', background: c.fit === '높음' ? 'var(--success-50)' : 'var(--warning-50)', padding: '2px 8px', borderRadius: 5 }}>적합도 {c.fit}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{c.reason}</div>
                    </div>
                    <Button variant={on ? 'primary' : 'secondary'} size="sm" onClick={() => setPicked(c.name)}>{on ? '선택됨' : '선택'}</Button>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-subtle)' }}>
              <Button variant="danger"><X size={14} /> 요청 반려</Button>
              <Button onClick={() => picked && approve()}><Check size={14} /> 대타 승인 · 근무표 반영</Button>
            </div>
          </AdminPanel>
        </div>
      </AdminShell>
    )
  }

  if (stage === 'done') {
    return (
      <AdminShell activeMenu="substitute">
        <h1 style={{ margin: '0 0 20px', fontSize: 21, fontWeight: 800, color: 'var(--text-strong)' }}>대타 승인 완료</h1>
        <AdminPanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Check size={30} color="var(--success)" strokeWidth={2.5} /></span>
            <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--text-strong)' }}>대타 신청이 승인되었습니다</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>{sel.requester} → {picked} · {sel.date} {sel.time}<br />근무 시간표가 업데이트되고 양측에 알림이 전송되었습니다.</p>
            <Button onClick={() => { setStage('list'); setPicked(null) }}>요청 목록으로</Button>
          </div>
        </AdminPanel>
      </AdminShell>
    )
  }

  return (
    <AdminShell activeMenu="substitute">
      <PageTitle>대타 요청</PageTitle>
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>학생 대타 요청을 검토하고 후보 배정 후 승인·반려합니다.</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {subStats.map(s => <AdminStatCard key={s.key} stat={s} />)}
      </div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--saint-tan)' }}>
              {th('요청자 / 부서')}{th('근무일', 'center')}{th('시간', 'center')}{th('사유')}{th('요청일', 'center')}{th('상태', 'center')}{th('처리', 'center')}
            </tr>
          </thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '13px 16px' }}><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{r.requester}</div><div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{r.dept}</div></td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13 }}>{r.date}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13 }}>{r.time}</td>
                <td style={{ padding: '13px 16px', fontSize: 13 }}>{r.reason}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>{r.reqDate}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(r.status)} label={r.status} /></td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  {r.status === '미처리'
                    ? <button onClick={() => { setSel(r); setPicked(null); setStage('search') }} style={searchBtnStyle}>후보 검색</button>
                    : <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{r.approver} 처리</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}

function th(t, align) {
  return <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap' }}>{t}</th>
}
const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const searchBtnStyle = { height: 30, padding: '0 14px', background: 'var(--sogang-red)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
