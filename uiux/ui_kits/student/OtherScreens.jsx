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

function SubstituteScreen() {
  const { Icon, StatusBadge } = window;
  const rows = [
    { date: '2026.03.05', time: '08:30-10:30', reason: '수강신청', rep: '박민수', status: '지원 완료' },
    { date: '2026.03.12', time: '10:00-13:00', reason: '병원 방문', rep: '대기 중', status: '검토 중' },
  ];
  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>대타 요청</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>근무가 어려운 일정에 대해 대타를 요청할 수 있습니다.</p>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>신규 대타 요청</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 600, marginBottom: 6 }}>근무 일정</div>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 42, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>월 10:00-13:00 <Icon name="chevron-down" size={15} color="#9AA1A9" /></button>
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 600, marginBottom: 6 }}>사유</div>
            <input placeholder="대타 사유를 입력해 주세요" style={{ width: '100%', height: 42, padding: '0 12px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <button style={{ height: 42, padding: '0 22px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>요청 제출</button>
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>
            {['요청일','시간','사유','대타자','상태'].map((h,i) => <th key={h} style={{ padding: '13px 18px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: i > 3 ? 'center' : 'left' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r,i) => (
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
