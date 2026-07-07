// 대타 요청 (요청 목록 → 후보 검색 → 승인/반려 → 근무표 반영)
function SubstituteModule() {
  const { AdminIcon, ABadge, AStatCard, AButton, APanel } = window;
  const [stage, setStage] = React.useState('list'); // list | search | done
  const [sel, setSel] = React.useState(null);
  const [picked, setPicked] = React.useState(null);

  const th = (t, a) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: a || 'left', whiteSpace: 'nowrap' }}>{t}</th>;

  if (stage === 'search' && sel) {
    return (
      <div>
        <button onClick={() => setStage('list')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#4B5563', cursor: 'pointer', font: 'inherit', marginBottom: 14 }}><AdminIcon name="chevron-left" size={18} color="#6B7280" /> 요청 목록으로</button>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>대타 후보 검색</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>요청 조건에 맞는 대타 후보를 확인하고 배정합니다.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>
          <APanel title="요청 정보">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              {[['요청자', sel.requester + ' (' + sel.dept + ')'], ['근무일', sel.date], ['시간', sel.time], ['사유', sel.reason], ['요청일', sel.reqDate]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12 }}><span style={{ width: 56, color: '#9AA1A9', fontWeight: 600 }}>{k}</span><span style={{ color: '#1F2937', fontWeight: 600 }}>{v}</span></div>
              ))}
              <div style={{ display: 'flex', gap: 8, padding: 12, background: '#F8F9FB', borderRadius: 8, marginTop: 4, fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
                <AdminIcon name="info" size={14} color="#9AA1A9" style={{ marginTop: 1, flexShrink: 0 }} /> 해당 시간에 이미 근무 중인 학생은 후보에서 자동 제외됩니다.
              </div>
            </div>
          </APanel>

          <APanel title="적합 후보">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {window.subCandidates.map(c => {
                const on = picked === c.name;
                return (
                  <div key={c.name} style={{ border: '1px solid ' + (on ? '#B01116' : '#E6E8EB'), background: on ? '#FDF6F6' : '#fff', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#EEF1F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AdminIcon name="user" size={19} color="#5B6570" /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{c.name}</span>
                        <span style={{ fontSize: 12, color: '#9AA1A9' }}>{c.dept}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.fit === '높음' ? '#1F8A4C' : '#D9791F', background: (c.fit === '높음' ? '#1F8A4C' : '#D9791F') + '18', padding: '2px 8px', borderRadius: 5 }}>적합도 {c.fit}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{c.reason}</div>
                    </div>
                    <AButton variant={on ? 'primary' : 'outline'} size="sm" onClick={() => setPicked(c.name)}>{on ? '선택됨' : '선택'}</AButton>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEF0F2' }}>
              <AButton variant="danger" icon="x">요청 반려</AButton>
              <AButton variant="primary" icon="check" onClick={() => picked && setStage('done')}>대타 승인 · 근무표 반영</AButton>
            </div>
          </APanel>
        </div>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div>
        <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>대타 승인 완료</h1>
        <APanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 72, height: 72, borderRadius: '50%', background: '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><AdminIcon name="check" size={34} color="#1F8A4C" strokeWidth={2.5} /></span>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1F2937' }}>대타 신청이 승인되었습니다</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>{sel.requester} → {picked} · {sel.date} {sel.time}<br />근무 시간표가 업데이트되고 양측에 알림이 전송되었습니다.</p>
            <AButton variant="primary" onClick={() => { setStage('list'); setPicked(null); }}>요청 목록으로</AButton>
          </div>
        </APanel>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>대타 요청</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>학생 대타 요청을 검토하고 후보 배정 후 승인·반려합니다.</p>
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>{window.subStats.map(s => <AStatCard key={s.key} stat={s} />)}</div>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>{th('요청자 / 부서')}{th('근무일', 'center')}{th('시간', 'center')}{th('사유')}{th('요청일', 'center')}{th('상태', 'center')}{th('처리', 'center')}</tr></thead>
          <tbody>
            {window.subRequests.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '14px 16px' }}><div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{r.requester}</div><div style={{ fontSize: 12, color: '#9AA1A9' }}>{r.dept}</div></td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{r.date}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{r.time}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#3A4048' }}>{r.reason}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#9AA1A9' }}>{r.reqDate}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}><ABadge status={r.status} /></td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  {r.status === '미처리'
                    ? <button onClick={() => { setSel(r); setPicked(null); setStage('search'); }} style={{ height: 32, padding: '0 14px', background: '#B01116', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>후보 검색</button>
                    : <span style={{ fontSize: 12, color: '#9AA1A9' }}>{r.approver} 처리</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
window.SubstituteModule = SubstituteModule;
