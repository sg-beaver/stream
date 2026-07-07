// 지원 상세 (application detail)
function ApplicationDetailScreen({ onBack }) {
  const { Icon, StatusBadge, TimeGrid } = window;
  const d = window.appDetail;
  const steps = [
    { label: '제출완료', sub: '2026.05.20 15:30' },
    { label: '검토중', sub: '담당자가 검토 중입니다' },
    { label: '면접', sub: '면접이 진행될 예정입니다' },
    { label: '결과', sub: '최종 결과를 확인하세요' },
  ];

  const infoRow = (label, value) => (
    <div style={{ display: 'flex', gap: 20, fontSize: 14, marginBottom: 16 }}>
      <span style={{ width: 64, color: '#6B7280', fontWeight: 600 }}>{label}</span>
      <span style={{ color: '#1F2937', fontWeight: 500, flex: 1 }}>{value}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#1F2937' }}>지원 상세</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#9AA1A9' }}>
          <Icon name="home" size={15} color="#B9BFC6" /> 홈
          <Icon name="chevron-right" size={13} color="#C9CED4" /> 내 지원 현황
          <Icon name="chevron-right" size={13} color="#C9CED4" /> <span style={{ color: '#3A4048', fontWeight: 600 }}>지원 상세</span>
        </div>
      </div>

      {/* Summary card */}
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="briefcase" size={26} color="#1F8A4C" />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#1F2937' }}>{d.team} <span style={{ color: '#D5D8DC', margin: '0 4px' }}>|</span> {d.title}</div>
          <div style={{ fontSize: 13, color: '#9AA1A9', marginTop: 4 }}>{d.team}</div>
        </div>
        <div style={{ textAlign: 'right', marginRight: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>현재 상태</span> <StatusBadge status={d.status} />
          </div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>지원일 <span style={{ color: '#3A4048', fontWeight: 600 }}>{d.date}</span></div>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>공고 정보 보기 <Icon name="chevron-right" size={15} color="#9AA1A9" /></button>
      </div>

      {/* Stepper */}
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '28px 40px', marginBottom: 18 }}>
        <div style={{ display: 'flex' }}>
          {steps.map((s, i) => {
            const done = i < d.step, active = i === d.step;
            let bg = '#fff', bd = '#D5D8DC';
            if (done) { bg = '#1F8A4C'; bd = '#1F8A4C'; }
            else if (active) { bg = '#fff'; bd = '#1F8A4C'; }
            return (
              <div key={s.label} style={{ flex: 1, position: 'relative', textAlign: 'center' }}>
                {i > 0 && <span style={{ position: 'absolute', right: '50%', top: 15, width: '100%', height: 2, background: i <= d.step ? '#1F8A4C' : '#E6E8EB' }}></span>}
                <span style={{ position: 'relative', zIndex: 1, width: 32, height: 32, borderRadius: '50%', background: bg, border: '2px solid ' + bd, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  {done ? <Icon name="check" size={17} color="#fff" strokeWidth={3} /> : <span style={{ width: 9, height: 9, borderRadius: '50%', background: active ? '#1F8A4C' : '#D5D8DC' }}></span>}
                </span>
                <div style={{ fontSize: 15, fontWeight: 700, color: (done || active) ? '#1F2937' : '#9AA1A9', marginTop: 10 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 4 }}>{s.sub}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info + submission (left) | time grid (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700 }}>1. 지원자 정보</h3>
            {infoRow('이름', window.currentUser.name)}
            {infoRow('학번', window.currentUser.studentId)}
            {infoRow('학과(부)', window.currentUser.major)}
            {infoRow('연락처', window.currentUser.phone)}
            {infoRow('이메일', window.currentUser.email)}
          </div>
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700 }}>3. 제출 내용</h3>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 600, marginBottom: 8 }}>지원 동기</div>
              <p style={{ margin: 0, fontSize: 13, color: '#3A4048', lineHeight: 1.7 }}>{d.motivation}</p>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 600, marginBottom: 8 }}>관련 경험 및 역량</div>
              <p style={{ margin: 0, fontSize: 13, color: '#3A4048', lineHeight: 1.7 }}>{d.experience}</p>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700 }}>2. 근무 가능 시간</h3>
          <TimeGrid redSlots={d.classSlots} checkSlots={d.availSlots} redLabel="수업시간" />
        </div>
      </div>

      {/* Attachment */}
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24, marginBottom: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>4. 첨부 서류</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid #EDEFF1', borderRadius: 8 }}>
          <Icon name="file-text" size={20} color="#B01116" />
          <span style={{ flex: 1, fontSize: 14, color: '#1F2937', fontWeight: 600 }}>{d.attachment.name}</span>
          <span style={{ fontSize: 13, color: '#9AA1A9' }}>{d.attachment.date}</span>
          <span style={{ fontSize: 13, color: '#9AA1A9', width: 70, textAlign: 'right' }}>{d.attachment.size}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Icon name="download" size={18} color="#6B7280" /></button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ height: 48, padding: '0 24px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 15, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>내 지원 현황으로 돌아가기</button>
        <button style={{ height: 48, padding: '0 40px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>공고 다시 보기</button>
      </div>
    </div>
  );
}
window.ApplicationDetailScreen = ApplicationDetailScreen;
