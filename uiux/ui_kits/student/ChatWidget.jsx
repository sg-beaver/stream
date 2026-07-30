// STREAM 학생용 AI 챗봇 — 자연어 기반 교내 근로 공고 추천
// 정량 조건(요일/시간/상태)은 규칙 기반 로직으로, 모호한 선호 표현 해석은 키워드 매칭으로 시뮬레이션한다.

const CHAT_TAG_GROUPS = [
  { id: 'admin_doc', label: '문서작성·행정', userKeywords: ['문서', '엑셀', '행정', '자료 정리', '자료정리', '서류', '오피스', '한글', '데이터 입력'], jobKeywords: ['문서', '엑셀', '행정', '정리', '서류', '자료 입력', '한글', '전산 입력'] },
  { id: 'marketing', label: '마케팅·콘텐츠', userKeywords: ['마케팅', '홍보', 'sns', '콘텐츠', '기획', '촬영', '편집', '디자인'], jobKeywords: ['마케팅', '홍보', 'sns', '콘텐츠', '촬영', '편집', '기획'] },
  { id: 'library', label: '도서·자료 정리', userKeywords: ['도서', '책', '자료실', '열람실', '사서'], jobKeywords: ['도서', '자료실', '대출', '반납', '열람', '도서관'] },
  { id: 'english', label: '외국어 활용', userKeywords: ['영어', '중국어', '외국어', '토익', 'opic', '회화', '어학'], jobKeywords: ['영어', '중국어', '외국어'] },
  { id: 'it', label: 'IT·전산', userKeywords: ['전산', 'it', '컴퓨터', '시스템', '웹', '개발', '코딩'], jobKeywords: ['전산', '시스템', '웹', 'it', '온라인'] },
  { id: 'education', label: '튜터링·교육', userKeywords: ['튜터', '교육', '멘토', '학습', '강의'], jobKeywords: ['튜터링', '학습', '교육', '강의'] },
  { id: 'event', label: '행사·현장 지원', userKeywords: ['행사', '현장', '동적', '활동적', '감독'], jobKeywords: ['행사', '현장', '고사장', '감독', '안내'] },
];

const CHAT_DAYS = ['월', '화', '수', '목', '금', '토', '일'];

// 요일 토큰 추출 — 단독 '일'은 "일을", "일하고" 등 일반 단어와 겹치므로 "OO요일" 형태일 때만 일요일로 인정한다.
function chatExtractDays(clause) {
  const days = new Set();
  const withYoil = clause.match(/[월화수목금토일]요일/g) || [];
  withYoil.forEach(t => days.add(t[0]));
  let stripped = clause.replace(/[월화수목금토일]요일/g, '');
  // 요일과 무관한 흔한 표현("할 수 있는", "지금" 등)에서 요일 글자만 잘못 뽑히는 것을 방지
  stripped = stripped.replace(/(수\s*있|수\s*없|지금|방금|조금|금방|황금|전화|화나|화내|제목|목소리|목마|이번\s*달|다음\s*달)/g, '');
  const bare = stripped.match(/(?<!\d)[월화수목금토](?!\d)/g) || [];
  bare.forEach(d => days.add(d));
  return [...days];
}

