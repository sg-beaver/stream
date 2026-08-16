// Simpler screens for 근무 시간표 / 대타 요청 / 출결 내역 (not in this sprint's hi-fi spec)

const SCHEDULE_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 'YYYY.MM.DD' → 요일 한 글자
function scheduleWeekday(dateStr) {
  const [y, m, d] = dateStr.split('.').map(Number);
  return SCHEDULE_WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// ---- 근무 시간표 캘린더 (과거 기록 확인용 — 관리자의 대타 발생 캘린더와 같은 방식) ----
function parseYMD(str) {
  const [y, m, d] = str.split('.').map(Number);
  return { y, m: m - 1, d };
}
const pad2 = (n) => String(n).padStart(2, '0');
function buildMonthCells(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}
// 특정 날짜(d)가 속한 주의 월요일 {y,m,d} 반환
function mondayOfWeek(y, m, d) {
  const dt = new Date(y, m, d);
  const dow = dt.getDay(); // 0=일 ~ 6=토
  dt.setDate(dt.getDate() + (dow === 0 ? -6 : 1 - dow));
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}
// {y,m,d}에서 n일 뒤 {y,m,d}
function addDaysYMD(y, m, d, n) {
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + n);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

function ScheduleCalendar({ subs, selectedWeekStart, onSelectWeek }) {
  const { Icon } = window;
  const initial = selectedWeekStart || (subs.length ? parseYMD(subs[subs.length - 1].date) : (() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; })());
  const [year, setYear] = React.useState(initial.y);
  const [month, setMonth] = React.useState(initial.m);

  const subsByDay = {};
  subs.forEach(s => {
    const { y, m, d } = parseYMD(s.date);
    if (y === year && m === month) (subsByDay[d] = subsByDay[d] || []).push(s);
  });

  const cells = buildMonthCells(year, month);
  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const weekLabels = ['일', '월', '화', '수', '목', '금', '토'];

  // 선택된 주(월~일)에 속하는 날짜인지 — 그 주 전체를 강조 표시하기 위함
  const inSelectedWeek = (d) => {
    if (!selectedWeekStart) return false;
    const mon = new Date(selectedWeekStart.y, selectedWeekStart.m, selectedWeekStart.d);
    const diff = Math.round((new Date(year, month, d) - mon) / 86400000);
    return diff >= 0 && diff <= 6;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><Icon name="chevron-left" size={18} color="#6B7280" /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{year}년 {month + 1}월</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><Icon name="chevron-right" size={18} color="#6B7280" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {weekLabels.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 12, color: '#9AA1A9', fontWeight: 700, padding: '4px 0' }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const daySubs = subsByDay[d];
          const has = !!daySubs;
          const picked = inSelectedWeek(d);
          return (
            <button key={i} onClick={() => onSelectWeek(mondayOfWeek(year, month, d))} title="클릭하면 이 날짜가 속한 주(월~금)가 위 시간표에 반영됩니다" style={{
              height: 52, borderRadius: 8,
              border: picked ? '2px solid #B01116' : ('1px solid ' + (has ? '#F3C9C7' : '#EEF0F2')),
              background: has ? '#FCEAEA' : (picked ? '#FDF6F6' : '#fff'), cursor: 'pointer', font: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
              <span style={{ fontSize: 13, fontWeight: has ? 700 : 500, color: has ? '#C0322B' : '#3A4048' }}>{d}</span>
              {has && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C0322B' }} />}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, fontSize: 12, color: '#6B7280' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C0322B', display: 'inline-block' }} /> 대타로 근무자가 바뀐 날</span>
        <span>날짜를 클릭하면 그 주(월~금)가 위 시간표에 그대로 반영돼요. 이전 달로 이동하면 지난 학기 기록도 확인할 수 있어요.</span>
      </div>
    </div>
  );
}

function ScheduleDayModal({ dateLabel, subs, onClose }) {
  const { Icon } = window;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 440, maxWidth: 'calc(100vw - 48px)', padding: 24, boxShadow: '0 20px 50px rgba(16,24,40,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1F2937' }}>{dateLabel} 대타 변경 내역</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><Icon name="x" size={20} color="#9AA1A9" /></button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#6B7280' }}>이 날만 근무자가 대타로 바뀌었어요. 다른 날짜는 원래 시간표대로 진행됩니다.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {subs.map(s => (
            <div key={s.id} style={{ border: '1px solid #E6E8EB', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, color: '#9AA1A9', marginBottom: 8 }}>{s.time}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: '#1F2937' }}>
                <span style={{ color: '#9AA1A9', textDecoration: 'line-through', fontWeight: 600 }}>{s.requester}</span>
                <Icon name="arrow-right" size={15} color="#B01116" />
                <span>{s.candidateName}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>사유: {s.reason} · 승인: {s.approver}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 근무 시간표 — 관리자의 "확정된 주간 근무 시간표"와 같은 방식으로, 승인된 대타가 있으면
// 해당 칸을 금색 + "누구(대타)"로 바로 보여준다. 아래 캘린더에서 특정 주를 선택하면 그 주의
// 실제 날짜 기준으로 반영되고(과거 기록 확인용), 선택하지 않으면 요일 기준 기본 템플릿을 보여준다.
function ScheduleScreen() {
  const { Icon } = window;
  const shifts = window.myShifts;
  const days = ['월', '화', '수', '목', '금'];
  const times = ['09:00', '10:00', '11:00', '12:00', '13:00'];
  const me = window.currentUser.name;
  const [weekStart, setWeekStart] = React.useState(null); // null이면 기본 템플릿, 값 있으면 그 주의 실제 날짜 기준
  const [selected, setSelected] = React.useState(null); // { dateLabel, subs }

  const approvedSubs = (window.SharedSubstitutionsStore ? window.SharedSubstitutionsStore.getAll() : [])
    .filter(s => s.requester === me || s.candidateName === me);

  const totalMins = shifts.reduce((sum, s) => sum + (window.timeToMinutes(s.end) - window.timeToMinutes(s.start)), 0);

  // 선택된 주의 월~금 실제 날짜('YYYY.MM.DD')
  const weekDates = weekStart ? days.reduce((acc, dn, idx) => {
    const { y, m, d } = addDaysYMD(weekStart.y, weekStart.m, weekStart.d, idx);
    acc[dn] = `${y}.${pad2(m + 1)}.${pad2(d)}`;
    return acc;
  }, {}) : null;

  const findSubFor = (day, h) => {
    const slotStart = h * 60, slotEnd = slotStart + 60;
    return approvedSubs.find(s => {
      if (weekDates ? s.date !== weekDates[day] : scheduleWeekday(s.date) !== day) return false;
      const [subStart, subEnd] = s.time.split('-');
      const ss = window.timeToMinutes(subStart), se = window.timeToMinutes(subEnd);
      return slotStart < se && ss < slotEnd;
    });
  };

  const gridLabels = {}, gridColors = {};
  shifts.forEach(s => {
    for (let h = parseInt(s.start, 10); h < parseInt(s.end, 10); h++) {
      const key = s.day + '-' + String(h).padStart(2, '0') + ':00';
      gridLabels[key] = '근무';
      gridColors[key] = '#B01116';
    }
  });
  days.forEach(day => {
    times.forEach(t => {
      const key = day + '-' + t;
      if (!(key in gridLabels)) return; // 정규 근무 칸이 아니면 대타를 표시하지 않음
      const matched = findSubFor(day, parseInt(t, 10));
      if (matched) {
        const iAmRequester = matched.requester === me;
        gridLabels[key] = iAmRequester ? `${matched.candidateName}(대타)` : '대타 근무';
        gridColors[key] = '#B8860B';
      }
    });
  });

  const openCellDetail = (key) => {
    if (gridColors[key] !== '#B8860B') return;
    const [day, t] = key.split('-');
    const matched = findSubFor(day, parseInt(t, 10));
    if (matched) setSelected({ dateLabel: matched.date, subs: [matched] });
  };

  const weekLabel = weekDates ? `${weekDates['월']} ~ ${weekDates['금']}` : null;

  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>근무 시간표</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>이번 학기 확정된 근무 일정입니다.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FDECEC', border: '1px solid #F7D9D8', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <Icon name="calendar-check" size={18} color="#B01116" />
        <span style={{ fontSize: 14, color: '#B01116', fontWeight: 600 }}>이번 주 총 근무시간 {window.formatDuration(totalMins)} · {window.currentUser.workDept} 행정 보조</span>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{weekLabel ? `근무 시간표 · ${weekLabel}` : '근무 시간표 (기본 템플릿)'}</h3>
          {weekStart && <button onClick={() => setWeekStart(null)} style={{ fontSize: 12.5, fontWeight: 600, color: '#B01116', background: '#FDECEC', border: '1px solid #F7D9D8', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', font: 'inherit' }}>기본 템플릿으로</button>}
        </div>
        {weekLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12.5, color: '#B8860B', fontWeight: 600 }}>
            <Icon name="calendar-days" size={14} color="#B8860B" /> 아래 캘린더에서 선택한 주(월~금)의 실제 날짜 기준으로 반영돼 있어요.
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#5B4B33', width: 68 }}>시간</th>
              {days.map(d => <th key={d} style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 13, fontWeight: 700, color: '#5B4B33' }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {times.map(t => (
              <tr key={t}>
                <td style={{ border: '1px solid #E6E8EB', background: '#FAFAFA', textAlign: 'center', fontSize: 12, color: '#6B7280', height: 30 }}>{t}</td>
                {days.map(d => {
                  const key = d + '-' + t;
                  const label = gridLabels[key];
                  const clickable = gridColors[key] === '#B8860B';
                  return (
                    <td key={key} onClick={clickable ? () => openCellDetail(key) : undefined} style={{
                      border: '1px solid #E6E8EB', height: 30, textAlign: 'center', verticalAlign: 'middle',
                      background: label ? gridColors[key] : '#fff', color: '#fff', padding: '0 2px', fontSize: 11, fontWeight: 600,
                      cursor: clickable ? 'pointer' : 'default',
                    }}>{label || ''}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12, color: '#6B7280', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 13, height: 13, background: '#B01116', borderRadius: 3 }}></span> 근무</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 13, height: 13, background: '#B8860B', borderRadius: 3 }}></span> 대타로 근무자 변경됨 (클릭하면 상세 확인)</span>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginTop: 18 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>대타 발생 캘린더</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9AA1A9' }}>날짜를 클릭하면 그 주(월~금)가 통째로 위 시간표에 반영돼요. 이전 달로 이동해 지난 학기 근무 기록도 확인할 수 있어요.</p>
        <ScheduleCalendar subs={approvedSubs} selectedWeekStart={weekStart} onSelectWeek={setWeekStart} />
      </div>

      {approvedSubs.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, marginTop: 18 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>대타 반영 내역</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9AA1A9' }}>내 근무와 관련된 대타 전체 내역입니다. 특정 주만 보려면 위 캘린더에서 날짜를 선택하세요.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {approvedSubs.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #F0E4C4', background: '#FDF8EC', borderRadius: 8, padding: '10px 14px' }}>
                <Icon name="repeat" size={15} color="#B8860B" />
                <span style={{ fontSize: 13, color: '#3A4048' }}>
                  <b>{s.date} ({scheduleWeekday(s.date)}) {s.time}</b> — {s.requester === me ? <><b>{s.candidateName}</b>님이 대신 근무해요</> : <><b>{s.requester}</b>님 대신 근무해요</>} · 승인: {s.approver}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && <ScheduleDayModal dateLabel={selected.dateLabel} subs={selected.subs} onClose={() => setSelected(null)} />}
    </div>
  );
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

const SUB_TIME_ROW_H = 15;

// 내 근무시간표 그리드(08:00~22:00, 30분 단위, 월~일) — 근무 있는 칸만 클릭해 대타가 필요한 시간을 직접 선택
function MyScheduleGrid({ selected, onToggle }) {
  const days = window.subDayCols;
  const times = window.subTimeSlots;
  const scheduleSet = React.useMemo(() => window.myScheduleSlotSet(), []);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: 48 }} />
            {days.map(d => <th key={d} style={{ padding: '6px 0', fontSize: 12, fontWeight: 700, color: '#5B4B33', background: '#F6F0E6', border: '1px solid #E6E8EB' }}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {times.map(t => (
            <tr key={t}>
              <td style={{ fontSize: 10.5, color: '#9AA1A9', textAlign: 'right', paddingRight: 6, border: '1px solid #F3F4F6', whiteSpace: 'nowrap', height: SUB_TIME_ROW_H }}>
                {t.endsWith(':00') ? t : ''}
              </td>
              {days.map(d => {
                const key = `${d}-${t}`;
                const isMine = scheduleSet.has(key);
                const isSel = selected.includes(key);
                if (!isMine) return <td key={key} style={{ height: SUB_TIME_ROW_H, border: '1px solid #F3F4F6', background: '#FAFAFA' }} />;
                return (
                  <td key={key} style={{ padding: 0, border: '1px solid #E6E8EB' }}>
                    <button type="button" title={`${d} ${t}`} onClick={() => onToggle(key)} style={{
                      width: '100%', height: SUB_TIME_ROW_H, border: 'none', cursor: 'pointer', font: 'inherit', padding: 0,
                      background: isSel ? '#B01116' : '#F6C6C6',
                    }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 대타 사유 입력 팝업 — 그리드에서 시간을 고른 뒤 뜸
function ReasonModal({ range, onClose, onSubmit }) {
  const { Icon } = window;
  const [reason, setReason] = React.useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 420, maxWidth: 'calc(100vw - 48px)', padding: 24, boxShadow: '0 20px 50px rgba(16,24,40,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1F2937' }}>대타 요청 사유</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><Icon name="x" size={20} color="#9AA1A9" /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 16px', fontSize: 13, color: '#1F8A4C', fontWeight: 600 }}>
          <Icon name="circle-check" size={15} color="#1F8A4C" /> {range.day} {range.start}~{range.end} · 대타 요청 가능
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="대타 사유를 입력해 주세요"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={() => reason.trim() && onSubmit(reason.trim())} style={{ height: 40, padding: '0 20px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>다음: 동료 찾기</button>
        </div>
      </div>
    </div>
  );
}

const subPanelStyle = { background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 };
const subBackLinkStyle = { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', font: 'inherit', marginBottom: 14, padding: 0 };
const subAvatarStyle = { width: 38, height: 38, borderRadius: '50%', background: '#EEF1F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
function subPrimaryBtn(disabled) {
  return { height: 42, padding: '0 22px', background: disabled ? '#DADEE3' : '#B01116', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 700, color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', font: 'inherit' };
}
function subTabBtn(active) {
  return { height: 36, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', font: 'inherit', border: '1px solid ' + (active ? '#B01116' : '#DADEE3'), background: active ? '#B01116' : '#fff', color: active ? '#fff' : '#4B5563' };
}

function SubstituteScreen() {
  const { Icon, StatusBadge } = window;
  const colleagues = window.deptColleagues;
  const { maskName, maskStudentId, formatDuration, overlapMinutesForRequest, overlapRangesForRequest, slotKeysToRange, timeToMinutes } = window;

  const [view, setView] = React.useState('flow'); // flow | history
  const [history, setHistory] = React.useState(window.substituteHistorySeed || []);
  const [step, setStep] = React.useState('form'); // form | candidates | sent | choose | submitted
  const [selectedSlots, setSelectedSlots] = React.useState([]);
  const [showReasonModal, setShowReasonModal] = React.useState(false);
  const [range, setRange] = React.useState(null); // {day,start,end}
  const [reason, setReason] = React.useState('');
  const [candidateSelection, setCandidateSelection] = React.useState([]); // 가능 여부를 물어볼 동료 id들
  const [responses, setResponses] = React.useState({}); // id -> 'pending' | 'available' | 'unavailable'
  const [chosenId, setChosenId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  const toggleSlot = (key) => {
    setSelectedSlots(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      const [day] = key.split('-');
      const sameDay = prev.every(k => k.split('-')[0] === day);
      const next = sameDay ? [...prev, key] : [key];
      const times = next.map(k => timeToMinutes(k.split('-')[1])).sort((a, b) => a - b);
      for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] !== 30) return [key]; // 연속 아니면 새로 시작
      return next;
    });
  };

  const totalMins = range ? timeToMinutes(range.end) - timeToMinutes(range.start) : 0;
  const available = range ? colleagues
    .filter(c => !c.busy)
    .map(c => ({ c, mins: overlapMinutesForRequest(c, range) }))
    .filter(x => x.mins > 0)
    .sort((a, b) => b.mins - a.mins) : [];
  const busyExcluded = range ? colleagues.filter(c => c.busy && overlapMinutesForRequest(c, range) > 0) : [];
  const anyAvailable = Object.values(responses).some(v => v === 'available');
  const rangeText = (c) => range ? overlapRangesForRequest(c, range).map(r => `${range.day} ${r.start}~${r.end}`).join(', ') : '';

  const toggleCandidate = (id) => setCandidateSelection(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  const markResponse = (id, val) => setResponses(r => ({ ...r, [id]: val }));
  const backTo = (target) => { setNotice(null); setStep(target); };

  const sendToSelected = () => {
    if (candidateSelection.length === 0) return;
    setResponses(Object.fromEntries(candidateSelection.map(id => [id, 'pending'])));
    setNotice(null);
    setStep('sent');
  };

  const finalizeApply = () => {
    const c = colleagues.find(x => x.id === chosenId);
    setHistory(h => [{ date: '2026.08.05', time: `${range.day} ${range.start}-${range.end}`, reason, rep: maskName(c.name), status: '검토 중' }, ...h]);
    setNotice({ tone: 'success', text: '관리자에게 전달했어요. 승인되면 알려드릴게요.' });
    setStep('form');
    setSelectedSlots([]);
    setRange(null);
    setReason('');
    setCandidateSelection([]);
    setResponses({});
    setChosenId(null);
  };

  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>대타 요청</h1>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: '#6B7280' }}>근무가 어려운 일정에 대해 같은 부서 동료에게 대타를 요청할 수 있습니다.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button onClick={() => setView('flow')} style={subTabBtn(view === 'flow')}>새 요청</button>
        <button onClick={() => setView('history')} style={subTabBtn(view === 'history')}>대타 요청 기록</button>
      </div>

      {view === 'history' ? (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>
              {['요청일', '시간', '사유', '대타자', '상태'].map((h, i) => <th key={h} style={{ padding: '13px 18px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: i > 3 ? 'center' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {history.map((r, i) => (
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
      ) : (
        <>
          {step === 'form' && (
            <div style={subPanelStyle}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>내 근무시간표에서 대타가 필요한 시간을 선택하세요</h3>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9AA1A9' }}>진한 칸이 내 근무 시간이에요. 30분 단위로 이어서 선택할 수 있어요.</p>
              <SubNoticeBanner notice={notice} />
              <MyScheduleGrid selected={selectedSlots} onToggle={toggleSlot} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid #EEF0F2', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#3A4048' }}>
                  {selectedSlots.length > 0
                    ? (() => { const r = slotKeysToRange(selectedSlots); return <>선택한 시간: <b>{r.day} {r.start}~{r.end}</b></>; })()
                    : '근무 칸을 클릭해 대타가 필요한 시간을 선택하세요.'}
                </div>
                <button onClick={() => selectedSlots.length && setShowReasonModal(true)} disabled={selectedSlots.length === 0} style={subPrimaryBtn(selectedSlots.length === 0)}>대타 사유 입력</button>
              </div>
            </div>
          )}

          {showReasonModal && selectedSlots.length > 0 && (
            <ReasonModal range={slotKeysToRange(selectedSlots)} onClose={() => setShowReasonModal(false)} onSubmit={(r) => {
              setReason(r);
              setRange(slotKeysToRange(selectedSlots));
              setShowReasonModal(false);
              setCandidateSelection([]);
              setResponses({});
              setChosenId(null);
              setNotice(null);
              setStep('candidates');
            }} />
          )}

          {step === 'candidates' && range && (
            <div style={subPanelStyle}>
              <button onClick={() => backTo('form')} style={subBackLinkStyle}><Icon name="chevron-left" size={16} color="#9AA1A9" /> 시간 다시 선택</button>
              <SubNoticeBanner notice={notice} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>대타 가능한 동료</h3>
                <span style={{ fontSize: 13, color: '#6B7280' }}>{range.day} {range.start}~{range.end} · {window.currentUser.workDept}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#9AA1A9', marginBottom: 4 }}>
                <Icon name="lock" size={13} color="#9AA1A9" /> 개인정보 보호를 위해 이름·학번 일부가 가려져 표시됩니다.
              </div>
              <div style={{ fontSize: 12.5, color: '#9AA1A9', marginBottom: 16 }}>전체 시간이 아니어도 일부만 가능한 동료도 함께 보여드려요. 여러 명을 골라 동시에 가능 여부를 물어볼 수 있어요.</div>

              {available.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9AA1A9', fontSize: 13.5 }}>
                  이 시간에 조금이라도 가능한 같은 부서 동료가 없어요. 다른 시간을 선택하거나 나중에 다시 시도해 주세요.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12.5, color: '#6B7280', fontWeight: 600 }}>총 {available.length}명 가능 (일부 시간만 가능한 동료 포함)</div>
                  {available.map(({ c, mins }) => {
                    const on = candidateSelection.includes(c.id);
                    const full = mins >= totalMins;
                    return (
                      <label key={c.id} style={{ border: '1px solid ' + (on ? '#B01116' : '#E6E8EB'), background: on ? '#FDF6F6' : '#fff', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => toggleCandidate(c.id)} style={{ width: 18, height: 18, accentColor: '#B01116', flexShrink: 0 }} />
                        <span style={subAvatarStyle}><Icon name="user" size={18} color="#5B6570" /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1F2937' }}>{maskName(c.name)} <span style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 500 }}>({maskStudentId(c.sid)})</span></div>
                          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{c.dept} · {rangeText(c)}</div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: full ? '#E7F4EA' : '#FDEEE0', color: full ? '#1F8A4C' : '#D9791F', whiteSpace: 'nowrap' }}>
                          {formatDuration(mins)} 가능{full ? ' (전체)' : ''}
                        </span>
                      </label>
                    );
                  })}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEF0F2' }}>
                <button onClick={sendToSelected} disabled={candidateSelection.length === 0} style={subPrimaryBtn(candidateSelection.length === 0)}>
                  선택한 동료{candidateSelection.length > 0 ? ` ${candidateSelection.length}명` : ''}에게 가능 여부 요청
                </button>
              </div>
            </div>
          )}

          {step === 'sent' && range && (
            <div style={subPanelStyle}>
              <button onClick={() => backTo('candidates')} style={subBackLinkStyle}><Icon name="chevron-left" size={16} color="#9AA1A9" /> 다른 동료 더 선택</button>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>가능 여부를 물어봤어요</h3>
              <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#6B7280' }}>선택한 동료들에게 카카오워크로 가능 여부를 물어봤어요. 아직 확정된 대타는 아니에요.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {candidateSelection.map(id => {
                  const c = colleagues.find(x => x.id === id);
                  const resp = responses[id];
                  return (
                    <div key={id}>
                      <KakaoBubble to={`${maskName(c.name)}님`}>
                        {range.day} {range.start}~{range.end} {window.currentUser.workDept} 근무 대타가 가능하신가요?<br />사유: {reason || '—'}<br />가능/불가능으로 알려주세요.
                      </KakaoBubble>
                      <div style={{ marginTop: 8 }}>
                        {resp === 'available' && <span style={{ fontSize: 12, fontWeight: 700, color: '#1F8A4C' }}>가능하다고 답변함</span>}
                        {resp === 'unavailable' && <span style={{ fontSize: 12, fontWeight: 700, color: '#9AA1A9' }}>불가능하다고 답변함</span>}
                        {resp === 'pending' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => markResponse(id, 'available')} style={{ height: 32, padding: '0 14px', background: '#1F8A4C', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>(데모) 가능</button>
                            <button onClick={() => markResponse(id, 'unavailable')} style={{ height: 32, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#6B7280', cursor: 'pointer', font: 'inherit' }}>(데모) 불가능</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed #E6E8EB', fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>
                데모 미리보기 — 실제 서비스에서는 상대방의 카카오워크 앱에 알림이 가고, 그 화면에서 가능/불가능을 답합니다. 지금은 시연을 위해 이 자리에서 응답을 대신 선택해 보세요.
              </div>
              <div style={{ textAlign: 'right', marginTop: 14 }}>
                <button onClick={() => setStep('choose')} disabled={!anyAvailable} style={subPrimaryBtn(!anyAvailable)}>다음: 대타자 선택</button>
              </div>
            </div>
          )}

          {step === 'choose' && range && (
            <div style={subPanelStyle}>
              <button onClick={() => backTo('sent')} style={subBackLinkStyle}><Icon name="chevron-left" size={16} color="#9AA1A9" /> 응답 목록으로</button>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>실제 대타자를 선택하세요</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6B7280' }}>가능하다고 답변한 동료 중 한 명을 선택해 관리자에게 최종 요청합니다.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {candidateSelection.filter(id => responses[id] === 'available').map(id => {
                  const c = colleagues.find(x => x.id === id);
                  const mins = overlapMinutesForRequest(c, range);
                  const on = chosenId === id;
                  return (
                    <label key={id} style={{ border: '1px solid ' + (on ? '#B01116' : '#E6E8EB'), background: on ? '#FDF6F6' : '#fff', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <input type="radio" name="chosenCandidate" checked={on} onChange={() => setChosenId(id)} style={{ width: 18, height: 18, accentColor: '#B01116', flexShrink: 0 }} />
                      <span style={subAvatarStyle}><Icon name="user" size={18} color="#5B6570" /></span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1F2937' }}>{maskName(c.name)} <span style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 500 }}>({maskStudentId(c.sid)})</span></div>
                        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{rangeText(c)}</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1F8A4C' }}>{formatDuration(mins)} 가능</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ textAlign: 'right', marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEF0F2' }}>
                <button onClick={() => chosenId && setStep('submitted')} disabled={!chosenId} style={subPrimaryBtn(!chosenId)}>선택한 동료로 최종 요청 · 관리자에게 전달</button>
              </div>
            </div>
          )}

          {step === 'submitted' && chosenId && range && (() => {
            const c = colleagues.find(x => x.id === chosenId);
            return (
              <div style={subPanelStyle}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>관리자에게 승인 요청을 보냈어요</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#6B7280' }}>카카오워크로 {window.currentUser.workDept} 관리자에게 전달했어요. 승인되면 알려드릴게요.</p>
                <KakaoBubble to={`${window.currentUser.workDept} 관리자`}>
                  {window.currentUser.name} 학생이 {range.day} {range.start}~{range.end} 근무 대타 승인을 요청했어요.<br />대타자: {maskName(c.name)}님(가능 답변 확인됨) · 사유: {reason || '—'}
                </KakaoBubble>
                <div style={{ marginTop: 18, textAlign: 'right' }}>
                  <button onClick={finalizeApply} style={{ height: 42, padding: '0 28px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>확인</button>
                </div>
              </div>
            );
          })()}
        </>
      )}
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
