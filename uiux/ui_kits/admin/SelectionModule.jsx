// 필수/우대 조건 문구를 지원자가 실제로 입력한 데이터와 대조 — 점수화하지 않고, 관련 키워드가 실제로
// 확인되면 초록 체크만 표시. 키워드가 안 보인다고 해서 "불충족"으로 단정하지 않고 "확인 필요"로만 안내함
const CONDITION_KEYWORD_THEMES = [
  ['엑셀', '컴퓨터활용', '전산', '문서 작성', '문서작성', '한글', '문서 정리', '자료 정리'],
  ['민원', '응대'],
  ['영어', '중국어', '외국어', '회화', 'TOEIC', 'OPIc', 'JLPT'],
  ['사진', '영상', '촬영', '편집', 'SNS'],
  ['튜터링', '상담', '교육'],
  ['시설', '시설관리'],
  ['행정', '행정지원', '행정업무'],
];

function buildApplicantPool(a) {
  return [
    a.major, a.grade,
    ...(a.interests || []),
    ...(a.quals || []),
    ...(a.careers || []).flatMap(c => [c.type, c.org, c.role, c.detail]),
    a.motivation, a.experienceText,
  ].filter(Boolean).join(' ');
}

// { ok, reason } 반환 — ok:false는 "불충족"이 아니라 "지원서에서 자동으로 확인되지 않음"이라는 뜻
function matchCondition(conditionText, pool) {
  if (/재학생|휴학생\s*불가/.test(conditionText)) {
    return { ok: true, reason: '재학 중 (SAINT 연동)' };
  }
  for (const theme of CONDITION_KEYWORD_THEMES) {
    const condHit = theme.find(k => conditionText.includes(k));
    if (!condHit) continue;
    const poolHit = theme.find(k => pool.includes(k));
    if (poolHit) return { ok: true, reason: `지원서에서 "${poolHit}" 확인됨` };
  }
  return { ok: false, reason: null };
}

function workTimeMatch(applicant, post) {
  const required = (post && post.workSlots) || [];
  const available = applicant.availableSlots || [];
  const matched = required.filter(s => available.includes(s));
  return { matched, total: required.length };
}

