// Simpler screens for 근무 시간표 / 대타 요청 / 출결 내역 (not in this sprint's hi-fi spec)
function ScheduleScreen() {
  const { Icon, TimeGrid } = window;
  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>근무 시간표</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>이번 학기 확정된 근무 일정입니다.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FDECEC', border: '1px solid #F7D9D8', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <Icon name="calendar-check" size={18} color="#B01116" />
        <span style={{ fontSize: 14, color: '#B01116', fontWeight: 600 }}>이번 주 총 근무시간 6시간 · 학생지원팀 행정 보조</span>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
        <TimeGrid redSlots={['월-10:00','월-11:00','수-10:00','수-11:00','금-10:00']} redLabel="근무" legend={false} />
      </div>
    </div>
  );
}

// 동료의 특정 요일에 해당하는 가능 시간 문구 (예: "월 09:00~13:00 가능")
function describeAvailability(colleague, day) {
  const a = (colleague.availability || []).find(x => x.day === day);
  return a ? `${a.day} ${a.start}~${a.end} 가능` : '';
}

// 카카오워크로 전송/수신되는 알림 미리보기 — 대타 흐름의 모든 알림 지점에서 공통으로 사용
function KakaoBubble({ to, children }) {
  const { Icon } = window;
  return (
    <div style={{ background: '#F8F9FB', border: '1px solid #EEF0F2', borderRadius: 10, padding: 16, display: 'flex', gap: 12 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: '#FEE500', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name="message-circle" size={17} color="#3A2A00" />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#3A2A00', marginBottom: 4 }}>카카오워크 · STREAM 봇 → {to}</div>
        <div style={{ fontSize: 13, color: '#3A4048', lineHeight: 1.6, background: '#fff', border: '1px solid #E6E8EB', borderRadius: '4px 10px 10px 10px', padding: '10px 12px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function SubNoticeBanner({ notice }) {
  const { Icon } = window;
  if (!notice) return null;
  const tones = {
    warn: { bg: '#FDEEE0', fg: '#D9791F', icon: 'triangle-alert' },
    info: { bg: '#E8F0FB', fg: '#2563C9', icon: 'info' },
    success: { bg: '#E7F4EA', fg: '#1F8A4C', icon: 'circle-check' },
  };
  const t = tones[notice.tone] || tones.info;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.bg, color: t.fg, border: `1px solid ${t.fg}33`, borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13.5, fontWeight: 600 }}>
      <Icon name={t.icon} size={17} color={t.fg} />{notice.text}
    </div>
  );
}

function SubstituteScreen() {
  const { Icon, StatusBadge } = window;
  const shifts = window.myShifts;
  const colleagues = window.deptColleagues;
  const { maskName, maskStudentId, isAvailableForShift } = window;

  const [history, setHistory] = React.useState(window.substituteHistorySeed || []);
  const [step, setStep] = React.useState('form'); // form | candidates | sent | declined | accepted | submitted
  const [shiftId, setShiftId] = React.useState(shifts[0].id);
  const [reason, setReason] = React.useState('');
  const [excludedIds, setExcludedIds] = React.useState([]); // 이번 검색에서 거절/제외된 동료
  const [chosen, setChosen] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  const selectedShift = shifts.find(s => s.id === shiftId);
  const shiftLabel = `${selectedShift.day} ${selectedShift.start}-${selectedShift.end}`;

  const available = colleagues.filter(c => !c.busy && !excludedIds.includes(c.id) && isAvailableForShift(c, selectedShift));
  const busyExcluded = colleagues.filter(c => c.busy && isAvailableForShift(c, selectedShift));

  const findCandidates = () => {
    if (!reason.trim()) { setNotice({ tone: 'warn', text: '대타 사유를 입력해 주세요.' }); return; }
    setExcludedIds([]);
    setNotice(null);
    setStep('candidates');
  };

  const sendRequest = (c) => {
    setChosen(c);
    setNotice(null);
    setStep('sent');
  };

  const simulateReply = (accepted) => setStep(accepted ? 'accepted' : 'declined');

  const backToCandidatesAfterDecline = () => {
    setExcludedIds(ids => [...ids, chosen.id]);
    setChosen(null);
    setStep('candidates');
  };

  const finalizeApply = () => {
    setHistory(h => [{ date: '2026.08.05', time: shiftLabel, reason, rep: maskName(chosen.name), status: '검토 중' }, ...h]);
    setNotice({ tone: 'success', text: '관리자에게 전달했어요. 승인되면 알려드릴게요.' });
    setStep('form');
    setReason('');
    setChosen(null);
    setExcludedIds([]);
  };

  const backTo = (target) => { setNotice(null); setStep(target); };

  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>대타 요청</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>근무가 어려운 일정에 대해 같은 부서 동료에게 대타를 요청할 수 있습니다.</p>

      {step === 'form' && (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginBottom: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>신규 대타 요청</h3>
          <SubNoticeBanner notice={notice} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 600, marginBottom: 6 }}>근무 일정</div>
              <select value={shiftId} onChange={e => setShiftId(e.target.value)} style={{ width: '100%', height: 42, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit', boxSizing: 'border-box' }}>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.day} {s.start}-{s.end} · {s.place}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 600, marginBottom: 6 }}>사유</div>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="대타 사유를 입력해 주세요" style={{ width: '100%', height: 42, padding: '0 12px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <button onClick={findCandidates} style={{ height: 42, padding: '0 22px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>대타 가능한 동료 찾기</button>
          </div>
        </div>
      )}

      {step === 'candidates' && (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginBottom: 18 }}>
          <button onClick={() => backTo('form')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', font: 'inherit', marginBottom: 14, padding: 0 }}>
            <Icon name="chevron-left" size={16} color="#9AA1A9" /> 요청 내용 다시 입력
          </button>
          <SubNoticeBanner notice={notice} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>대타 가능한 동료</h3>
            <span style={{ fontSize: 13, color: '#6B7280' }}>{shiftLabel} · 학생지원팀</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#9AA1A9', marginBottom: 16 }}>
            <Icon name="lock" size={13} color="#9AA1A9" /> 개인정보 보호를 위해 이름·학번 일부가 가려져 표시됩니다.
          </div>

          {available.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9AA1A9', fontSize: 13.5 }}>
              이 시간에 가능한 같은 부서 동료가 없어요. 다른 근무를 선택하거나 나중에 다시 시도해 주세요.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: '#6B7280', fontWeight: 600 }}>총 {available.length}명 가능</div>
              {available.map(c => (
                <div key={c.id} style={{ border: '1px solid #E6E8EB', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#EEF1F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="user" size={18} color="#5B6570" />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1F2937' }}>{maskName(c.name)} <span style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 500 }}>({maskStudentId(c.sid)})</span></div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{c.dept} · {describeAvailability(c, selectedShift.day)}</div>
                  </div>
                  <button onClick={() => sendRequest(c)} style={{ height: 34, padding: '0 16px', background: '#B01116', border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit', flexShrink: 0 }}>이 동료에게 요청</button>
                </div>
              ))}
            </div>
          )}

          {busyExcluded.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #EEF0F2' }}>
              <div style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600, marginBottom: 8 }}>근무 시간 겹침으로 자동 제외됨</div>
              {busyExcluded.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', opacity: 0.55 }}>
                  <Icon name="user" size={15} color="#9AA1A9" />
                  <span style={{ fontSize: 13, color: '#6B7280' }}>{maskName(c.name)} ({maskStudentId(c.sid)})</span>
                  <span style={{ fontSize: 12, color: '#9AA1A9' }}>· {c.busyNote}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'sent' && chosen && (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginBottom: 18 }}>
          <button onClick={() => backTo('candidates')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', font: 'inherit', marginBottom: 14, padding: 0 }}>
            <Icon name="chevron-left" size={16} color="#9AA1A9" /> 요청 취소하고 다른 동료 선택
          </button>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>대타 요청을 보냈어요</h3>
          <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#6B7280' }}>{maskName(chosen.name)}님에게 카카오워크로 요청을 전송했어요. 응답을 기다리는 중이에요.</p>

          <KakaoBubble to={`${maskName(chosen.name)}님`}>
            {shiftLabel} 학생지원팀 근무 대타를 요청드려요.<br />사유: {reason || '—'}<br />가능하시면 아래에서 수락해 주세요.
          </KakaoBubble>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#D9791F', fontWeight: 600 }}>
            <Icon name="clock" size={13} color="#D9791F" /> 응답 대기 중
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed #E6E8EB' }}>
            <div style={{ fontSize: 12, color: '#9AA1A9', marginBottom: 10, lineHeight: 1.6 }}>
              데모 미리보기 — 실제 서비스에서는 {maskName(chosen.name)}님의 카카오워크 앱에 알림이 가고, 그 화면에서 아래와 같은 버튼을 눌러 응답합니다. 지금은 시연을 위해 이 자리에서 상대방의 응답을 대신 선택해 보세요.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => simulateReply(true)} style={{ flex: 1, height: 38, background: '#1F8A4C', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="check-circle-2" size={15} color="#fff" /> (상대방) 수락
              </button>
              <button onClick={() => simulateReply(false)} style={{ flex: 1, height: 38, background: '#fff', border: '1px solid #DADEE3', borderRadius: 7, fontSize: 13, fontWeight: 700, color: '#6B7280', cursor: 'pointer', font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="x-circle" size={15} color="#9AA1A9" /> (상대방) 거절
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'declined' && chosen && (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginBottom: 18 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>{maskName(chosen.name)}님이 거절했어요</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6B7280' }}>카카오워크로 거절 알림을 받았어요. 다른 동료에게 다시 요청해 보세요.</p>
          <KakaoBubble to="나">
            {maskName(chosen.name)}님이 {shiftLabel} 근무 대타 요청을 거절했어요. 다른 동료를 찾아드릴게요.
          </KakaoBubble>
          <div style={{ marginTop: 18, textAlign: 'right' }}>
            <button onClick={backToCandidatesAfterDecline} style={{ height: 38, padding: '0 20px', background: '#B01116', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>다른 동료 보기</button>
          </div>
        </div>
      )}

      {step === 'accepted' && chosen && (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginBottom: 18 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>{maskName(chosen.name)}님이 대타를 수락했어요</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6B7280' }}>카카오워크로 수락 알림을 받았어요. 신청하기를 누르면 관리자에게 승인 요청이 전달돼요.</p>
          <KakaoBubble to="나">
            {maskName(chosen.name)}님이 {shiftLabel} 근무 대타를 수락했어요! 신청하기를 눌러 관리자 승인을 요청하세요.
          </KakaoBubble>
          <div style={{ marginTop: 18, textAlign: 'right' }}>
            <button onClick={() => setStep('submitted')} style={{ height: 42, padding: '0 28px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>신청하기 · 관리자에게 전달</button>
          </div>
        </div>
      )}

      {step === 'submitted' && chosen && (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginBottom: 18 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>관리자에게 승인 요청을 보냈어요</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6B7280' }}>카카오워크로 학생지원팀 관리자에게 전달했어요. 승인되면 알려드릴게요.</p>
          <KakaoBubble to="학생지원팀 관리자">
            {window.currentUser.name} 학생이 {shiftLabel} 근무 대타 승인을 요청했어요.<br />대타자: {maskName(chosen.name)}님 · 사유: {reason || '—'}
          </KakaoBubble>
          <div style={{ marginTop: 18, textAlign: 'right' }}>
            <button onClick={finalizeApply} style={{ height: 42, padding: '0 28px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>확인</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>
            {['요청일','시간','사유','대타자','상태'].map((h,i) => <th key={h} style={{ padding: '13px 18px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: i > 3 ? 'center' : 'left' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {history.map((r,i) => (
              <tr key={i} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '14px 18px', fontSize: 13, color: '#3A4048' }}>{r.date}</td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: '#3A4048' }}>{r.time}</td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: '#3A4048' }}>{r.reason}</td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: '#3A4048' }}>{r.rep}</td>
                <td style={{ padding: '14px 18px', textAlign: 'center' }}><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceScreen() {
  const { StatusBadge } = window;
  const rows = [
    { date: '2026.02.26', day: '월', time: '10:00-13:00', inn: '09:58', out: '13:02', status: '모집중', label: '정상' },
    { date: '2026.02.27', day: '화', time: '10:00-13:00', inn: '10:07', out: '13:00', status: '마감임박', label: '지각' },
    { date: '2026.02.28', day: '수', time: '10:00-13:00', inn: '09:55', out: '13:05', status: '모집중', label: '정상' },
  ];
  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>출결 내역</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>근무 출퇴근 기록을 확인할 수 있습니다.</p>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>
            {['날짜','요일','근무시간','입장','퇴장','상태'].map((h,i) => <th key={h} style={{ padding: '13px 18px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: i < 2 ? 'left' : 'center' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '14px 18px', fontSize: 13, color: '#3A4048' }}>{r.date}</td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: '#3A4048' }}>{r.day}</td>
                <td style={{ padding: '14px 18px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{r.time}</td>
                <td style={{ padding: '14px 18px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{r.inn}</td>
                <td style={{ padding: '14px 18px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{r.out}</td>
                <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', padding: '4px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: r.label === '정상' ? '#E7F4EA' : '#FDEEE0', color: r.label === '정상' ? '#1F8A4C' : '#D9791F' }}>{r.label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { ScheduleScreen, SubstituteScreen, AttendanceScreen });
