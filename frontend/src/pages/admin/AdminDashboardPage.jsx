import { useEffect, useMemo, useState } from 'react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import ComingSoonPanel from '../../components/ui/ComingSoonPanel'
import { AdminPanel, AdminStatCard } from '../../components/admin/AdminPanel'
import { getSessionUser } from '../../utils/session'
import { fetchPostings, fetchApplicants } from '../../api/client'

// 지원자 status 기준 집계 (제출완료/검토중 = 검토 대기, 합격 = 선발 완료)
const PENDING_STATUSES = ['제출완료', '검토중']

export default function AdminDashboardPage() {
  const user = getSessionUser()
  const [postings, setPostings] = useState(null) // null = 로딩 중, 각 항목에 applicants 배열 포함
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    // 본인 부서 공고 → 공고별 지원자 병렬 로드
    fetchPostings({ department_id: user?.department_id })
      .then(list =>
        Promise.all(
          list.map(p =>
            fetchApplicants(p.posting_id).then(applicants => ({ ...p, applicants })),
          ),
        ),
      )
      .then(data => { if (alive) setPostings(data) })
      .catch(err => { if (alive) setLoadError(err.message) })
    return () => { alive = false }
  }, [user?.department_id])

  // 통계 카드: 공고·지원자 실데이터 기반 계산
  const stats = useMemo(() => {
    const list = postings ?? []
    const allApplicants = list.flatMap(p => p.applicants)
    const open = list.filter(p => p.status === '모집중').length
    const pending = allApplicants.filter(a => PENDING_STATUSES.includes(a.status)).length
    const selected = allApplicants.filter(a => a.status === '합격').length
    const totalHeadcount = list.reduce((sum, p) => sum + (p.headcount ?? 0), 0)
    const rate = totalHeadcount > 0 ? Math.round((selected / totalHeadcount) * 100) : 0
    const v = x => (postings ? String(x) : '–')
    return [
      { key: 'open', label: '진행 중 공고', value: postings ? `${open}건` : '–', sub: `전체 ${v(list.length)}건`, icon: 'Megaphone', tone: 'info' },
      { key: 'appl', label: '전체 지원자', value: postings ? `${allApplicants.length}명` : '–', sub: '부서 공고 누적', icon: 'Users', tone: 'neutral' },
      { key: 'pending', label: '검토 대기', value: postings ? `${pending}명` : '–', sub: '제출완료·검토중', icon: 'Clock', tone: 'warning' },
      { key: 'rate', label: '충원율', value: postings ? `${rate}%` : '–', sub: `${v(selected)} / ${v(totalHeadcount)}명 선발`, icon: 'TrendingUp', tone: 'success' },
    ]
  }, [postings])

  return (
    <AdminShell activeMenu="dashboard">
      <PageTitle>운영 대시보드</PageTitle>
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
        {user?.department_name ? `${user.department_name} ` : ''}교내 근로 운영 현황 요약입니다.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {stats.map(s => <AdminStatCard key={s.key} stat={s} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 18 }}>
        <AdminPanel title="공고별 충원 현황">
          {loadError ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>충원 현황을 불러오지 못했습니다</div>
              <div style={{ fontSize: 13, color: 'var(--danger)' }}>{loadError}</div>
            </div>
          ) : !postings ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>충원 현황을 불러오는 중...</div>
          ) : postings.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>등록된 공고가 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {postings.map(p => {
                const filled = p.applicants.filter(a => a.status === '합격').length
                const total = p.headcount ?? 0
                const pct = total > 0 ? Math.round((filled / total) * 100) : 0
                const color = pct >= 100 ? 'var(--success)' : (pct >= 50 ? 'var(--info)' : (pct > 0 ? 'var(--warning)' : 'var(--sogang-red)'))
                return (
                  <div key={p.posting_id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{p.title}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 12 }}>{filled}/{total}명 <b style={{ color }}>({pct}%)</b></span>
                    </div>
                    <div style={{ height: 9, background: 'var(--neutral-100)', borderRadius: 5, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: Math.min(pct, 100) + '%', background: color, borderRadius: 5 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </AdminPanel>

        <AdminPanel title="대타 요청 추이">
          <ComingSoonPanel description="대타 API 연동 전(#27)입니다. 대타·근무표 데이터가 연동되면 월별 요청 추이가 표시됩니다." />
        </AdminPanel>
      </div>

      <AdminPanel title="최근 처리 필요 항목">
        <ComingSoonPanel description="대타 API 연동 전(#27)입니다. 대타 승인·근무표 충돌 등 처리 필요 항목이 연동 후 표시됩니다." />
      </AdminPanel>
    </AdminShell>
  )
}