// 학생 선발 — 지원자 목록(한눈에 보기) + 상세 보기(지원서 그대로 확인)
// AI 적합도/점수는 사용하지 않음. 담당자가 지원서 원문을 보고 직접 판단합니다.
// 담당자는 하나의 부서(adminUser.dept)에 소속되므로, 그 부서가 등록한 공고의 지원자만 다룹니다.
function SelectionModule({ initialPostId, onConsumeInitialPost }) {
  // 목업 지원자(window.applicants) + 학생이 실제로 제출한 지원서(공유 저장소)를 합쳐서 보여줌
  const [applicants, setApplicants] = React.useState(() => {
    const submitted = window.SharedApplicantsStore ? window.SharedApplicantsStore.getAll() : [];
    return [...submitted, ...window.applicants];
  });
  const [tab, setTab] = React.useState('all');
  const myDeptPosts = window.adminPosts.filter(p => p.dept === window.adminUser.dept);
  const myDeptPostIds = myDeptPosts.map(p => p.id);
  const postById = Object.fromEntries(myDeptPosts.map(p => [p.id, p]));
  // 공고 상세의 "지원자 보기"에서 넘어온 경우, 그 공고가 내 부서 소속일 때만 미리 선택해 둠
  const [postId, setPostId] = React.useState(() => (
    initialPostId && myDeptPostIds.includes(initialPostId) ? initialPostId : 'all'
  ));
  const [detailId, setDetailId] = React.useState(null);

  React.useEffect(() => {
    if (initialPostId && onConsumeInitialPost) onConsumeInitialPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 학생이 지원서를 제출하면(다른 탭) 새로고침 없이 즉시 목록에 추가 — 이미 화면에 반영된 지원자의 로컬 상태(선발/보류 등)는 건드리지 않음
  React.useEffect(() => {
    if (!window.SharedApplicantsStore) return;
    return window.SharedApplicantsStore.subscribe((submittedList) => {
      setApplicants(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newOnes = submittedList.filter(s => !existingIds.has(s.id));
        return newOnes.length ? [...newOnes, ...prev] : prev;
      });
    });
  }, []);

  const decide = (id, status) => setApplicants(as => as.map(a => a.id === id ? { ...a, status } : a));

  const myApplicants = applicants.filter(a => myDeptPostIds.includes(a.postId));

  if (detailId) {
    const a = applicants.find(x => x.id === detailId);
    return <ApplicantDetail applicant={a} post={postById[a.postId]} onBack={() => setDetailId(null)} onDecide={(status) => decide(detailId, status)} />;
  }

  const { AdminIcon, ABadge } = window;
  const tabs = [
    { id: 'all', label: '전체' },
    { id: '검토중', label: '검토중' },
    { id: '보류', label: '보류' },
    { id: '선발', label: '선발' },
    { id: '탈락', label: '탈락' },
  ];
  const postScoped = postId === 'all' ? myApplicants : myApplicants.filter(a => a.postId === postId);
  const shown = tab === 'all' ? postScoped : postScoped.filter(a => a.status === tab);
  const count = (id) => id === 'all' ? postScoped.length : postScoped.filter(a => a.status === id).length;

  const th = (t, align, width) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>;

  const TONE_STYLES = {
    accent: { color: '#B01116', background: '#FDECEC' },
    green: { color: '#1F8A4C', background: '#E7F4EA' },
    neutral: { color: '#4B5563', background: '#F1F3F5' },
  };
  const keywordChip = (label, tone) => (
    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10, ...TONE_STYLES[tone || 'neutral'] }}>{label}</span>
  );

  const scopeLabel = postId === 'all'
    ? `${window.adminUser.dept} 담당 공고 전체 (${myDeptPosts.length}건 · 지원 ${myApplicants.length}명)`
    : `${window.adminUser.dept} · ${postById[postId].title} (지원 ${myApplicants.filter(a => a.postId === postId).length}명)`;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>학생 선발</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>{scopeLabel} · 지원자 목록을 확인하고 상세보기에서 지원서를 검토해 선발 여부를 결정합니다.</p>
      </div>

      {myDeptPosts.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setPostId('all')} style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700,
            border: '1.5px solid ' + (postId === 'all' ? '#B01116' : '#E6E8EB'), background: postId === 'all' ? '#FDECEC' : '#fff', color: postId === 'all' ? '#B01116' : '#4B5563',
          }}>전체 공고 <span style={{ fontSize: 11, color: postId === 'all' ? '#B01116' : '#9AA1A9' }}>({myApplicants.length})</span></button>
          {myDeptPosts.map(p => {
            const on = postId === p.id;
            const n = myApplicants.filter(a => a.postId === p.id).length;
            return (
              <button key={p.id} onClick={() => setPostId(p.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700,
                border: '1.5px solid ' + (on ? '#B01116' : '#E6E8EB'), background: on ? '#FDECEC' : '#fff', color: on ? '#B01116' : '#4B5563',
              }}>{p.title} <span style={{ fontSize: 11, color: on ? '#B01116' : '#9AA1A9' }}>({n})</span></button>
            );
          })}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0', borderBottom: '1px solid #EEF0F2' }}>
          {tabs.map(t => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: 'none', borderBottom: '2px solid ' + (on ? '#B01116' : 'transparent'),
                background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? '#B01116' : '#6B7280',
              }}>
                {t.label} <span style={{ fontSize: 11, fontWeight: 700, color: on ? '#B01116' : '#9AA1A9', background: on ? '#FDECEC' : '#F1F3F5', padding: '1px 7px', borderRadius: 10 }}>{count(t.id)}</span>
              </button>
            );
          })}
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6' }}>
            {th('지원자')}{th('지원 공고')}{th('학과 / 학년')}{th('GPA', 'center', 60)}{th('필수조건', 'center', 90)}{th('근무시간', 'center', 90)}{th('관심 분야')}{th('지원일', 'center', 100)}{th('상태', 'center', 90)}{th('', 'center', 100)}
          </tr></thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#9AA1A9' }}>해당 조건의 지원자가 없습니다.</td></tr>
            ) : shown.map(a => {
              const post = postById[a.postId];
              const pool = buildApplicantPool(a);
              const reqResults = post ? (post.qualifications || []).map(c => matchCondition(c, pool)) : [];
              const reqOkCount = reqResults.filter(r => r.ok).length;
              const { matched, total } = workTimeMatch(a, post);
              return (
              <tr key={a.id} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: '#9AA1A9' }}>{a.sid}</div>
                </td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: '#3A4048' }}>{post ? post.title : '-'}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: '#3A4048' }}>{a.major} · {a.grade}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048' }} className="stream-tabular">{a.gpa}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  {reqResults.length > 0 ? keywordChip(`${reqOkCount}/${reqResults.length} 확인`, reqOkCount === reqResults.length ? 'green' : 'neutral') : <span style={{ fontSize: 12, color: '#B9BFC6' }}>-</span>}
                </td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  {total > 0 ? keywordChip(`${matched.length}/${total} 일치`, matched.length === total ? 'green' : 'neutral') : <span style={{ fontSize: 12, color: '#B9BFC6' }}>-</span>}
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{a.interests.slice(0, 2).map(l => keywordChip(l, 'accent'))}</div>
                </td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048' }} className="stream-tabular">{a.applyDate}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><ABadge status={a.status} /></td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  <button onClick={() => setDetailId(a.id)} style={{ height: 32, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>상세보기</button>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
        </div>
      </div>
      <p style={{ margin: '10px 2px 0', fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>
        "필수조건"·"근무시간"은 지원서에 입력된 정보를 기준으로 자동 확인한 참고 정보입니다. 확인되지 않았다고 해서 조건을 충족하지 못한 것은 아니니 상세보기에서 직접 확인해 주세요.
      </p>
    </div>
  );
}