function chatParseMessage(raw) {
  const text = raw.toLowerCase();
  const tags = new Set();
  CHAT_TAG_GROUPS.forEach(g => { if (g.userKeywords.some(k => text.includes(k))) tags.add(g.id); });

  const avoidCrowd = /사람.{0,6}(많이|많은).{0,8}(상대|만나|응대)|대면.{0,8}(부담|힘들|어려)|민원.{0,8}(부담|힘들|어려)|응대.{0,8}(부담|힘들|어려)|사람.{0,4}안\s*만나/.test(text);
  const wantQuiet = /조용|혼자.{0,6}(집중|일)/.test(text);
  const wantActive = /동적|활동적|현장.{0,6}(지원|나가)|정적.{0,8}(보다|말고)/.test(text);
  const askedWage = /시급|급여|임금|페이/.test(text);

  const availability = {}; const fullDays = new Set(); const excludeDays = new Set();
  const clauses = raw.split(/[,，.]|그리고|하고\s|이고\s|하지만|근데/).map(s => s.trim()).filter(Boolean);
  clauses.forEach(clause => {
    const c = clause.toLowerCase();
    const daysInClause = chatExtractDays(clause);
    if (!daysInClause.length) return;
    const isExclude = /(안\s*돼|불가|못\s*해|없는|빼고|제외|어려워|힘들어)/.test(c);
    if (isExclude) { daysInClause.forEach(d => excludeDays.add(d)); return; }
    const isFull = /(공강|종일|하루\s*종일|온종일)/.test(c);
    let minHour = null, maxHour = null;
    const afterMatch = c.match(/(오전|오후)?\s*(\d{1,2})\s*시\s*(이후|부터)/);
    if (afterMatch) { let h = parseInt(afterMatch[2], 10); if (afterMatch[1] === '오후' && h < 12) h += 12; if (afterMatch[1] === '오전' && h === 12) h = 0; minHour = h; }
    const beforeMatch = c.match(/(오전|오후)?\s*(\d{1,2})\s*시\s*(이전|까지)/);
    if (beforeMatch) { let h = parseInt(beforeMatch[2], 10); if (beforeMatch[1] === '오후' && h < 12) h += 12; if (beforeMatch[1] === '오전' && h === 12) h = 0; maxHour = h; }
    daysInClause.forEach(d => {
      if (isFull || (minHour === null && maxHour === null)) { fullDays.add(d); availability[d] = { min: 0, max: 24 }; }
      else { availability[d] = { min: minHour ?? 0, max: maxHour ?? 24 }; }
    });
  });

  return { tags, avoidCrowd, wantQuiet, wantActive, askedWage, availability, fullDays, excludeDays };
}

function chatMergeProfile(prev, delta) {
  const availability = { ...prev.availability };
  const fullDays = new Set(prev.fullDays);
  const excludeDays = new Set(prev.excludeDays);
  Object.keys(delta.availability).forEach(d => { availability[d] = delta.availability[d]; excludeDays.delete(d); });
  delta.fullDays.forEach(d => fullDays.add(d));
  delta.excludeDays.forEach(d => { excludeDays.add(d); delete availability[d]; fullDays.delete(d); });
  return {
    tags: new Set([...prev.tags, ...delta.tags]),
    avoidCrowd: prev.avoidCrowd || delta.avoidCrowd,
    wantQuiet: prev.wantQuiet || delta.wantQuiet,
    wantActive: prev.wantActive || delta.wantActive,
    availability, fullDays, excludeDays,
  };
}

function chatDescribeAvailability(profile) {
  const groups = {};
  CHAT_DAYS.forEach(d => {
    if (!profile.availability[d]) return;
    const r = profile.availability[d];
    let desc;
    if (profile.fullDays.has(d)) desc = '종일';
    else if (r.min > 0 && r.max < 24) desc = `${r.min}시~${r.max}시`;
    else if (r.min > 0) desc = `${r.min}시 이후`;
    else if (r.max < 24) desc = `${r.max}시 이전`;
    else desc = '종일';
    groups[desc] = groups[desc] || [];
    groups[desc].push(d);
  });
  const parts = Object.entries(groups).map(([desc, days]) => `${days.join('·')} ${desc}`);
  if (profile.excludeDays.size) parts.push(`${[...profile.excludeDays].join('·')} 근무 제외`);
  return parts.join(', ');
}

