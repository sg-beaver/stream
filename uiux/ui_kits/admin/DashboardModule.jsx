// 운영 대시보드 (충원율/지원자수/미처리 요청/근무표 충돌 + 2 minimal charts)
function DashboardModule() {
  const { AdminIcon, AStatCard, ABadge, APanel } = window;
  const maxTrend = Math.max(...window.subTrend.map(t => t.count));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>운영 대시보드</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>2026-1학기 교내 근로 운영 현황 요약입니다.</p>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>{window.dashStats.map(s => <AStatCard key={s.key} stat={s} />)}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 18 }}>
        {/* Dept fill rate — horizontal bars */}
        <APanel title="부서별 충원율">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {window.deptFill.map(d => {
              const pct = Math.round((d.filled / d.total) * 100);
              const color = pct >= 100 ? '#1F8A4C' : (pct >= 50 ? '#2563C9' : (pct > 0 ? '#D9791F' : '#C0322B'));
              return (
                <div key={d.dept}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#3A4048' }}>{d.dept}</span>
                    <span style={{ fontSize: 13, color: '#6B7280' }}>{d.filled}/{d.total}명 <b style={{ color }}>({pct}%)</b></span>
                  </div>
                  <div style={{ height: 10, background: '#EEF0F2', borderRadius: 5, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: pct + '%', background: color, borderRadius: 5 }}></span>
                  </div>
                </div>
              );
            })}
          </div>
        </APanel>

        {/* Substitute trend — vertical bars */}
        <APanel title="대타 요청 추이">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 180, padding: '0 12px' }}>
            {window.subTrend.map(t => (
              <div key={t.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#B01116' }}>{t.count}</span>
                <div style={{ width: 44, height: (t.count / maxTrend) * 130, background: 'linear-gradient(180deg,#C8383D,#B01116)', borderRadius: '6px 6px 0 0' }}></div>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{t.month}</span>
              </div>
            ))}
          </div>
        </APanel>
      </div>

      {/* Recent activity */}
      <APanel title="최근 처리 필요 항목">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6' }}>
            {['구분', '내용', '부서', '상태'].map((h, i) => <th key={h} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: i === 3 ? 'center' : 'left' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[
              ['대타 승인', '안희진 · 05.28 10:00-13:00 대타 요청', '정보서비스팀', '미처리'],
              ['근무표 충돌', '입학처 논술 보조 · 화 14:00 중복 배정', '입학처', '검토중'],
              ['선발 마감', '국제교류팀 교환학생 지원 보조 · 05.27 마감', '국제교류팀', '모집중'],
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{r[0]}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: '#3A4048' }}>{r[1]}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: '#6B7280' }}>{r[2]}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><ABadge status={r[3]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </APanel>
    </div>
  );
}
window.DashboardModule = DashboardModule;