// 지원자 상세 — 실제 제출한 지원서 내용을 그대로 보여줌 (AI 판단/점수 없음)
function ApplicantDetail({ applicant: a, post, onBack, onDecide }) {
  const { AdminIcon, ABadge, APanel, AButton, ATimeGrid } = window;
  const pool = buildApplicantPool(a);
  const requiredResults = post ? (post.qualifications || []).map(c => ({ text: c, ...matchCondition(c, pool) })) : [];
  const preferredResults = post ? (post.preferred || []).map(c => ({ text: c, ...matchCondition(c, pool) })) : [];
  const { matched: matchedSlots, total: requiredSlotCount } = workTimeMatch(a, post);

  const field = (label, value) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#1F2937', fontWeight: 600 }}>{value}</span>
    </div>
  );

  const conditionRow = ({ text, ok, reason }) => (
    <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      {ok
        ? <AdminIcon name="check-circle-2" size={16} color="#1F8A4C" style={{ marginTop: 1, flexShrink: 0 }} />
        : <AdminIcon name="circle-dashed" size={16} color="#B9BFC6" style={{ marginTop: 1, flexShrink: 0 }} />}
      <span style={{ fontSize: 13, color: '#3A4048', lineHeight: 1.5 }}>
        {text}
        {ok
          ? <span style={{ color: '#1F8A4C', fontWeight: 600 }}> · {reason}</span>
          : <span style={{ color: '#9AA1A9' }}> · 지원서에서 자동 확인되지 않음</span>}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}><AdminIcon name="chevron-left" size={18} color="#6B7280" /> 지원자 목록으로</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <ABadge status={a.status} />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1F2937' }}>{a.name}</h1>
        <span style={{ fontSize: 14, color: '#9AA1A9' }}>{a.sid} · {a.major} {a.grade} · 지원일 {a.applyDate}</span>
      </div>
      {post && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 13, fontWeight: 600, color: '#B01116', background: '#FDECEC', padding: '5px 12px', borderRadius: 8 }}>
          <AdminIcon name="briefcase" size={14} color="#B01116" /> 지원 공고 · {post.dept} | {post.title}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <APanel title="지원자 정보">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {field('연락처', a.phone)}
              {field('이메일', a.email)}
              {field('학점(GPA)', a.gpa)}
            </div>
            {a.interests.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600, marginBottom: 8 }}>관심 분야</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {a.interests.map(l => (
                    <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#B01116', background: '#FDECEC', border: '1px solid #EBB9B8', padding: '4px 10px', borderRadius: 12 }}>{l}</span>
                  ))}
                </div>
              </div>
            )}
          </APanel>

          {post && (requiredResults.length > 0 || preferredResults.length > 0) && (
            <APanel title="지원 자격 확인" right={<span style={{ fontSize: 12, color: '#9AA1A9' }}>참고용 · 담당자가 최종 확인</span>}>
              {requiredResults.length > 0 && (
                <div style={{ marginBottom: preferredResults.length > 0 ? 16 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>필수 조건</div>
                  {requiredResults.map(conditionRow)}
                </div>
              )}
              {preferredResults.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>우대 역량</div>
                  {preferredResults.map(conditionRow)}
                </div>
              )}
            </APanel>
          )}

          <APanel title="자기소개서">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>지원 동기</div>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: '#3A4048', lineHeight: 1.7 }}>{a.motivation}</p>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>관련 경험 및 역량</div>
            {a.careers.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['구분', '기관', '직책', '기간', '세부내용'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#5B4B33', background: '#F6F0E6', borderBottom: '1px solid #E6E8EB', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.careers.map((c, i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: '#3A4048', borderBottom: '1px solid #EEF0F2' }}>{c.type}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: '#3A4048', borderBottom: '1px solid #EEF0F2' }}>{c.org}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: '#3A4048', borderBottom: '1px solid #EEF0F2' }}>{c.role}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: '#3A4048', borderBottom: '1px solid #EEF0F2' }}>{c.period}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: '#3A4048', borderBottom: '1px solid #EEF0F2' }}>{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : a.experienceText ? (
              <p style={{ margin: 0, fontSize: 14, color: '#3A4048', lineHeight: 1.7 }}>{a.experienceText}</p>
            ) : <div style={{ fontSize: 13, color: '#9AA1A9' }}>등록된 경력이 없습니다.</div>}
            {a.quals.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {a.quals.map(q => (
                  <span key={q} style={{ fontSize: 12, fontWeight: 600, color: '#4B5563', background: '#F6F7F9', border: '1px solid #E6E8EB', padding: '4px 10px', borderRadius: 12 }}>{q}</span>
                ))}
              </div>
            )}
          </APanel>

          {a.customAnswers && a.customAnswers.length > 0 && (
            <APanel title="추가 질문 답변">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {a.customAnswers.map((qa, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 6 }}>{qa.question}</div>
                    <p style={{ margin: 0, fontSize: 14, color: '#3A4048', lineHeight: 1.7 }}>{qa.answer || <span style={{ color: '#B9BFC6' }}>답변 없음</span>}</p>
                  </div>
                ))}
              </div>
            </APanel>
          )}

          <APanel title="관리자 메모">
            <textarea defaultValue={a.note} placeholder="검토 의견을 남기세요." style={{ width: '100%', height: 64, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
          </APanel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <APanel title="근무 가능 시간"
            right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2563C9', background: '#E8F0FB', padding: '4px 10px', borderRadius: 10, fontWeight: 600 }}><AdminIcon name="calendar-check" size={12} color="#2563C9" /> 수강신청 내역 자동 연동</span>}>
            {requiredSlotCount > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
                color: matchedSlots.length === requiredSlotCount ? '#1F8A4C' : '#4B5563',
                background: matchedSlots.length === requiredSlotCount ? '#E7F4EA' : '#F1F3F5',
              }}>
                <AdminIcon name="calendar-check-2" size={14} color={matchedSlots.length === requiredSlotCount ? '#1F8A4C' : '#6B7280'} />
                공고 근무 시간과 {matchedSlots.length}/{requiredSlotCount} 일치
              </div>
            )}
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#4B5563', lineHeight: 1.6 }}>
              붉은 칸은 학생의 수강신청 시간표에서 자동 연동된 <b style={{ color: '#B01116' }}>수업시간</b>이고, 체크 표시는 학생이 지원서에서 <b style={{ color: '#B01116' }}>추가로 근무 가능하다고 체크</b>한 시간입니다. <b style={{ color: '#1F8A4C' }}>초록 체크</b>는 그중 공고가 요구하는 근무 시간과 겹치는 시간입니다.
            </p>
            <ATimeGrid redSlots={a.classSlots || []} checkSlots={a.availableSlots || []} matchSlots={matchedSlots} redLabel="수업"
              redLegendText="수업시간 (수강신청 자동 연동)" checkLegendText="근무 가능 시간 (그 외)" matchLegendText="공고 근무 시간과 일치" />
          </APanel>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '16px 22px' }}>
            <span style={{ fontSize: 14, color: '#4B5563' }}>최종 선발 결정 <b style={{ color: '#1F2937' }}>— 담당자가 직접 선택</b></span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onDecide('선발')} style={{ height: 40, padding: '0 22px', background: a.status === '선발' ? '#1F8A4C' : '#B01116', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>선발</button>
              <button onClick={() => onDecide('보류')} style={{ height: 40, padding: '0 22px', background: a.status === '보류' ? '#B8860B' : '#fff', color: a.status === '보류' ? '#fff' : '#B8860B', border: '1px solid #E4C97A', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>보류</button>
              <button onClick={() => onDecide('탈락')} style={{ height: 40, padding: '0 22px', background: a.status === '탈락' ? '#6B7280' : '#fff', color: a.status === '탈락' ? '#fff' : '#6B7280', border: '1px solid #D5D8DC', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>탈락</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.SelectionModule = SelectionModule;
