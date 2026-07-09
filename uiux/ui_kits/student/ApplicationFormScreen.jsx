// 지원서 작성 (application form) — includes submit modal + 지원 완료
function ApplicationFormScreen({ onBack, onDone, onGoStatus }) {
  const { Icon, TimeGrid } = window;
  const [showModal, setShowModal] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [selectedJobId, setSelectedJobId] = React.useState(window.formJob.id || window.formJobs[0]?.id);
  const [syncSchedule, setSyncSchedule] = React.useState(false);
  const u = window.currentUser;
  const job = React.useMemo(() => {
    return window.formJobs.find((item) => item.id === selectedJobId) || window.formJobs[0];
  }, [selectedJobId]);
  const requiredItems = job.required || [];
  const preferredItems = job.preferred || [];
  const classSlots = job.classSlots || [];
  const checkedSlots = job.checkedSlots || [];

  const getScheduleIntervals = (job) => {
    if (!job || !job.team) return [];

    if (['학생지원팀', '종합봉사실'].includes(job.team)) {
      return [
        { label: '09:00-10:30', times: ['09:00', '10:00'], duration: 1.5 },
        { label: '10:30-12:00', times: ['10:30', '11:00'], duration: 1.5 },
        { label: '12:00-13:00', times: ['12:00'], duration: 1 },
        { label: '13:00-15:00', times: ['13:00', '14:00'], duration: 2 },
        { label: '15:00-17:00', times: ['15:00', '16:00'], duration: 2 },
      ];
    }

    if (job.team === '정보서비스팀') {
      return [
        { label: '08:00-09:00', times: ['08:00'], duration: 1 },
        { label: '09:00-10:30', times: ['09:00', '10:00'], duration: 1.5 },
        { label: '10:30-12:00', times: ['10:30', '11:00'], duration: 1.5 },
        { label: '12:00-13:30', times: ['12:00', '13:00'], duration: 1.5 },
        { label: '13:30-15:00', times: ['13:30', '14:00'], duration: 1.5 },
        { label: '15:00-16:30', times: ['15:00', '16:00'], duration: 1.5 },
        { label: '16:30-18:00', times: ['16:30', '17:00'], duration: 1.5 },
        { label: '18:00-19:00', times: ['18:00'], duration: 1 },
        { label: '19:00-22:00', times: ['19:00', '20:00', '21:00'], duration: 3 },
      ];
    }

    return [
      { label: '09:00-10:30', times: ['09:00', '10:00'], duration: 1.5 },
      { label: '10:30-12:00', times: ['10:30', '11:00'], duration: 1.5 },
      { label: '12:00-13:30', times: ['12:00', '13:00'], duration: 1.5 },
      { label: '13:30-15:00', times: ['13:30', '14:00'], duration: 1.5 },
    ];
  };

  const scheduleIntervals = getScheduleIntervals(job);
  const scheduleDays = ['월', '화', '수', '목', '금'];
  const slotKey = (day, interval) => `${day}-${interval.label}`;
  const isClassSlot = (day, interval) => interval.times.some((time) => classSlots.includes(`${day}-${time}`));

  const [selectedScheduleSlots, setSelectedScheduleSlots] = React.useState(() => {
    const initial = new Set();
    checkedSlots.forEach((slot) => {
      const [day, time] = slot.split('-');
      scheduleIntervals.forEach((interval) => {
        if (interval.times.includes(time)) initial.add(slotKey(day, interval));
      });
    });
    return initial;
  });

  React.useEffect(() => {
    const next = new Set();
    checkedSlots.forEach((slot) => {
      const [day, time] = slot.split('-');
      scheduleIntervals.forEach((interval) => {
        if (interval.times.includes(time)) next.add(slotKey(day, interval));
      });
    });
    setSelectedScheduleSlots(next);
  }, [selectedJobId, checkedSlots.join('|')] );

  const toggleScheduleSlot = (day, interval) => {
    if (isClassSlot(day, interval)) return;
    const key = slotKey(day, interval);
    setSelectedScheduleSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (submitted) return <SubmitComplete onGoStatus={onGoStatus} onBack={onBack} />;

  const lockedField = (label, value, locked) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input defaultValue={value} readOnly={locked}
          style={{ width: '100%', height: 40, padding: '0 14px', border: '1px solid ' + (locked ? '#E6E8EB' : '#DADEE3'), borderRadius: 8, fontSize: 14, font: 'inherit', boxSizing: 'border-box', background: locked ? '#F6F7F9' : '#fff', color: locked ? '#6B7280' : '#1F2937' }} />
        {locked && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}><Icon name="lock" size={14} color="#B9BFC6" /></span>}
      </div>
    </div>
  );

  const checkChip = (label) => (
    <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1px solid #E6E8EB', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer' }}>
      <input type="checkbox" defaultChecked style={{ width: 15, height: 15, accentColor: '#B01116' }} /> {label}
    </label>
  );

  const renderScheduleCell = (day, interval) => {
    const key = slotKey(day, interval);
    const isClass = isClassSlot(day, interval);
    const selected = selectedScheduleSlots.has(key);
    const background = isClass ? '#B01116' : selected ? '#DCFCE7' : '#fff';
    const textColor = isClass ? '#fff' : selected ? '#047857' : '#6B7280';

    return (
      <button
        key={key}
        type="button"
        onClick={() => toggleScheduleSlot(day, interval)}
        disabled={isClass}
        title={isClass ? '수업시간' : selected ? '근무 가능' : '근무 불가'}
        style={{
          width: '100%',
          height: '100%',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background,
          color: textColor,
          borderRadius: 8,
          cursor: isClass ? 'not-allowed' : 'pointer',
          font: 'inherit',
        }}
      >
        {isClass ? (<span style={{ fontSize: 12, fontWeight: 700 }}>수업</span>) : selected ? (<Icon name="check" size={14} color="#047857" />) : null}
      </button>
    );
  };

  const renderScheduleGrid = () => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 760 }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #E6E8EB', background: '#F8FAFC', padding: 14, fontSize: 13, fontWeight: 700, color: '#4B5563', textAlign: 'left', width: 180 }}>요일 / 시간</th>
            {scheduleDays.map((day) => (
              <th key={day} style={{ border: '1px solid #E6E8EB', background: '#F8FAFC', padding: 14, fontSize: 13, fontWeight: 700, color: '#4B5563', textAlign: 'center' }}>{day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scheduleIntervals.map((interval) => (
            <tr key={interval.label} style={{ height: 64 }}>
              <td style={{ border: '1px solid #E6E8EB', background: '#F8FAFC', padding: 14, fontSize: 13, fontWeight: 700, color: '#4B5563' }}>{interval.label}</td>
              {scheduleDays.map((day) => (
                <td key={`${day}-${interval.label}`} style={{ border: '1px solid #E6E8EB', padding: 6, background: '#fff' }}>
                  {renderScheduleCell(day, interval)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 12, fontSize: 12, color: '#6B7280' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, background: '#B01116', borderRadius: 3, display: 'inline-block' }}></span>
          수업시간
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, background: '#DCFCE7', borderRadius: 3, display: 'inline-block' }}></span>
          선택된 근무 가능 시간
        </span>
      </div>
    </div>
  );

  const summaryItem = (icon, label, value) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9AA1A9', fontWeight: 600 }}><Icon name={icon} size={13} color="#B9BFC6" /> {label}</span>
      <span style={{ fontSize: 13, color: '#3A4048', fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>지원서 작성</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>현재 모집 중인 공고를 선택하고 지원서를 작성해 주세요.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#F3F0FC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkles" size={18} color="#6D4FCB" /></span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>AI 작성 보조</div>
                <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>지원 동기와 경험을 자연스럽게 다듬어 드립니다.</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['sparkles','지원 동기 예시 생성'],['file-text','관련 경험 예시 생성'],['pen-line','역량 키워드 정리'],['wand-2','맞춤 문장 다듬기']].map(([ic, label]) => (
                <button key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 14px', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                  <Icon name={ic} size={16} color="#8A929B" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* 지원 공고 선택 + summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>지원 공고 선택</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  style={{ width: '100%', height: 46, padding: '0 14px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, color: '#1F2937', background: '#fff', cursor: 'pointer', font: 'inherit' }}>
                  {window.formJobs.map((item) => (
                    <option key={item.id} value={item.id}>{item.team} | {item.title}</option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
                  선택한 공고의 요약 카드와 아래 작성 항목이 자동으로 동기화됩니다.
                </div>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ width: 42, height: 42, borderRadius: '50%', background: '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="briefcase" size={20} color="#1F8A4C" /></span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>{job.team} <span style={{ color: '#D5D8DC' }}>|</span> {job.title}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                {summaryItem('calendar', '근무기간', job.period)}
                {summaryItem('clock', '근무시간', job.hours)}
                {summaryItem('users', '모집인원', job.headcount)}
                {summaryItem('timer', '주당 근무시간', job.weeklyMax)}
                {summaryItem('calendar-x', '마감일', job.deadline)}
              </div>
            </div>
          </div>

          {/* 1 + 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>1. 지원자 정보</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                {lockedField('이름', u.name, true)}
                {lockedField('학번', u.studentId, true)}
              </div>
              <div style={{ marginBottom: 14 }}>{lockedField('학과(부)', u.major, true)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                {lockedField('연락처', u.phone, false)}
                {lockedField('이메일', u.email, false)}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>이름, 학번, 학과는 SAINT 학생정보와 자동 연동되어 수정할 수 없습니다. 연락처와 이메일만 수정 가능합니다.</p>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>2. 자기소개서 및 지원 동기</h3>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>지원 동기 <span style={{ color: '#B01116' }}>*</span></div>
                <div style={{ position: 'relative' }}>
                  <textarea placeholder="학생 서비스를 지원하고 행정 업무를 보조하고자 하는 동기를 작성해 주세요." style={{ width: '100%', height: 76, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                  <span style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 11, color: '#B9BFC6' }}>0 / 500자</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>관련 경험 및 역량 <span style={{ color: '#B01116' }}>*</span></div>
                <div style={{ position: 'relative' }}>
                  <textarea placeholder="민원 응대, 문서 정리, 자료 입력, 서비스 마인드, 엑셀 활용, 문서 작성 경험 등 관련 경험과 역량을 작성해 주세요." style={{ width: '100%', height: 90, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                  <span style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 11, color: '#B9BFC6' }}>0 / 1,000자</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3 + 4 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>3. 공고별 확인 사항</h3>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>필수 조건</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>{requiredItems.map(checkChip)}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>우대 역량</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{preferredItems.map(checkChip)}</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>4. 근무 가능 시간</h3>
                <button
                  type="button"
                  onClick={() => setSyncSchedule((prev) => !prev)}
                  style={{ height: 38, padding: '0 14px', background: syncSchedule ? '#D1D5DB' : '#B01116', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: syncSchedule ? '#4B5563' : '#fff', cursor: 'pointer', font: 'inherit' }}
                >
                  시간표 연동하기
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6 }}>
                  수업 시간은 빨간 블록으로 표시되며, 체크하지 않으면 해당 항목 옆에 ‘불가능’으로 표시됩니다. 원하는 시간을 눌러 가능 여부를 선택해 주세요.
                </div>
                {syncSchedule && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8', fontSize: 13, border: '1px solid #BFDBFE' }}>
                    <Icon name="calendar-days" size={14} color="#1D4ED8" /> 시간표 연동 활성화됨
                  </div>
                )}
              </div>
              {syncSchedule ? renderScheduleGrid() : <TimeGrid redSlots={classSlots} checkSlots={checkedSlots} redLabel="수업시간" />}
            </div>
          </div>

          {/* Footer buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <button onClick={onBack} style={{ height: 46, padding: '0 20px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>이전 (공고 상세로)</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ height: 46, padding: '0 22px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>임시저장</button>
              <button onClick={() => setShowPreview(true)} style={{ height: 46, padding: '0 22px', background: '#fff', border: '1.5px solid #B01116', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#B01116', cursor: 'pointer', font: 'inherit' }}>미리보기</button>
              <button onClick={() => setShowModal(true)} style={{ height: 46, padding: '0 30px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>제출하기</button>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 84 }}>
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>공고별 주요 조건</h3>
            <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6, marginBottom: 14 }}>
              선발 담당자가 선택한 필수 조건과 우대 역량을 학생이 확인할 수 있는 구조입니다. 공고 선택에 따라 아래 항목이 자동으로 변경됩니다.
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>필수 조건</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {requiredItems.map(r => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3A4048' }}>
                  <Icon name="check-circle-2" size={15} color="#B01116" /> {r}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>우대 역량</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {preferredItems.map(r => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3A4048' }}>
                  <Icon name="check-circle-2" size={15} color="#B01116" /> {r}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>제출 전 체크리스트</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#4B5563' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="check" size={14} color="#1F8A4C" /> 공고 정보 확인</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="check" size={14} color="#1F8A4C" /> 필수 항목 작성</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="check" size={14} color="#1F8A4C" /> 근무 가능 시간 선택</div>
            </div>
          </div>
        </div>
      </div>

      {showPreview && <PreviewModal job={job} onCancel={() => setShowPreview(false)} />}
      {showModal && <SubmitModal job={job} onCancel={() => setShowModal(false)} onConfirm={() => { setShowModal(false); setSubmitted(true); }} />}
    </div>
  );
}

function PreviewModal({ job, onCancel }) {
  const { Icon } = window;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,28,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 520, background: '#fff', borderRadius: 16, padding: 28, position: 'relative', boxShadow: '0 20px 48px rgba(0,0,0,.2)' }}>
        <button onClick={onCancel} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="x" size={20} color="#9AA1A9" /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#F3F0FC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="file-text" size={22} color="#6D4FCB" /></span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937' }}>지원서 미리보기</div>
            <div style={{ fontSize: 13, color: '#9AA1A9', marginTop: 2 }}>입력한 내용을 확인한 뒤 제출해 주세요.</div>
          </div>
        </div>
        <div style={{ background: '#FAFBFC', border: '1px solid #EDEFF1', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3A4048' }}>{job.team} | {job.title}</div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>지원 동기: 작성 완료</div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>관련 경험 및 역량: 작성 완료</div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>근무 가능 시간: 월·수 오전 근무 가능</div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 46, background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 15, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>닫기</button>
          <button onClick={onCancel} style={{ flex: 1, height: 46, background: '#B01116', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>계속 작성</button>
        </div>
      </div>
    </div>
  );
}

function SubmitModal({ job, onCancel, onConfirm }) {
  const { Icon } = window;
  const row = (label, value, ok) => (
    <div style={{ display: 'flex', gap: 16, fontSize: 14, marginBottom: 10 }}>
      <span style={{ width: 110, color: '#6B7280', fontWeight: 600 }}>{label}</span>
      <span style={{ color: ok ? '#1F8A4C' : '#1F2937', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        {ok && <Icon name="check" size={15} color="#1F8A4C" />}{value}
      </span>
    </div>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,28,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 480, background: '#fff', borderRadius: 16, padding: 32, position: 'relative', boxShadow: '0 20px 48px rgba(0,0,0,.2)' }}>
        <button onClick={onCancel} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="x" size={20} color="#9AA1A9" /></button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
          <span style={{ width: 60, height: 60, borderRadius: '50%', background: '#FDECEC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Icon name="clipboard-check" size={28} color="#B01116" />
          </span>
          <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#1F2937' }}>지원서를 제출하시겠습니까?</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>제출 후에는 수정할 수 없으며,<br />관리자 검토가 시작됩니다.</p>
        </div>
        <div style={{ borderTop: '1px solid #EDEFF1', paddingTop: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3A4048', marginBottom: 14 }}>지원 정보 요약</div>
          {row('공고명', job.title)}
          {row('부서', job.team)}
          {row('지원 동기', '작성 완료', true)}
          {row('관련 경험 및 역량', '작성 완료', true)}
          {row('근무 가능 시간', '월·수 오전 (09:30~12:30)')}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: 14, background: '#FDF2F2', borderRadius: 8, marginBottom: 20 }}>
          <Icon name="alert-circle" size={16} color="#B01116" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: '#B01116', lineHeight: 1.6 }}>제출 후에는 내용을 수정할 수 없습니다.<br />입력한 내용이 정확한지 다시 한번 확인해 주세요.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 48, background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 15, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>취소</button>
          <button onClick={onConfirm} style={{ flex: 1, height: 48, background: '#B01116', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>최종 제출</button>
        </div>
      </div>
    </div>
  );
}

function SubmitComplete({ onGoStatus, onBack }) {
  const { Icon } = window;
  const row = (label, value, badge) => (
    <div style={{ display: 'flex', gap: 20, fontSize: 15, marginBottom: 14 }}>
      <span style={{ width: 90, color: '#6B7280', fontWeight: 600, textAlign: 'right' }}>{label}</span>
      {badge ? <span style={{ display: 'inline-flex', padding: '3px 10px', background: '#E7F4EA', color: '#1F8A4C', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>{value}</span>
        : <span style={{ color: '#1F2937', fontWeight: 600 }}>{value}</span>}
    </div>
  );
  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>지원 완료</h1>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280' }}>지원서가 정상적으로 제출되었습니다.</p>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '44px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 30 }}>
          <span style={{ width: 88, height: 88, borderRadius: '50%', border: '4px solid #1F8A4C', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Icon name="check" size={44} color="#1F8A4C" strokeWidth={2.5} />
          </span>
          <h2 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 800, color: '#1F8A4C' }}>지원서가 제출되었습니다!</h2>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>소중한 지원 감사합니다. 선발 진행 상태는 '내 지원 현황'에서 확인하실 수 있습니다.</p>
        </div>
        <div style={{ maxWidth: 460, margin: '0 auto', background: '#FAFBFC', border: '1px solid #EDEFF1', borderRadius: 10, padding: '24px 28px', marginBottom: 24 }}>
          {row('공고명', '학생지원팀 행정 보조 근로')}
          {row('부서', '학생지원팀')}
          {row('접수 상태', '지원 완료', true)}
          {row('접수 일시', '2026.05.20 (화) 15:30')}
          {row('지원자', '안희진 (학번 20220042)')}
        </div>
        <div style={{ maxWidth: 520, margin: '0 auto 28px', display: 'flex', gap: 10 }}>
          <Icon name="info" size={16} color="#B9BFC6" style={{ marginTop: 2, flexShrink: 0 }} />
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, color: '#6B7280', lineHeight: 1.9 }}>
            <li>• 제출하신 지원서는 담당자가 검토 후 선발 절차가 진행됩니다.</li>
            <li>• 선발 결과는 알림 및 '내 지원 현황'에서 확인하실 수 있습니다.</li>
            <li>• 필요 시 추가 서류 제출을 요청드릴 수 있습니다.</li>
          </ul>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onGoStatus} style={{ height: 48, padding: '0 30px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>내 지원 현황 보기</button>
          <button onClick={onBack} style={{ height: 48, padding: '0 30px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 15, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>다른 공고 보기</button>
        </div>
      </div>
    </div>
  );
}
window.ApplicationFormScreen = ApplicationFormScreen;
