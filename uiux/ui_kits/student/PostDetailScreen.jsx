// 공고 상세 (post detail)
function PostDetailScreen({ onBack, onApply }) {
  const { Icon, StatusBadge, TimeGrid, Panel } = window;
  const d = window.postDetail;

  const summaryCell = (icon, label, value) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#F1F3F5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={20} color="#6B7280" />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 15, color: '#1F2937', fontWeight: 700 }}>{value}</span>
      </span>
    </div>
  );

  const bullet = (text) => (
    <li style={{ display: 'flex', gap: 8, fontSize: 14, color: '#3A4048', lineHeight: 1.6, marginBottom: 8 }}>
      <span style={{ color: '#B01116', marginTop: 1 }}>•</span> {text}
    </li>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>
          <Icon name="chevron-left" size={18} color="#6B7280" /> 목록으로 돌아가기
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#9AA1A9' }}>
          <Icon name="home" size={15} color="#B9BFC6" />
          <Icon name="chevron-right" size={13} color="#C9CED4" /> 공고 찾기
          <Icon name="chevron-right" size={13} color="#C9CED4" /> <span style={{ color: '#3A4048', fontWeight: 600 }}>공고 상세</span>
        </div>
      </div>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <StatusBadge status={d.status} size="lg" />
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#1F2937' }}>{d.team} <span style={{ color: '#D5D8DC', margin: '0 6px' }}>|</span> {d.title}</h1>
      </div>
      <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>{d.team}</div>

      {/* Summary row */}
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '22px 26px', display: 'flex', gap: 8, marginBottom: 18 }}>
        {summaryCell('users', '모집인원', d.headcount)}
        {summaryCell('timer', '주당 근무시간', d.weeklyMax)}
        {summaryCell('calendar', '근무기간', d.period)}
        {summaryCell('clock', '지원 마감일', d.deadline)}
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Panel title="업무 내용">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{d.duties.map(bullet)}</ul>
          </Panel>
          <Panel title="지원 자격 및 우대 조건">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{d.qualifications.map(bullet)}</ul>
          </Panel>
        </div>

        <Panel title="근무 조건">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#3A4048', marginBottom: 12 }}>
            <Icon name="clock" size={16} color="#8A929B" /> 근무요일/시간
          </div>
          <TimeGrid redSlots={d.workSlots} redLabel="" legend={false} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
            <Icon name="map-pin" size={16} color="#8A929B" />
            <span style={{ fontSize: 13, color: '#9AA1A9', fontWeight: 600, width: 70 }}>근무장소</span>
            <span style={{ fontSize: 14, color: '#1F2937', fontWeight: 600, flex: 1 }}>{d.location}</span>
            <div style={{ width: 220, height: 84, borderRadius: 8, background: 'linear-gradient(135deg,#E9EDF0,#DDE3E8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98A0A8', fontSize: 12, position: 'relative', overflow: 'hidden' }}>
              <Icon name="map" size={22} color="#AEB6BE" />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#B01116', fontWeight: 700 }}>
                <Icon name="map-pin" size={14} color="#B01116" /> 본관빌딩
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <Icon name="mail" size={16} color="#8A929B" />
            <span style={{ fontSize: 13, color: '#9AA1A9', fontWeight: 600, width: 70 }}>문의처</span>
            <span style={{ fontSize: 14, color: '#1F2937' }}>{d.contactEmail}<br />{d.contactPhone}</span>
          </div>
        </Panel>
      </div>

      {/* Footer note + apply */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, fontSize: 13, color: '#9AA1A9', lineHeight: 1.7 }}>
          <Icon name="info" size={15} color="#B9BFC6" style={{ marginTop: 2 }} />
          <div>이미 지원한 공고는 "지원현황 보기" 버튼으로 변경됩니다.<br />모집이 마감된 공고는 "지원 마감"으로 표시되어 지원할 수 없습니다.</div>
        </div>
        <button onClick={onApply} style={{ height: 48, padding: '0 40px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>지원하기</button>
      </div>
    </div>
  );
}
window.PostDetailScreen = PostDetailScreen;