function chatScorePost(post, profile) {
  let score = 0; const reasons = []; const cautions = [];
  const text = [post.title, post.dept, post.team, post.preferred, (post.duties || []).join(' '), (post.qualifications || []).join(' ')].join(' ').toLowerCase();
  const hasContact = /응대|민원|상담|안내/.test(text);

  profile.tags.forEach(tagId => {
    const g = CHAT_TAG_GROUPS.find(t => t.id === tagId);
    if (g && g.jobKeywords.some(k => text.includes(k))) { score += 3; reasons.push(`${g.label} 관련 업무가 포함돼요.`); }
  });
  if (profile.avoidCrowd || profile.wantQuiet) {
    if (!hasContact) { score += 2; reasons.push('민원·대면 응대 비중이 낮아요.'); }
    else { score -= 2; cautions.push('민원·대면 응대 업무가 일부 포함돼요.'); }
  }
  if (profile.wantActive && /행사|현장|감독|안내/.test(text)) { score += 2; reasons.push('현장 지원 등 활동적인 업무가 포함돼요.'); }

  const hasAvailability = Object.keys(profile.availability).length > 0;
  if (post.workSlots && post.workSlots.length && hasAvailability) {
    const total = post.workSlots.length;
    let matched = 0; let excludedHit = false;
    post.workSlots.forEach(slot => {
      const [day, hm] = slot.split('-');
      const hour = parseInt(hm, 10);
      if (profile.excludeDays.has(day)) excludedHit = true;
      const r = profile.availability[day];
      if (r && hour >= r.min && hour < r.max) matched++;
    });
    if (excludedHit) { score -= 6; cautions.push('제외를 원하신 요일의 근무가 포함돼요.'); }
    else {
      const ratio = matched / total;
      score += ratio * 4;
      if (ratio === 1) reasons.push('말씀하신 가능 시간과 근무 시간이 모두 맞아요.');
      else if (ratio > 0) reasons.push('근무 시간 중 일부가 가능하신 시간대와 겹쳐요.');
      else cautions.push('말씀하신 가능 시간과 근무 시간대가 겹치지 않아요.');
    }
  } else if (!hasAvailability) {
    // 가능 시간을 따로 말씀하지 않은 경우, 등록된 내 시간표(수업시간) 기준으로 겹치지 않는 공고를 우선한다.
    if (post.scheduleMatch) { score += 2; reasons.push('등록하신 시간표(수업시간)와 겹치지 않는 공고예요.'); }
    else { cautions.push('등록하신 시간표(수업시간)와 겹칠 수 있어요.'); }
  }

  // 마감임박은 근거가 될 수 없는 상태값이므로 이미 근거가 있는 후보들 사이의 정렬에만 아주 약하게 반영한다.
  if (post.status === '마감임박') { score += 0.2; }
  return { score, reasons: reasons.slice(0, 3), cautions: cautions.slice(0, 2) };
}

function chatRecommend(profile) {
  const candidates = window.posts.filter(p => p.status !== '모집완료' && !p.applied);
  const scored = candidates.map(p => ({ post: p, ...chatScorePost(p, profile) }));
  // 추천 이유가 하나도 없는 공고(= 입력 내용과 실제로 관련 없는 공고)는 후보에서 제외한다.
  const relevant = scored.filter(s => s.reasons.length > 0);
  relevant.sort((a, b) => b.score - a.score);
  return relevant.slice(0, 3);
}

