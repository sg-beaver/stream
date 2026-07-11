// 내 지원 현황 (my applications)
function MyApplicationsScreen({ onOpenDetail }) {
  const { Icon, StatCard, StatusBadge } = window;
  const [chip, setChip] = React.useState('전체');
  const chips = ['전체', '지원 완료', '검토 중', '면접 진행', '최종 합격', '불합격'];

  const steps = ['제출완료', '검토중', '면접', '결과'];
  const Stepper = ({ step, result }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < step || (result === 'fail' ? true : i <= step && step === 0 ? i === 0 : i < step);
        const isDone = i <= step;
        const isFailResult = i === 3 && result === 'fail';
        const active = i === step && !isFailResult;
        let bg = '#fff', bd = '#D5D8DC', ic = null, icColor = '#C9CED4';
        if (i < step) { bg = '#1F8A4C'; bd = '#1F8A4C'; ic = 'check'; icColor = '#fff'; }
        else if (i === step) {
          if (result === 'fail' && i === 3) { bg = '#9AA1A9'; bd = '#9AA1A9'; ic = 'x'; icColor = '#fff'; }
          else if (i === 3) { bg = '#1F8A4C'; bd = '#1F8A4C'; ic = 'check'; icColor = '#fff'; }
          else if (i === 2) { bg = '#6D4FCB'; bd = '#6D4FCB'; ic = 'dot'; icColor = '#fff'; }
          else if (i === 1) { bg = '#D9791F'; bd = '#D9791F'; ic = 'dot'; icColor = '#fff'; }
          else { bg = '#1F8A4C'; bd = '#1F8A4C'; ic = 'check'; icColor = '#fff'; }
        }
        return (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: i < 3 ? 1 : '0 0 auto', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center', position: 'relative' }}>
              {i > 0 && <span style={{ position: 'absolute', right: '50%', width: '100%', height: 2, background: i <= step ? '#1F8A4C' : '#E6E8EB', top: 9 }}></span>}
              <span style={{ position: 'relative', width: 20, height: 20, borderRadius: '50%', background: bg, border: '2px solid ' + bd, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                {ic === 'dot' ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }}></span> : ic && <Icon name={ic} size={12} color={icColor} strokeWidth={3} />}
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#6B7280', marginTop: 6 }}>{s}</span>
          </div>
        );
      })}
    </div>
  );

  const th = (t, w) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#4B5563', textAlign: 'center', width: w }}>{t}</th>;

  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>내 지원 현황</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>내가 지원한 공고의 진행 상태를 한눈에 확인할 수 있습니다.</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {window.myAppStats.map(s => <StatCard key={s.key} stat={s} />)}
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 24, height: 40, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>전체 상태 <Icon name="chevron-down" size={15} color="#9AA1A9" /></button>
        {chips.map(c => {
          const on = chip === c;
          return (
            <button key={c} onClick={() => setChip(c)} style={{ height: 40, padding: '0 18px', background: on ? '#fff' : '#fff', border: '1px solid ' + (on ? '#B01116' : '#E6E8EB'), borderRadius: 8, fontSize: 13, fontWeight: on ? 700 : 500, color: on ? '#B01116' : '#4B5563', cursor: 'pointer', font: 'inherit' }}>{c}</button>
          );
        })}
        <div style={{ position: 'relative', marginLeft: 'auto', width: 280 }}>
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}><Icon name="search" size={16} color="#9AA1A9" /></span>
          <input placeholder="공고명, 부서명으로 검색" style={{ width: '100%', height: 40, padding: '0 40px 0 14px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#6B7280', cursor: 'pointer', font: 'inherit' }}><Icon name="rotate-ccw" size={14} color="#9AA1A9" /> 초기화</button>
      </div>

      <div style={{ fontSize: 14, color: '#4B5563', marginBottom: 12 }}>총 <b style={{ color: '#1F2937' }}>8개</b>의 지원 내역</div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>
              <th style={{ padding: '13px 20px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: 'left' }}>공고명 / 부서</th>
              {th('지원 기간')}{th('지원일')}{th('현재 상태', 110)}{th('진행 단계', 260)}{th('관리', 170)}
            </tr>
          </thead>
          <tbody>
            {window.myApplications.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: a.step === 2 ? '#EEEAFB' : '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={a.step === 2 ? 'users' : 'briefcase'} size={18} color={a.step === 2 ? '#6D4FCB' : '#1F8A4C'} />
                    </span>
                    <span>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>{a.dept} <span style={{ color: '#D5D8DC' }}>|</span> {a.cat}</div>
                    </span>
                  </div>
                </td>
                <td style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: '#4B5563' }}>{a.period}</td>
                <td style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: '#4B5563' }}>{a.date}</td>
                <td style={{ padding: '16px', textAlign: 'center' }}><StatusBadge status={a.status} /></td>
                <td style={{ padding: '16px 24px' }}><Stepper step={a.step} result={a.result} /></td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                    <button onClick={() => onOpenDetail && onOpenDetail(a)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>지원 상세 보기 <Icon name="chevron-right" size={14} color="#9AA1A9" /></button>
                    <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>공고 다시 보기 <Icon name="external-link" size={13} color="#9AA1A9" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22, position: 'relative' }}>
        {['chevrons-left','chevron-left'].map(i => <button key={i} style={{ width: 34, height: 34, background: '#fff', border: '1px solid #E6E8EB', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={i} size={15} color="#9AA1A9" /></button>)}
        {[1,2,3].map(n => <button key={n} style={{ width: 34, height: 34, background: n === 1 ? '#B01116' : '#fff', color: n === 1 ? '#fff' : '#4B5563', border: '1px solid ' + (n === 1 ? '#B01116' : '#E6E8EB'), borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>{n}</button>)}
        {['chevron-right','chevrons-right'].map(i => <button key={i} style={{ width: 34, height: 34, background: '#fff', border: '1px solid #E6E8EB', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={i} size={15} color="#9AA1A9" /></button>)}
        <button style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: 20, height: 34, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>10개씩 보기 <Icon name="chevron-down" size={14} color="#9AA1A9" /></button>
      </div>
    </div>
  );
}
window.MyApplicationsScreen = MyApplicationsScreen;
