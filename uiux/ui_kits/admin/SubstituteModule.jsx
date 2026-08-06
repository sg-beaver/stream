// 대타 요청 (요청 목록 → 합의된 대타자 검토 → 승인/반려 → 근무표 반영)
// 학생 쪽 화면은 대타자가 카카오워크로 수락해야만 "신청하기"가 눌리는 구조라, 관리자에게 넘어오는
// 요청은 항상 대타자가 이미 정해져 있다. 그래서 관리자가 직접 후보를 검색해서 배정하는 경로는 없고,
// 관리자는 이미 합의된 대타자를 확인해 승인하거나, 사유를 남기고 반려하는 것만 한다.
// 처리(승인/반려)가 끝난 요청은 목록에 담당자 이름만 남고 더 이상 손댈 수 없다.

// 카카오워크로 오간/나갈 알림을 관리자 화면에서도 같은 언어로 보여주는 말풍선
function AKakaoBubble({ to, children }) {
  const { AdminIcon } = window;
  return (
    <div style={{ background: '#F8F9FB', border: '1px solid #EEF0F2', borderRadius: 10, padding: 16, display: 'flex', gap: 12 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: '#FEE500', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AdminIcon name="message-circle" size={17} color="#3A2A00" />
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

// 반려 사유 입력 — 승인처럼 바로 확정되지 않고, 사유를 받아야 반려가 완료된다
function RejectPanel({ onCancel, onConfirm }) {
  const [reason, setReason] = React.useState('');
  return (
    <div style={{ marginTop: 14, padding: 14, background: '#FCEAEA', border: '1px solid #F3C9C7', borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#C0322B', marginBottom: 8 }}>반려 사유 (학생에게 카카오워크로 전달됩니다)</div>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="예: 해당 시간대 근무표 확정 불가"
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <window.AButton variant="outline" size="sm" onClick={onCancel}>취소</window.AButton>
        <window.AButton variant="danger" size="sm" onClick={() => reason.trim() && onConfirm(reason.trim())}>반려 확정</window.AButton>
      </div>
    </div>
  );
}

function SubstituteModule() {
  const { AdminIcon, ABadge, AStatCard, AButton, APanel } = window;
  const [stage, setStage] = React.useState('list'); // list | review | done
  const [sel, setSel] = React.useState(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [result, setResult] = React.useState(null); // { type: 'approved'|'rejected', reason }

  const th = (t, a) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: a || 'left', whiteSpace: 'nowrap' }}>{t}</th>;

  const openRequest = (r) => { setSel(r); setRejecting(false); setStage('review'); };
  const approve = () => { setResult({ type: 'approved' }); setStage('done'); };
  const reject = (reason) => { setResult({ type: 'rejected', reason }); setStage('done'); };

  if (stage === 'review' && sel) {
    return (
      <div>
        <button onClick={() => setStage('list')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#4B5563', cursor: 'pointer', font: 'inherit', marginBottom: 14 }}><AdminIcon name="chevron-left" size={18} color="#6B7280" /> 요청 목록으로</button>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>대타 요청 검토</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>학생이 카카오워크로 이미 합의한 대타자를 확인하고 승인·반려합니다.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>
          <APanel title="요청 정보">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              {[['요청자', sel.requester + ' (' + sel.dept + ')'], ['근무일', sel.date], ['시간', sel.time], ['사유', sel.reason], ['요청일', sel.reqDate]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12 }}><span style={{ width: 56, color: '#9AA1A9', fontWeight: 600 }}>{k}</span><span style={{ color: '#1F2937', fontWeight: 600 }}>{v}</span></div>
              ))}
            </div>
          </APanel>

          <APanel title="합의된 대타자">
            <div style={{ border: '1px solid #E6E8EB', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#EEF1F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AdminIcon name="user" size={19} color="#5B6570" /></span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{sel.candidate.name}</span>
                  <span style={{ fontSize: 12, color: '#9AA1A9' }}>{sel.candidate.dept} · {sel.candidate.sid}</span>
                </div>
                <div style={{ fontSize: 12, color: '#1F8A4C', marginTop: 4, fontWeight: 600 }}>카카오워크로 대타 요청을 수락함</div>
              </div>
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5B6570', marginBottom: 8 }}>카카오워크 알림 확인</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <AKakaoBubble to={`${sel.candidate.name}님`}>{sel.date} {sel.time} {sel.dept} 근무 대타를 요청드려요. 사유: {sel.reason}</AKakaoBubble>
              <AKakaoBubble to="나">{sel.candidate.name}님이 {sel.date} {sel.time} 근무 대타를 수락했어요.</AKakaoBubble>
            </div>

            {!rejecting ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEF0F2' }}>
                <AButton variant="danger" icon="x" onClick={() => setRejecting(true)}>요청 반려</AButton>
                <AButton variant="primary" icon="check" onClick={approve}>대타 승인 · 근무표 반영</AButton>
              </div>
            ) : (
              <RejectPanel onCancel={() => setRejecting(false)} onConfirm={reject} />
            )}
          </APanel>
        </div>
      </div>
    );
  }

  if (stage === 'done' && result) {
    const approved = result.type === 'approved';
    return (
      <div>
        <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>{approved ? '대타 승인 완료' : '대타 반려 완료'}</h1>
        <APanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 72, height: 72, borderRadius: '50%', background: approved ? '#E7F4EA' : '#EEF0F2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <AdminIcon name={approved ? 'check' : 'x'} size={34} color={approved ? '#1F8A4C' : '#6B7280'} strokeWidth={2.5} />
            </span>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1F2937' }}>{approved ? '대타 신청이 승인되었습니다' : '대타 신청이 반려되었습니다'}</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>
              {approved ? <>{sel.requester} → {sel.candidate.name} · {sel.date} {sel.time}</> : <>{sel.requester} · {sel.date} {sel.time}</>}
              <br />근무 시간표가 업데이트되고 관련자에게 알림이 전송되었습니다.
            </p>
            <div style={{ width: '100%', maxWidth: 420, textAlign: 'left', marginBottom: 22 }}>
              {approved ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <AKakaoBubble to={`${sel.requester}님`}>대타 요청이 승인됐어요. {sel.candidate.name}님이 {sel.date} {sel.time} 근무를 대신합니다.</AKakaoBubble>
                  <AKakaoBubble to={`${sel.candidate.name}님`}>{sel.date} {sel.time} 대타 근무가 최종 승인됐어요. 근무표에 반영됐어요.</AKakaoBubble>
                </div>
              ) : (
                <AKakaoBubble to={`${sel.requester}님`}>대타 요청이 반려됐어요.<br />사유: {result.reason}</AKakaoBubble>
              )}
            </div>
            <AButton variant="primary" onClick={() => { setStage('list'); setSel(null); setResult(null); }}>요청 목록으로</AButton>
          </div>
        </APanel>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>대타 요청</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>학생이 카카오워크로 합의한 대타자를 확인해 승인·반려합니다. 처리한 요청은 목록에서 결과만 확인할 수 있습니다.</p>
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>{window.subStats.map(s => <AStatCard key={s.key} stat={s} />)}</div>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>{th('요청자 / 부서')}{th('근무일', 'center')}{th('시간', 'center')}{th('사유')}{th('대타자', 'center')}{th('요청일', 'center')}{th('상태', 'center')}{th('처리', 'center')}</tr></thead>
          <tbody>
            {window.subRequests.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '14px 16px' }}><div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{r.requester}</div><div style={{ fontSize: 12, color: '#9AA1A9' }}>{r.dept}</div></td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{r.date}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{r.time}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: '#3A4048' }}>{r.reason}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#1F2937', fontWeight: 600 }}>{r.candidate.name}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#9AA1A9' }}>{r.reqDate}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}><ABadge status={r.status} /></td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  {r.status === '미처리'
                    ? <button onClick={() => openRequest(r)} style={{ height: 32, padding: '0 14px', background: '#B01116', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>검토</button>
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
