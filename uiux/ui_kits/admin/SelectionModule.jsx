// 학생 선발 (split: 지원자 목록 | 상세 + 적합도 분석 rationale)
function SelectionModule() {
  const { AdminIcon, ABadge, AButton } = window;
  const [selId, setSelId] = React.useState(window.applicants[0].id);
  const [decisions, setDecisions] = React.useState({});
  const a = window.applicants.find(x => x.id === selId);
  const decide = (id, d) => setDecisions(prev => ({ ...prev, [id]: d }));
  const curDecision = decisions[selId];

  const fitColor = (f) => f >= 85 ? '#1F8A4C' : (f >= 70 ? '#D9791F' : '#B8860B');

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>학생 선발</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>학생지원팀 · 행정 업무 보조 (지원 {window.applicants.length}명) · 적합도 분석은 참고용 추천이며, 최종 결정은 담당자가 합니다.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18, alignItems: 'start' }}>
        {/* Left: applicant list */}
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #EEF0F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>지원자 목록</span>
            <button style={{ display: 'flex', alignItems: 'center', gap: 14, height: 32, padding: '0 10px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>적합도순 <AdminIcon name="chevron-down" size={14} color="#9AA1A9" /></button>
          </div>
          <div style={{ maxHeight: 620, overflowY: 'auto' }}>
            {window.applicants.map(x => {
              const on = x.id === selId;
              const d = decisions[x.id];
              return (
                <button key={x.id} onClick={() => setSelId(x.id)} style={{ width: '100%', textAlign: 'left', display: 'block', padding: '14px 16px', border: 'none', borderLeft: '3px solid ' + (on ? '#B01116' : 'transparent'), borderBottom: '1px solid #F1F3F5', background: on ? '#FDF6F6' : '#fff', cursor: 'pointer', font: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{x.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {d && <ABadge status={d} />}
                      <span style={{ fontSize: 13, fontWeight: 800, color: fitColor(x.fit) }}>{x.fit}</span>
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9AA1A9' }}>{x.sid} · {x.major} {x.grade}</div>
                  <div style={{ marginTop: 8, height: 5, background: '#EEF0F2', borderRadius: 3, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: x.fit + '%', background: fitColor(x.fit), borderRadius: 3 }}></span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: detail + fit analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1F2937' }}>{a.name}</h2>
                  {curDecision && <ABadge status={curDecision} />}
                </div>
                <div style={{ fontSize: 13, color: '#9AA1A9', marginTop: 4 }}>{a.sid} · {a.major} {a.grade} · 지원일 {a.applyDate}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600 }}>학점(GPA)</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1F2937' }}>{a.gpa}</div>
              </div>
            </div>

            {/* Fit analysis panel — assistive */}
            <div style={{ border: '1px solid #E6E8EB', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: '#F8F9FB', borderBottom: '1px solid #EEF0F2' }}>
                <AdminIcon name="sparkles" size={17} color="#6D4FCB" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#3A4048' }}>적합도 분석</span>
                <span style={{ marginLeft: 4, fontSize: 12, color: '#9AA1A9' }}>참고용 추천 · 최종 결정은 담당자</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#6B7280' }}>적합도</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: fitColor(a.fit) }}>{a.fit}점</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: fitColor(a.fit), background: fitColor(a.fit) + '18', padding: '2px 8px', borderRadius: 5 }}>{a.fitLabel}</span>
                </span>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1F8A4C', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AdminIcon name="check-circle-2" size={15} color="#1F8A4C" /> 조건 일치</div>
                <ul style={{ margin: '0 0 18px', padding: 0, listStyle: 'none' }}>
                  {a.matches.map(m => <li key={m} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#3A4048', lineHeight: 1.6, marginBottom: 7 }}><AdminIcon name="check" size={14} color="#1F8A4C" style={{ marginTop: 2, flexShrink: 0 }} /> {m}</li>)}
                </ul>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#D9791F', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AdminIcon name="triangle-alert" size={15} color="#D9791F" /> 확인 필요</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {a.warnings.map(w => <li key={w} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#3A4048', lineHeight: 1.6, marginBottom: 7 }}><AdminIcon name="dot" size={14} color="#D9791F" style={{ marginTop: 2, flexShrink: 0 }} /> {w}</li>)}
                </ul>
                <div style={{ display: 'flex', gap: 8, padding: 12, background: '#F3F0FC', borderRadius: 8, marginTop: 16, fontSize: 13, color: '#5B4B9E', lineHeight: 1.6 }}>
                  <AdminIcon name="info" size={15} color="#6D4FCB" style={{ marginTop: 1, flexShrink: 0 }} />
                  이 점수는 학점·근무 가능 시간·우대 역량을 참고해 계산한 추천값입니다. 선발 여부는 담당자가 최종 판단하세요.
                </div>
              </div>
            </div>

            {/* Admin memo */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3A4048', marginBottom: 8 }}>관리자 메모</div>
              <textarea defaultValue={a.note} placeholder="검토 의견을 남기세요." style={{ width: '100%', height: 64, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Decision actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '16px 22px' }}>
            <span style={{ fontSize: 14, color: '#4B5563' }}>최종 선발 결정 <b style={{ color: '#1F2937' }}>— 담당자가 직접 선택</b></span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => decide(selId, '선발')} style={{ height: 44, padding: '0 26px', background: curDecision === '선발' ? '#1F8A4C' : '#B01116', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>선발</button>
              <button onClick={() => decide(selId, '보류')} style={{ height: 44, padding: '0 26px', background: curDecision === '보류' ? '#B8860B' : '#fff', color: curDecision === '보류' ? '#fff' : '#B8860B', border: '1px solid #E4C97A', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>보류</button>
              <button onClick={() => decide(selId, '탈락')} style={{ height: 44, padding: '0 26px', background: curDecision === '탈락' ? '#6B7280' : '#fff', color: curDecision === '탈락' ? '#fff' : '#6B7280', border: '1px solid #D5D8DC', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>탈락</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.SelectionModule = SelectionModule;
