// 교내 근로 모집 공고(window.posts) 한 건을 지원서 작성 화면에서 쓰는 공고 형태로 변환
function postToJob(p) {
  return {
    id: p.id,
    team: p.team || p.dept,
    dept: p.dept,
    title: p.title,
    icon: 'briefcase',
    status: p.status,
    period: p.period,
    hours: p.hours,
    headcount: p.headcount,
    weeklyMax: p.weeklyMax,
    deadline: p.deadline,
    dday: p.dday,
    required: p.qualifications || [],
    preferred: p.preferred ? p.preferred.split(/,\s*/).filter(Boolean) : [],
    checkedSlots: p.workSlots || [],
    customQuestions: p.customQuestions || [],
  };
}

// 지원서 작성 (application form) — includes submit modal + 지원 완료
function ApplicationFormScreen({ onBack, onDone, onGoStatus, initialPostId }) {
  const { Icon, StatusBadge } = window;
  const [showModal, setShowModal] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [showJobPicker, setShowJobPicker] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  // 교내 근로 모집 공고 탭(window.posts)에 등록된 모든 공고를 그대로 반영
  const allJobs = React.useMemo(() => (window.posts || []).map(postToJob), []);
  const [selectedJobId, setSelectedJobId] = React.useState(initialPostId || allJobs[0]?.id);
  const [profileLoaded, setProfileLoaded] = React.useState(false);
  const [experienceText, setExperienceText] = React.useState('');
  const [motivationText, setMotivationText] = React.useState('');
  const [customAnswers, setCustomAnswers] = React.useState({}); // { [질문 텍스트]: 답변 }
  const u = window.currentUser;
  const job = React.useMemo(() => {
    return allJobs.find((item) => item.id === selectedJobId) || allJobs[0];
  }, [allJobs, selectedJobId]);
  const requiredItems = job.required || [];
  const preferredItems = job.preferred || [];
  const customQuestionItems = job.customQuestions || [];

  // 근무 가능 시간 — 공통 지원서의 시간표(수강신청 자동 연동)와 동일한 그리드를 사용
  const classSlots = (window.commonProfile && window.commonProfile.classSlots) || [];
  const [selectedSlots, setSelectedSlots] = React.useState(() => new Set(job.checkedSlots || []));

  // 공고를 바꾸면, 아직 공통 지원서를 불러오지 않은 상태에서는 해당 공고의 추천 가능 시간으로 갱신
  React.useEffect(() => {
    if (!profileLoaded) setSelectedSlots(new Set(job.checkedSlots || []));
  }, [selectedJobId]);

  const toggleSlot = (key) => {
    if (classSlots.includes(key)) return;
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 공통 지원서 불러오기 — 인적사항·경력·자격증·근무 가능 시간을 마스터 프로필에서 채움
  const loadProfile = () => {
    const prof = window.commonProfile;
    if (!prof) return;
    // 공통 지원서에서 선택한 시간표 내역을 그대로 반영 (이후 수업시간을 제외하고 자유롭게 편집 가능)
    setSelectedSlots(new Set(prof.availableSlots));
    setProfileLoaded(true);
  };
  const profileCounts = window.commonProfile ? {
    careers: window.commonProfile.careers.length,
    quals: window.commonProfile.languages.length + window.commonProfile.certificates.length,
    interests: window.commonProfile.interests.length,
  } : { careers: 0, quals: 0, interests: 0 };

  // 제출하기 확정 시 관리자 콘솔의 "학생 선발" 지원자 목록에 그대로 반영되도록 공유 저장소에 저장
  const submitApplication = () => {
    if (!window.SharedApplicantsStore) return;
    const prof = profileLoaded ? window.commonProfile : null;
    const pad = (n) => String(n).padStart(2, '0');
    const today = new Date();
    const applyDate = `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`;
    const quals = prof
      ? [...prof.languages.map((l) => `${l.test} ${l.score} (${l.date})`), ...prof.certificates.map((c) => `${c.name} (${c.date})`)]
      : [];
    const careers = prof
      ? prof.careers.map((c) => ({ type: c.type, org: c.org, role: c.role, period: c.period, detail: c.detail }))
      : [];
    window.SharedApplicantsStore.add({
      id: 'SUB-' + Date.now(),
      postId: job.id,
      name: u.name, sid: u.studentId, major: u.major, grade: u.grade, gpa: u.gpa,
      status: '검토중', applyDate,
      phone: u.phone, email: u.email,
      interests: prof ? prof.interests : [],
      motivation: motivationText,
      experienceText: prof ? '' : experienceText,
      careers, quals,
      customAnswers: customQuestionItems.map((q) => ({ question: q, answer: customAnswers[q] || '' })),
      classSlots, availableSlots: [...selectedSlots],
      note: '',
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

  // 공통 지원서(ProfileScreen)의 시간표와 동일한 그리드 — 수업시간은 잠기고, 나머지는 자유롭게 선택/해제
  const renderScheduleGrid = () => (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#5B4B33', width: 68 }}>시간</th>
            {window.dayCols.map((d) => (
              <th key={d} style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 13, fontWeight: 700, color: '#5B4B33' }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {window.timeRows.map((t) => (
            <tr key={t}>
              <td style={{ border: '1px solid #E6E8EB', background: '#FAFAFA', textAlign: 'center', fontSize: 12, color: '#6B7280', height: 32 }}>{t}</td>
              {window.dayCols.map((d) => {
                const key = d + '-' + t;
                const isClass = classSlots.includes(key);
                const isSelected = selectedSlots.has(key);
                return (
                  <td key={key} style={{ border: '1px solid #E6E8EB', padding: 0, height: 32 }}>
                    <button
                      type="button"
                      onClick={() => toggleSlot(key)}
                      disabled={isClass}
                      title={isClass ? '수업시간 (선택 불가)' : isSelected ? '근무 가능 (클릭하여 해제)' : '클릭하여 근무 가능 표시'}
                      style={{
                        width: '100%', height: '100%', border: 'none', padding: 0, font: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isClass ? '#B01116' : isSelected ? '#FDECEC' : '#fff',
                        color: '#fff', fontSize: 11, fontWeight: 600,
                        cursor: isClass ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isClass ? '수업' : isSelected ? <Icon name="check" size={14} color="#B01116" /> : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 12, color: '#6B7280' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, background: '#B01116', borderRadius: 3, display: 'inline-block' }}></span>
          수업시간 (수강신청 자동 연동 · 선택 불가)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={14} color="#B01116" /> 근무 가능 시간 (클릭하여 표시/해제)
        </span>
      </div>
    </div>
  );

  // 공통 지원서와 동일한 표 형식으로 경력·자격 정보를 보여줌 (읽기 전용)
  const renderExperienceTable = () => {
    const prof = window.commonProfile;
    if (!prof) return null;
    const thStyle = { padding: '9px 12px', fontSize: 12, fontWeight: 700, color: '#5B4B33', background: '#F6F0E6', borderBottom: '1px solid #E6E8EB', textAlign: 'left', whiteSpace: 'nowrap' };
    const tdStyle = { padding: '8px 12px', borderBottom: '1px solid #EEF0F2', fontSize: 13, color: '#3A4048' };
    const quals = [...prof.languages.map(l => `${l.test} ${l.score} (${l.date})`), ...prof.certificates.map(c => `${c.name} (${c.date})`)];
    return (
      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 90 }}>구분</th>
              <th style={{ ...thStyle, width: 130 }}>기관</th>
              <th style={{ ...thStyle, width: 90 }}>직책</th>
              <th style={{ ...thStyle, width: 90 }}>직무</th>
              <th style={{ ...thStyle, width: 120 }}>기간</th>
              <th style={thStyle}>세부내용</th>
            </tr>
          </thead>
          <tbody>
            {prof.careers.map(c => (
              <tr key={c.id}>
                <td style={tdStyle}>
                  {c.auto ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#B01116', background: '#FDECEC', padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                      {c.type} <span style={{ fontSize: 10, fontWeight: 600, color: '#2563C9', background: '#E8F0FB', padding: '1px 6px', borderRadius: 8 }}>자동</span>
                    </span>
                  ) : c.type}
                </td>
                <td style={tdStyle}>{c.org}</td>
                <td style={tdStyle}>{c.role}</td>
                <td style={tdStyle}>{c.field}</td>
                <td style={tdStyle}>{c.period}</td>
                <td style={tdStyle}>{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {quals.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {quals.map(q => (
              <span key={q} style={{ fontSize: 12, fontWeight: 600, color: '#4B5563', background: '#F6F7F9', border: '1px solid #E6E8EB', padding: '4px 10px', borderRadius: 12 }}>{q}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

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
          {/* 공통 지원서 불러오기 */}
          <div style={{
            background: profileLoaded ? '#F1F9F3' : '#fff',
            border: profileLoaded ? '1px solid #BFE3C8' : '1.5px solid #B01116',
            borderRadius: 12, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ width: 42, height: 42, borderRadius: '50%', background: profileLoaded ? '#E7F4EA' : '#FDECEC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={profileLoaded ? 'check' : 'id-card'} size={20} color={profileLoaded ? '#1F8A4C' : '#B01116'} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {profileLoaded ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1F8A4C' }}>공통 지원서를 불러왔습니다</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {['기본 인적사항', `경력 ${profileCounts.careers}건`, `관심 분야 ${profileCounts.interests}건`, `자격증·어학 ${profileCounts.quals}건`, '근무 가능 시간'].map(label => (
                      <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#1F8A4C', background: '#fff', border: '1px solid #CDE8D4', padding: '4px 10px', borderRadius: 12 }}>
                        <Icon name="check" size={12} color="#1F8A4C" /> {label}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>공통 지원서 불러오기</div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>미리 저장해 둔 인적사항·경력·자격증·근무 가능 시간이 자동으로 채워집니다. 지원 동기만 작성하면 끝!</div>
                </>
              )}
            </div>
            {!profileLoaded && (
              <button onClick={loadProfile} style={{ height: 42, padding: '0 20px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>불러오기</button>
            )}
          </div>

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
                <button type="button" onClick={() => setShowJobPicker(true)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  border: '1.5px solid #E6E8EB', borderRadius: 10, background: '#FAFBFC', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#FDECEC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="briefcase" size={16} color="#B01116" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge status={job.status} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.team} | {job.title}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>{job.hours} · 마감 {job.deadline}</span>
                  </span>
                  <Icon name="chevron-down" size={16} color="#9AA1A9" />
                </button>
                <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
                  전체 {allJobs.length}건의 공고 중에서 선택할 수 있습니다. 선택한 공고의 요약 카드와 아래 작성 항목이 자동으로 동기화됩니다.
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

          {/* 1 */}
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>1. 지원자 정보</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 12 }}>
              {lockedField('이름', u.name, true)}
              {lockedField('학번', u.studentId, true)}
              {lockedField('학과(부)', u.major, true)}
              {lockedField('연락처', u.phone, false)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 12 }}>
              {lockedField('이메일', u.email, false)}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>이름, 학번, 학과는 SAINT 학생정보와 자동 연동되어 수정할 수 없습니다. 연락처와 이메일만 수정 가능합니다.</p>
            {profileLoaded && window.commonProfile && window.commonProfile.interests.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #EEF0F2' }}>
                <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 8 }}>관심 분야</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {window.commonProfile.interests.map((label) => (
                    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#B01116', background: '#FDECEC', border: '1px solid #EBB9B8', padding: '4px 10px', borderRadius: 12 }}>
                      <Icon name="check" size={12} color="#B01116" /> {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2 */}
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>2. 자기소개서 및 지원 동기</h3>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>지원 동기 <span style={{ color: '#B01116' }}>*</span></div>
                <div style={{ position: 'relative' }}>
                  <textarea value={motivationText} onChange={(e) => setMotivationText(e.target.value.slice(0, 500))}
                    placeholder="학생 서비스를 지원하고 행정 업무를 보조하고자 하는 동기를 작성해 주세요." style={{ width: '100%', height: 76, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                  <span style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 11, color: '#B9BFC6' }}>{motivationText.length.toLocaleString()} / 500자</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>관련 경험 및 역량 <span style={{ color: '#B01116' }}>*</span></div>
                {profileLoaded ? (
                  <>
                    {renderExperienceTable()}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: '#1F8A4C' }}>
                      <Icon name="sparkles" size={12} color="#1F8A4C" /> 공통 지원서의 경력·자격 정보를 표로 불러왔습니다. 내용은 공통 지원서에서 수정할 수 있습니다.
                    </div>
                  </>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <textarea value={experienceText} onChange={(e) => setExperienceText(e.target.value)} placeholder="민원 응대, 문서 정리, 자료 입력, 서비스 마인드, 엑셀 활용, 문서 작성 경험 등 관련 경험과 역량을 작성해 주세요." style={{ width: '100%', height: 90, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                    <span style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 11, color: '#B9BFC6' }}>{experienceText.length.toLocaleString()} / 1,000자</span>
                  </div>
                )}
              </div>
              {customQuestionItems.length > 0 && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEF0F2', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: 12, color: '#9AA1A9' }}>이 공고의 담당자가 추가로 확인하고 싶어하는 질문입니다.</div>
                  {customQuestionItems.map((q, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>{q}</div>
                      <textarea value={customAnswers[q] || ''} onChange={(e) => setCustomAnswers(prev => ({ ...prev, [q]: e.target.value }))}
                        placeholder="답변을 작성해 주세요." style={{ width: '100%', height: 64, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* 3 + 4 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>3. 공고별 확인 사항</h3>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>필수 조건</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>{requiredItems.map(checkChip)}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>우대 역량</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{preferredItems.map(checkChip)}</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>4. 근무 가능 시간</h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2563C9', background: '#E8F0FB', padding: '4px 10px', borderRadius: 10, fontWeight: 600 }}>
                  <Icon name="calendar-check" size={12} color="#2563C9" /> 수강신청 내역 자동 연동
                </span>
              </div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6 }}>
                  붉은 칸은 수업시간으로 자동 연동된 <b style={{ color: '#B01116' }}>선택 불가</b> 슬롯입니다. 그 외 빈 칸은 눌러서 근무 가능 여부를 자유롭게 선택·해제할 수 있습니다.
                </div>
              </div>
              {renderScheduleGrid()}
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

      {showJobPicker && (
        <JobPickerModal
          jobs={allJobs}
          selectedId={selectedJobId}
          onSelect={(id) => { setSelectedJobId(id); setShowJobPicker(false); }}
          onClose={() => setShowJobPicker(false)}
        />
      )}
      {showPreview && <PreviewModal job={job} onCancel={() => setShowPreview(false)} />}
      {showModal && <SubmitModal job={job} onCancel={() => setShowModal(false)} onConfirm={() => { submitApplication(); setShowModal(false); setSubmitted(true); }} />}
    </div>
  );
}

// 교내 근로 모집 공고 탭의 전체 목록을 검색·선택할 수 있는 모달 (드롭다운 대체)
function JobPickerModal({ jobs, selectedId, onSelect, onClose }) {
  const { Icon, StatusBadge } = window;
  const [query, setQuery] = React.useState('');
  const q = query.trim();
  const filtered = q ? jobs.filter((j) => `${j.team} ${j.title} ${j.dept || ''}`.includes(q)) : jobs;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,28,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 580, maxHeight: '82vh', background: '#fff', borderRadius: 16, padding: 24, position: 'relative', boxShadow: '0 20px 48px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="x" size={20} color="#9AA1A9" /></button>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937', marginBottom: 4 }}>지원 공고 선택</div>
        <div style={{ fontSize: 13, color: '#9AA1A9', marginBottom: 16 }}>전체 {jobs.length}건 · 교내 근로 모집 공고 탭과 동일한 목록입니다.</div>
        <div style={{ position: 'relative', marginBottom: 14, flexShrink: 0 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="부서명, 공고명으로 검색" autoFocus
            style={{ width: '100%', height: 42, padding: '0 14px 0 38px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }} />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><Icon name="search" size={15} color="#9AA1A9" /></span>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {filtered.map((j) => {
            const active = j.id === selectedId;
            return (
              <button key={j.id} type="button" onClick={() => onSelect(j.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'left',
                border: active ? '1.5px solid #B01116' : '1px solid #E6E8EB', background: active ? '#FDECEC' : '#fff',
                borderRadius: 10, cursor: 'pointer', font: 'inherit',
              }}>
                <StatusBadge status={j.status} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.team} <span style={{ color: '#D5D8DC' }}>|</span> {j.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>{j.hours} · 모집 {j.headcount} · 마감 {j.deadline}</span>
                </span>
                {active && <Icon name="check-circle-2" size={18} color="#B01116" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 13, color: '#9AA1A9' }}>검색 결과가 없습니다.</div>
          )}
        </div>
      </div>
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
