// 공통 지원서 (학생 프로필) — 모든 부서 지원에 재사용되는 마스터 이력
function ProfileScreen({ onGoApply }) {
  const { Icon, Panel } = window;
  const prof = window.commonProfile;

  const [phone, setPhone] = React.useState(prof.basic.phone);
  const [email, setEmail] = React.useState(prof.basic.email);
  // 증명사진: 기본은 SAINT 학생정보 사진 연동, 필요 시 직접 업로드로 교체
  const [photoSource, setPhotoSource] = React.useState('saint'); // 'saint' | 'custom'
  const [careers, setCareers] = React.useState(prof.careers);
  const [interests, setInterests] = React.useState(prof.interests);
  const [languages, setLanguages] = React.useState(prof.languages);
  const [certs, setCerts] = React.useState(prof.certificates);
  const [avail, setAvail] = React.useState(() => new Set(prof.availableSlots));
  const [saved, setSaved] = React.useState(false);

  // 완성도: 6개 영역 기준
  const sections = [
    { label: '기본 인적사항', done: !!(phone && email) },
    { label: '증명사진', done: true }, // SAINT 사진이 기본 연동되어 항상 채워짐
    { label: '경력 사항', done: careers.length > 0 },
    { label: '관심 분야', done: interests.length > 0 },
    { label: '자격증·어학', done: languages.length + certs.length > 0 },
    { label: '근무 가능 시간', done: avail.size > 0 },
  ];
  const doneCount = sections.filter(s => s.done).length;
  const completion = Math.round((doneCount / sections.length) * 100);
  const firstMissing = sections.find(s => !s.done);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2200); };

  const toggleInterest = (label) => setInterests(list =>
    list.includes(label) ? list.filter(i => i !== label) : [...list, label]);

  const updateCareer = (id, field, value) => setCareers(list => list.map(c => c.id === id ? { ...c, [field]: value } : c));
  const removeCareer = (id) => setCareers(list => list.filter(c => c.id !== id));
  const addCareer = () => setCareers(list => [...list, { id: 'c' + Date.now(), type: '기타', org: '', role: '', field: '', period: '', detail: '' }]);

  const updateLang = (id, field, value) => setLanguages(list => list.map(l => l.id === id ? { ...l, [field]: value } : l));
  const removeLang = (id) => setLanguages(list => list.filter(l => l.id !== id));
  const addLang = () => setLanguages(list => [...list, { id: 'l' + Date.now(), test: '', score: '', date: '' }]);

  const updateCert = (id, field, value) => setCerts(list => list.map(c => c.id === id ? { ...c, [field]: value } : c));
  const removeCert = (id) => setCerts(list => list.filter(c => c.id !== id));
  const addCert = () => setCerts(list => [...list, { id: 'ct' + Date.now(), name: '', org: '', date: '' }]);

  const toggleSlot = (key) => {
    if (prof.classSlots.includes(key)) return;
    setAvail(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  // ---- 공용 스타일 ----
  const inputStyle = { height: 36, padding: '0 10px', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 13, font: 'inherit', boxSizing: 'border-box', width: '100%', color: '#1F2937', background: '#fff' };
  const thStyle = { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#5B4B33', background: '#F6F0E6', borderBottom: '1px solid #E6E8EB', textAlign: 'left', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '8px 12px', borderBottom: '1px solid #EEF0F2', verticalAlign: 'middle' };

  const lockedRow = (label, value) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input value={value} readOnly style={{ ...inputStyle, height: 40, background: '#F6F7F9', color: '#6B7280', border: '1px solid #E6E8EB', paddingRight: 92 }} />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#2563C9', background: '#E8F0FB', padding: '2px 8px', borderRadius: 10 }}>
          <Icon name="link" size={11} color="#2563C9" /> SAINT 연동
        </span>
      </div>
    </div>
  );

  const editRow = (label, value, setter, placeholder) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{label}</span>
      <input value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, height: 40 }} />
    </div>
  );

  const addButton = (label, onClick) => (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', background: '#fff', border: '1px dashed #C9A2A1', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#B01116', cursor: 'pointer', font: 'inherit' }}>
      <Icon name="plus" size={14} color="#B01116" /> {label}
    </button>
  );

  const removeButton = (onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} title={disabled ? 'STREAM 근로 이력은 자동 등재되어 삭제할 수 없습니다' : '삭제'}
      style={{ background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 4, display: 'inline-flex', opacity: disabled ? 0.35 : 1 }}>
      <Icon name="trash-2" size={15} color="#9AA1A9" />
    </button>
  );

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>공통 지원서</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>한 번 작성해 두면 모든 부서 지원 시 자동으로 불러올 수 있습니다.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#1F8A4C', background: '#E7F4EA', padding: '8px 14px', borderRadius: 8 }}>
              <Icon name="check" size={14} color="#1F8A4C" /> 저장되었습니다
            </span>
          )}
          <span style={{ fontSize: 12, color: '#9AA1A9' }}>마지막 수정 {prof.updatedAt}</span>
          <button onClick={handleSave} style={{ height: 42, padding: '0 24px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>저장</button>
        </div>
      </div>

      {/* 완성도 */}
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '18px 24px', margin: '16px 0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937', whiteSpace: 'nowrap' }}>작성 완성도</span>
          <div style={{ flex: 1, height: 8, background: '#EEF0F2', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: completion + '%', height: '100%', background: completion === 100 ? '#1F8A4C' : '#B01116', transition: 'width .3s' }} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: completion === 100 ? '#1F8A4C' : '#B01116', whiteSpace: 'nowrap' }}>{completion}%</span>
        </div>
        <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 8 }}>
          {completion === 100
            ? '모든 항목이 작성되었습니다. 지원서 작성 시 바로 불러올 수 있어요.'
            : `'${firstMissing.label}' 항목을 작성하면 완성도가 올라갑니다.`}
        </div>
      </div>

      {/* 기본 인적사항 */}
      <Panel title="기본 인적사항" style={{ marginBottom: 18 }} right={
        <span style={{ fontSize: 12, color: '#9AA1A9' }}>학번·성명·학과는 SAINT 학생정보와 자동 연동됩니다</span>
      }>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {lockedRow('학번', prof.basic.studentId)}
            {lockedRow('성명', prof.basic.name)}
            {lockedRow('학과(부)', prof.basic.major)}
            {lockedRow('학기 수', prof.basic.semester)}
            {lockedRow('재학 상태', prof.basic.enrollStatus)}
            <div />
            {editRow('휴대폰 번호', phone, setPhone, '010-0000-0000')}
            {editRow('이메일', email, setEmail, 'example@sogang.ac.kr')}
          </div>
          <div style={{ width: 148, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 108, height: 132, borderRadius: 8, overflow: 'hidden', border: '1px solid #E6E8EB' }}>
              <img src="https://images.wondershare.kr/ai-prompt/korean-schoolgirl-id-photo.png" alt="증명사진"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            {photoSource === 'saint' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#2563C9', background: '#E8F0FB', padding: '3px 9px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                <Icon name="link" size={11} color="#2563C9" /> SAINT 학생정보 사진
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#1F8A4C', background: '#E7F4EA', padding: '3px 9px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                <Icon name="check" size={11} color="#1F8A4C" /> 증명사진_안희진.jpg
              </span>
            )}
            {photoSource === 'saint' ? (
              <button onClick={() => setPhotoSource('custom')} title="새 파일을 업로드하여 SAINT 사진 대신 사용합니다"
                style={{ height: 30, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>
                최신 사진으로 변경
              </button>
            ) : (
              <button onClick={() => setPhotoSource('saint')}
                style={{ height: 30, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>
                SAINT 사진으로 되돌리기
              </button>
            )}
          </div>
        </div>
      </Panel>

      {/* 경력 사항 */}
      <Panel title="경력 사항" style={{ marginBottom: 18 }} right={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2563C9', background: '#E8F0FB', padding: '4px 10px', borderRadius: 10, fontWeight: 600 }}>
          <Icon name="sparkles" size={12} color="#2563C9" /> STREAM 교내근로 이력은 자동 등재됩니다
        </span>
      }>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 110 }}>구분</th>
              <th style={{ ...thStyle, width: 190 }}>기관</th>
              <th style={{ ...thStyle, width: 130 }}>직책</th>
              <th style={{ ...thStyle, width: 120 }}>직무</th>
              <th style={{ ...thStyle, width: 170 }}>기간</th>
              <th style={thStyle}>세부내용</th>
              <th style={{ ...thStyle, width: 48, textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {careers.map(c => (
              <tr key={c.id}>
                <td style={tdStyle}>
                  {c.auto ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#B01116', background: '#FDECEC', padding: '4px 10px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                      {c.type} <span style={{ fontSize: 10, fontWeight: 600, color: '#2563C9', background: '#E8F0FB', padding: '1px 6px', borderRadius: 8 }}>자동</span>
                    </span>
                  ) : (
                    <select value={c.type} onChange={e => updateCareer(c.id, 'type', e.target.value)} style={{ ...inputStyle, height: 34, cursor: 'pointer' }}>
                      {prof.careerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </td>
                <td style={tdStyle}>{c.auto ? <span style={{ fontSize: 13, fontWeight: 600, color: '#3A4048' }}>{c.org}</span> : <input value={c.org} onChange={e => updateCareer(c.id, 'org', e.target.value)} placeholder="기관명" style={{ ...inputStyle, height: 34 }} />}</td>
                <td style={tdStyle}>{c.auto ? <span style={{ fontSize: 13, color: '#3A4048' }}>{c.role}</span> : <input value={c.role} onChange={e => updateCareer(c.id, 'role', e.target.value)} placeholder="직책" style={{ ...inputStyle, height: 34 }} />}</td>
                <td style={tdStyle}>{c.auto ? <span style={{ fontSize: 13, color: '#3A4048' }}>{c.field}</span> : <input value={c.field} onChange={e => updateCareer(c.id, 'field', e.target.value)} placeholder="직무" style={{ ...inputStyle, height: 34 }} />}</td>
                <td style={tdStyle}>{c.auto ? <span style={{ fontSize: 13, color: '#3A4048' }}>{c.period}</span> : <input value={c.period} onChange={e => updateCareer(c.id, 'period', e.target.value)} placeholder="YYYY.MM ~ YYYY.MM" style={{ ...inputStyle, height: 34 }} />}</td>
                <td style={tdStyle}>{c.auto ? <span style={{ fontSize: 13, color: '#3A4048' }}>{c.detail}</span> : <input value={c.detail} onChange={e => updateCareer(c.id, 'detail', e.target.value)} placeholder="담당 업무, 성과 등" style={{ ...inputStyle, height: 34 }} />}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{removeButton(() => removeCareer(c.id), c.auto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 14 }}>{addButton('경력 추가', addCareer)}</div>
      </Panel>

      {/* 관심 분야 */}
      <Panel title="관심 분야" style={{ marginBottom: 18 }} right={
        <span style={{ fontSize: 12, color: '#9AA1A9' }}>선택한 분야의 공고가 우선 추천됩니다</span>
      }>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {prof.interestOptions.map(opt => {
            const on = interests.includes(opt);
            return (
              <button key={opt} onClick={() => toggleInterest(opt)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px',
                background: on ? '#FDECEC' : '#fff', border: '1px solid ' + (on ? '#EBB9B8' : '#E6E8EB'),
                borderRadius: 19, fontSize: 13, fontWeight: on ? 700 : 500, color: on ? '#B01116' : '#4B5563',
                cursor: 'pointer', font: 'inherit',
              }}>
                {on && <Icon name="check" size={14} color="#B01116" />} {opt}
              </button>
            );
          })}
        </div>
      </Panel>

      {/* 자격증 · 어학 */}
      <Panel title="자격증 · 어학" style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>공인 어학 성적</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>시험명</th>
                  <th style={{ ...thStyle, width: 100 }}>점수/등급</th>
                  <th style={{ ...thStyle, width: 100 }}>취득일</th>
                  <th style={{ ...thStyle, width: 44, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {languages.map(l => (
                  <tr key={l.id}>
                    <td style={tdStyle}><input value={l.test} onChange={e => updateLang(l.id, 'test', e.target.value)} placeholder="예: TOEIC" style={{ ...inputStyle, height: 34 }} /></td>
                    <td style={tdStyle}><input value={l.score} onChange={e => updateLang(l.id, 'score', e.target.value)} placeholder="예: 900" style={{ ...inputStyle, height: 34 }} /></td>
                    <td style={tdStyle}><input value={l.date} onChange={e => updateLang(l.id, 'date', e.target.value)} placeholder="YYYY.MM" style={{ ...inputStyle, height: 34 }} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{removeButton(() => removeLang(l.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12 }}>{addButton('어학 추가', addLang)}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 10 }}>기타 자격증</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>자격증명</th>
                  <th style={{ ...thStyle, width: 160 }}>발급기관</th>
                  <th style={{ ...thStyle, width: 100 }}>취득일</th>
                  <th style={{ ...thStyle, width: 44, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {certs.map(c => (
                  <tr key={c.id}>
                    <td style={tdStyle}><input value={c.name} onChange={e => updateCert(c.id, 'name', e.target.value)} placeholder="자격증명" style={{ ...inputStyle, height: 34 }} /></td>
                    <td style={tdStyle}><input value={c.org} onChange={e => updateCert(c.id, 'org', e.target.value)} placeholder="발급기관" style={{ ...inputStyle, height: 34 }} /></td>
                    <td style={tdStyle}><input value={c.date} onChange={e => updateCert(c.id, 'date', e.target.value)} placeholder="YYYY.MM" style={{ ...inputStyle, height: 34 }} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{removeButton(() => removeCert(c.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12 }}>{addButton('자격증 추가', addCert)}</div>
          </div>
        </div>
      </Panel>

      {/* 이번 학기 시간표 */}
      <Panel title="이번 학기 시간표 · 근무 가능 시간" style={{ marginBottom: 18 }} right={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2563C9', background: '#E8F0FB', padding: '4px 10px', borderRadius: 10, fontWeight: 600 }}>
          <Icon name="calendar-check" size={12} color="#2563C9" /> 수강신청 내역 자동 연동
        </span>
      }>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
          붉은 칸은 수업시간으로 자동 표시된 <b style={{ color: '#B01116' }}>선택 불가</b> 슬롯입니다. 빈 칸을 눌러 근무 가능 시간을 표시해 두면 지원서 작성 시 그대로 사용됩니다.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#5B4B33', width: 68 }}>시간</th>
              {window.dayCols.map(d => (
                <th key={d} style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 13, fontWeight: 700, color: '#5B4B33' }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {window.timeRows.map(t => (
              <tr key={t}>
                <td style={{ border: '1px solid #E6E8EB', background: '#FAFAFA', textAlign: 'center', fontSize: 12, color: '#6B7280', height: 32 }}>{t}</td>
                {window.dayCols.map(d => {
                  const key = d + '-' + t;
                  const isClass = prof.classSlots.includes(key);
                  const isAvail = avail.has(key);
                  return (
                    <td key={key} style={{ border: '1px solid #E6E8EB', padding: 0, height: 32 }}>
                      <button onClick={() => toggleSlot(key)} disabled={isClass}
                        title={isClass ? '수업시간 (선택 불가)' : isAvail ? '근무 가능 (클릭하여 해제)' : '클릭하여 근무 가능 표시'}
                        style={{
                          width: '100%', height: '100%', border: 'none', padding: 0, font: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isClass ? '#B01116' : isAvail ? '#FDECEC' : '#fff',
                          color: '#fff', fontSize: 11, fontWeight: 600,
                          cursor: isClass ? 'not-allowed' : 'pointer',
                        }}>
                        {isClass ? '수업' : isAvail ? <Icon name="check" size={14} color="#B01116" /> : null}
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
      </Panel>

      {/* 하단 안내 */}
      <div style={{ background: 'linear-gradient(180deg,#FEF4F3 0%,#FDECEC 100%)', border: '1px solid #F7D9D8', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="file-check-2" size={20} color="#B01116" />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#B01116' }}>이 공통 지원서는 부서 지원 시 자동으로 채워집니다</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>지원서 작성 화면에서 '공통 지원서 불러오기'를 누르면 지원 동기만 작성하면 됩니다.</div>
        </div>
        <button onClick={onGoApply} style={{ height: 42, padding: '0 20px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>지원서 작성하러 가기</button>
      </div>
    </div>
  );
}
window.ProfileScreen = ProfileScreen;
