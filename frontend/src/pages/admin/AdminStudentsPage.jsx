import { useState } from 'react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import StatusPill from '../../components/ui/StatusPill'
import TimeGrid from '../../components/ui/TimeGrid'
import { AdminPanel } from '../../components/admin/AdminPanel'
import { adminStatusSlug } from '../../utils/adminStatus'
import { workers } from '../../data/adminMockData'

// 근무 중인 학생 roster — docs/API_SPEC.md에 대응 API가 없어 전체 mock (급여·출결 데이터는 백엔드 논의 필요)
export default function AdminStudentsPage() {
  const [selId, setSelId] = useState(workers[0].id)
  const w = workers.find(x => x.id === selId)

  const stat = (label, value) => (
    <div style={{ flex: 1, background: 'var(--neutral-25)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>{value}</div>
    </div>
  )

  return (
    <AdminShell activeMenu="students">
      <PageTitle>학생 관리</PageTitle>
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>선발된 근로 학생의 근무 현황과 배정 시간, 대타 이력을 관리합니다.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>선발 학생 ({workers.length}명)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--saint-tan)' }}>
                {th('이름')}{th('부서')}{th('배정', 'center')}{th('출결', 'center')}
              </tr>
            </thead>
            <tbody>
              {workers.map(x => {
                const on = x.id === selId
                return (
                  <tr key={x.id} onClick={() => setSelId(x.id)} style={{ borderBottom: '1px solid var(--border-subtle)', background: on ? 'var(--saint-row-hover)' : '#fff', cursor: 'pointer' }}>
                    <td style={{ padding: '12px 16px', borderLeft: `3px solid ${on ? 'var(--sogang-red)' : 'transparent'}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{x.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{x.sid}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>{x.dept}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center' }}>주 {x.assigned}h</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(x.attendance === '정상' ? '정상' : '검토중')} label={x.attendance} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AdminPanel>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text-strong)' }}>{w.name}</h2>
                <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>{w.sid} · {w.major} · {w.dept} · {w.role}</div>
              </div>
              <StatusPill status={adminStatusSlug(w.attendance === '정상' ? '정상' : '검토중')} label={w.attendance} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {stat('주당 배정시간', w.assigned + '시간')}
              {stat('누적 근무시간', w.worked + '시간')}
              {stat('시급', '₩' + w.rate)}
              {stat('급여 지급', w.pay)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 10 }}>배정 근무 시간</div>
            <TimeGrid classSlots={[]} availableSlots={['월-10:00', '월-11:00', '수-10:00', '수-11:00', '금-10:00']} editable={false} />
          </AdminPanel>

          <AdminPanel title={`대타 이력 (${w.subs}건)`}>
            {w.subs > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--saint-tan)' }}>{th('날짜')}{th('시간')}{th('사유')}{th('상태', 'center')}</tr></thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>2026.05.28</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>10:00-13:00</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>수강신청</td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug('미처리')} label="미처리" /></td>
                  </tr>
                </tbody>
              </table>
            ) : <div style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '6px 0' }}>대타 이력이 없습니다.</div>}
          </AdminPanel>

          <AdminPanel title="관리자 메모">
            <textarea defaultValue="성실하고 정시 출근 양호. 문서 정리 정확도 높음." style={{ width: '100%', height: 72, padding: 10, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'none', boxSizing: 'border-box' }} />
          </AdminPanel>
        </div>
      </div>
    </AdminShell>
  )
}

function th(t, align) {
  return <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap' }}>{t}</th>
}
