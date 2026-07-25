import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import StatusPill from '../../components/ui/StatusPill'
import { AdminPanel, AdminStatCard } from '../../components/admin/AdminPanel'
import { adminStatusSlug } from '../../utils/adminStatus'
import { dashStats, deptFill, subTrend } from '../../data/adminMockData'

const RECENT_ITEMS = [
  ['대타 승인', '안희진 · 05.28 10:00-13:00 대타 요청', '학생지원팀', '미처리'],
  ['근무표 충돌', '입학처 논술 보조 · 화 14:00 중복 배정', '입학처', '검토중'],
  ['선발 마감', '국제교류팀 교환학생 지원 보조 · 05.27 마감', '국제교류팀', '모집중'],
]

// MVP 범위표: 운영 데이터 대시보드는 그래프 1~2개만 단순화 (부서별 충원율 막대 + 대타 추이 막대)
export default function AdminDashboardPage() {
  const maxTrend = Math.max(...subTrend.map(t => t.count))

  return (
    <AdminShell activeMenu="dashboard">
      <PageTitle>운영 대시보드</PageTitle>
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>2026-1학기 교내 근로 운영 현황 요약입니다.</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {dashStats.map(s => <AdminStatCard key={s.key} stat={s} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 18 }}>
        <AdminPanel title="부서별 충원율">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {deptFill.map(d => {
              const pct = Math.round((d.filled / d.total) * 100)
              const color = pct >= 100 ? 'var(--success)' : (pct >= 50 ? 'var(--info)' : (pct > 0 ? 'var(--warning)' : 'var(--sogang-red)'))
              return (
                <div key={d.dept}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{d.dept}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{d.filled}/{d.total}명 <b style={{ color }}>({pct}%)</b></span>
                  </div>
                  <div style={{ height: 9, background: 'var(--neutral-100)', borderRadius: 5, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: pct + '%', background: color, borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </AdminPanel>

        <AdminPanel title="대타 요청 추이">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 170, padding: '0 12px' }}>
            {subTrend.map(t => (
              <div key={t.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--sogang-red)' }}>{t.count}</span>
                <div style={{ width: 40, height: (t.count / maxTrend) * 120, background: 'var(--sogang-red)', borderRadius: '6px 6px 0 0' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.month}</span>
              </div>
            ))}
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="최근 처리 필요 항목">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--saint-tan)' }}>
              {['구분', '내용', '부서', '상태'].map((h, i) => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: i === 3 ? 'center' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_ITEMS.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{r[0]}</td>
                <td style={{ padding: '13px 16px', fontSize: 13 }}>{r[1]}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{r[2]}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(r[3])} label={r[3]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminPanel>
    </AdminShell>
  )
}