function ChatMessageBubble({ msg, onOpenPost, onApplyPost }) {
  const { Icon, StatusBadge } = window;
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
      {msg.text && (
        <div style={{
          maxWidth: '86%', padding: '10px 14px', borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: isUser ? '#B01116' : '#fff', color: isUser ? '#fff' : '#1F2937',
          border: isUser ? 'none' : '1px solid #E6E8EB', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-line',
        }}>{msg.text}</div>
      )}
      {msg.cards && msg.cards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, width: '100%' }}>
          {msg.cards.map((c, i) => (
            <div key={c.post.id} style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#B01116', fontWeight: 800, marginBottom: 2 }}>{i + 1}순위 추천</div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1F2937' }}>{c.post.title}</div>
                  <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>{c.post.dept}{c.post.team && c.post.team !== c.post.dept ? ` · ${c.post.team}` : ''} · {c.post.hours}</div>
                </div>
                <StatusBadge status={c.post.status} />
              </div>
              {c.reasons.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1F8A4C', marginBottom: 4 }}>추천 이유</div>
                  {c.reasons.map((r, ri) => (
                    <div key={ri} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: '#3A4048', marginBottom: 2 }}>
                      <Icon name="check-circle-2" size={13} color="#1F8A4C" style={{ marginTop: 2, flexShrink: 0 }} />{r}
                    </div>
                  ))}
                </div>
              )}
              {c.cautions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#D9791F', marginBottom: 4 }}>확인할 점</div>
                  {c.cautions.map((r, ri) => (
                    <div key={ri} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: '#3A4048', marginBottom: 2 }}>
                      <Icon name="alert-circle" size={13} color="#D9791F" style={{ marginTop: 2, flexShrink: 0 }} />{r}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button onClick={() => onOpenPost && onOpenPost(c.post)} style={{ flex: 1, height: 30, background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>상세보기</button>
                <button onClick={() => onApplyPost && onApplyPost(c.post)} style={{ flex: 1, height: 30, background: '#B01116', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>지원하기</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CHAT_SUGGESTIONS = [
  '월수는 오후 3시 이후 가능하고 금요일은 공강이야. 사람 많이 상대하는 업무는 부담스럽고 마케팅이나 문서 작성 관련 일을 해보고 싶어.',
  '혼자 집중해서 할 수 있는 조용한 업무가 좋아요.',
  '영어 실력을 늘릴 수 있는 업무 있을까요?',
];

function ChatWidget({ onOpenPost, onApplyPost }) {
  const { Icon } = window;
  const [open, setOpen] = React.useState(false);
  const [size, setSize] = React.useState({ width: 380, height: 600 });
  const [input, setInput] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const composingRef = React.useRef(false);
  const dragRef = React.useRef(null);
  const isCompact = size.width <= 400 && size.height <= 650;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const onResizeMove = React.useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    setSize(() => {
      let w = d.startW, h = d.startH;
      if (d.edges.includes('left')) w = clamp(d.startW + (d.startX - e.clientX), 320, window.innerWidth - 48);
      if (d.edges.includes('top')) h = clamp(d.startH + (d.startY - e.clientY), 380, window.innerHeight - 48);
      return { width: w, height: h };
    });
  }, []);

  const onResizeUp = React.useCallback(() => {
    dragRef.current = null;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeUp);
  }, [onResizeMove]);

  const startResize = (e, edges) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height, edges };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeUp);
  };

  const toggleExpand = () => {
    setSize(isCompact
      ? { width: Math.min(760, window.innerWidth - 48), height: Math.min(860, window.innerHeight - 48) }
      : { width: 380, height: 600 });
  };
  const [profile, setProfile] = React.useState({ tags: new Set(), avoidCrowd: false, wantQuiet: false, wantActive: false, availability: {}, fullDays: new Set(), excludeDays: new Set() });
  const [messages, setMessages] = React.useState([
    { role: 'bot', text: '안녕하세요! STREAM AI 챗봇이에요. 가능한 요일·시간, 관심 있는 업무를 편하게 말씀해주시면 어울리는 근로 공고를 찾아드릴게요.' },
  ]);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  const runBotReply = (userText, nextProfile) => {
    const hasSignal = nextProfile.tags.size > 0 || Object.keys(nextProfile.availability).length > 0 || nextProfile.avoidCrowd || nextProfile.wantQuiet || nextProfile.wantActive;
    if (!hasSignal) {
      setMessages(m => [...m, { role: 'bot', text: '가능한 요일·시간대나 관심 있는 업무 분야를 조금 더 말씀해주시면 더 정확하게 찾아드릴 수 있어요. 예를 들어 "월수는 오후 3시 이후 가능하고 문서 작성 관련 일을 해보고 싶어" 처럼요.' }]);
      return;
    }
    const delta = chatParseMessage(userText);
    const summaryLines = [];
    const availDesc = chatDescribeAvailability(nextProfile);
    summaryLines.push(`근무 가능 시간: ${availDesc || '따로 말씀해주지 않으셔서 등록하신 시간표와 겹치지 않는 공고로 찾았어요'}`);
    if (nextProfile.tags.size) summaryLines.push(`관심 분야: ${[...nextProfile.tags].map(id => CHAT_TAG_GROUPS.find(g => g.id === id).label).join(', ')}`);
    if (nextProfile.avoidCrowd || nextProfile.wantQuiet) summaryLines.push('선호 환경: 대면 응대가 적은 조용한 업무');
    if (nextProfile.wantActive) summaryLines.push('선호 환경: 현장 지원 등 활동적인 업무');
    summaryLines.push('우선 조건: 이미 지원했거나 마감된 공고는 제외');

    const results = chatRecommend(nextProfile);
    let introText = `입력하신 내용을 이렇게 이해했어요.\n${summaryLines.map(l => `· ${l}`).join('\n')}`;
    if (delta.askedWage) introText += '\n\n다만 현재 공고 목록에는 시급 정보가 없어서 시급순 정렬은 어려워요. 대신 아래 조건으로 찾아드렸어요.';

    setMessages(m => [...m, { role: 'bot', text: introText }]);
    setTimeout(() => {
      if (results.length === 0) {
        setMessages(m => [...m, { role: 'bot', text: '말씀하신 조건에 딱 맞는 공고를 찾지 못했어요. 시간이나 분야 조건을 조금 완화해서 다시 말씀해주시겠어요?' }]);
      } else {
        setMessages(m => [...m, { role: 'bot', text: `조건에 맞는 공고 ${results.length}개를 찾았어요.`, cards: results }]);
      }
      setTyping(false);
    }, 450);
  };

  const send = (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed) return;
    setMessages(m => [...m, { role: 'user', text: trimmed }]);
    setInput('');
    setTyping(true);
    const delta = chatParseMessage(trimmed);
    setProfile(prev => {
      const next = chatMergeProfile(prev, delta);
      setTimeout(() => runBotReply(trimmed, next), 350);
      return next;
    });
  };

  return (
    <React.Fragment>
      {/* 트리거 카드 — 탭 바 바로 아래, 눈에 띄게 */}
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginTop: 16,
        background: 'linear-gradient(135deg,#B01116 0%,#8A0D11 100%)', border: 'none',
        borderRadius: 12, padding: '14px 14px', cursor: 'pointer', font: 'inherit', textAlign: 'left',
        boxShadow: '0 4px 14px rgba(176,17,22,.28)',
      }}>
        <span style={{
          width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.16)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative',
        }}>
          <Icon name="bot" size={22} color="#fff" />
          <span style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#3DDC84', border: '2px solid #B01116' }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#fff' }}>AI 챗봇에게 물어보기</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(255,255,255,.85)', marginTop: 1 }}>내 시간표·관심사에 맞는 공고 추천</span>
        </span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, width: size.width, maxWidth: 'calc(100vw - 48px)',
          height: size.height, maxHeight: 'calc(100vh - 48px)', background: '#F4F5F7', borderRadius: 16,
          boxShadow: '0 16px 48px rgba(16,24,40,.24)', border: '1px solid #E6E8EB',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 200,
        }}>
          {/* 크기 조절 핸들 — 좌측/상단 가장자리와 좌상단 모서리를 드래그해 자유롭게 리사이즈 */}
          <div onMouseDown={e => startResize(e, ['left'])} style={{ position: 'absolute', top: 0, left: -3, bottom: 0, width: 7, cursor: 'ew-resize', zIndex: 210 }} />
          <div onMouseDown={e => startResize(e, ['top'])} style={{ position: 'absolute', left: 0, top: -3, right: 0, height: 7, cursor: 'ns-resize', zIndex: 210 }} />
          <div onMouseDown={e => startResize(e, ['left', 'top'])} style={{ position: 'absolute', top: -4, left: -4, width: 16, height: 16, cursor: 'nwse-resize', zIndex: 211 }} />

          <div style={{ background: '#B01116', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bot" size={18} color="#fff" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>STREAM AI 챗봇</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.8)' }}>서강 근로 지원 도우미</div>
            </div>
            <button onClick={toggleExpand} title={isCompact ? '크게 보기' : '작게 보기'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
              <Icon name={isCompact ? 'maximize-2' : 'minimize-2'} size={18} color="#fff" />
            </button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
              <Icon name="x" size={20} color="#fff" />
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {messages.map((m, i) => <ChatMessageBubble key={i} msg={m} onOpenPost={(p) => { onOpenPost && onOpenPost(p); setOpen(false); }} onApplyPost={(p) => { onApplyPost && onApplyPost(p); setOpen(false); }} />)}
            {typing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: '#fff', border: '1px solid #E6E8EB', borderRadius: '14px 14px 14px 4px', width: 'fit-content' }}>
                {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#B9BFC6', display: 'inline-block' }} />)}
              </div>
            )}
            {messages.length <= 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11.5, color: '#9AA1A9', fontWeight: 600 }}>이렇게 물어볼 수 있어요</div>
                {CHAT_SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)} style={{
                    textAlign: 'left', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 10,
                    padding: '9px 12px', fontSize: 12.5, color: '#4B5563', cursor: 'pointer', font: 'inherit', lineHeight: 1.5,
                  }}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #E6E8EB', background: '#fff', flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                // 한글 등 IME 조합 중 Enter를 누르면 조합 확정과 전송이 겹쳐 마지막 글자가 중복 전송될 수 있어 방지
                if (composingRef.current || e.nativeEvent.isComposing) return;
                send();
              }}
              placeholder="가능한 시간과 관심 업무를 입력해보세요"
              style={{ flex: 1, height: 40, padding: '0 12px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }}
            />
            <button onClick={() => send()} style={{ width: 40, height: 40, background: '#B01116', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="send" size={17} color="#fff" />
            </button>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
window.ChatWidget = ChatWidget;
