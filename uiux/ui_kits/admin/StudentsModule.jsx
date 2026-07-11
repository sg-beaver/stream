// 학생 관리 (선발 학생 목록 + 상세: 근무현황/배정시간/대타이력/관리자 메모)
function StudentsModule() {
  const { AdminIcon, ABadge, ATimeGrid } = window;
  const [selId, setSelId] = React.useState(window.workers[0].id);
  const w = window.workers.find(x => x.id === selId);

  const th = (t, a) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: a || 'left', whiteSpace: 'nowrap' }}>{t}</th>;
  const stat = (label, value) => (
    <div style={{ flex: 1, background: '#F8F9FB', border: '1px solid #EEF0F2', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937' }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>학생 관리</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>선발된 근로 학생의 근무 현황과 배정 시간, 대타 이력을 관리합니다.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #EEF0F2', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>선발 학생 ({window.workers.length}명)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F6F0E6' }}>{th('이름')}{th('부서')}{th('배정', 'center')}{th('출결', 'center')}</tr></thead>
            <tbody>
              {window.workers.map(x => {
                const on = x.id === selId;
                return (
                  <tr key={x.id} onClick={() => setSelId(x.id)} style={{ borderBottom: '1px solid #F1F3F5', background: on ? '#FDF6F6' : '#fff', cursor: 'pointer' }}>
                    <td style={{ padding: '13px 16px', borderLeft: '3px solid ' + (on ? '#B01116' : 'transparent') }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{x.name}</div>
                      <div style={{ fontSize: 12, color: '#9AA1A9' }}>{x.sid}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: '#4B5563' }}>{x.dept}</td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: '#4B5563', textAlign: 'center' }}>주 {x.assigned}h</td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}><ABadge status={x.attendance === '정상' ? '정상' : '검토중'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1F2937' }}>{w.name}</h2>
                <div style={{ fontSize: 13, color: '#9AA1A9', marginTop: 4 }}>{w.sid} · {w.major} · {w.dept} · {w.role}</div>
              </div>
              <ABadge status={w.attendance === '정상' ? '정상' : '검토중'} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {stat('주당 배정시간', w.assigned + '시간')}
              {stat('누적 근무시간', w.worked + '시간')}
              {stat('시급', '₩' + w.rate)}
              {stat('급여 지급', w.pay)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3A4048', marginBottom: 12 }}>배정 근무 시간</div>
            <ATimeGrid redSlots={['월-10:00','월-11:00','수-10:00','수-11:00','금-10:00']} redLabel="근무" legend={false} />
          </div>

          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>대타 이력 ({w.subs}건)</h3>
            {w.subs > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F6F0E6' }}>{th('날짜')}{th('시간')}{th('사유')}{th('상태', 'center')}</tr></thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #F1F3F5' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#3A4048' }}>2026.05.28</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#3A4048' }}>10:00-13:00</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#3A4048' }}>수강신청</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><ABadge status="미처리" /></td>
                  </tr>
                </tbody>
              </table>
            ) : <div style={{ fontSize: 13, color: '#9AA1A9', padding: '8px 0' }}>대타 이력이 없습니다.</div>}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>관리자 메모</h3>
            <textarea defaultValue="성실하고 정시 출근 양호. 문서 정리 정확도 높음." style={{ width: '100%', height: 72, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
window.StudentsModule = StudentsModule;
