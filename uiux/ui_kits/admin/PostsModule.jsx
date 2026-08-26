// 교내 근로 모집 공고 (목록 / 상세 / 등록·수정)
function PostsModule({ onViewApplicants }) {
  const { AdminIcon, ABadge, AStatCard, APanel, AButton, PageTitle, ATimeGrid } = window;
  // 공유 저장소가 있으면 그걸 우선 사용 — 새로고침해도, 다른 탭(학생 포털)에서도 최신 공고 목록을 그대로 유지
  const [posts, setPosts] = React.useState(() => (
    window.SharedPostsStore ? window.SharedPostsStore.seed(window.adminPosts) : [...window.adminPosts]
  ));
  const [view, setView] = React.useState('list'); // list | detail | edit
  const [sel, setSel] = React.useState(posts[0]);
  const [editTarget, setEditTarget] = React.useState(null); // null = 신규 등록, post = 수정 대상
  const [q, setQ] = React.useState('');
  const [dept, setDept] = React.useState('전체');
  const [status, setStatus] = React.useState('전체');

  React.useEffect(() => {
    window.adminPosts = posts;
    // 저장할 때마다 공유 저장소에도 반영 — 학생 포털 탭이 열려 있으면 storage 이벤트로 실시간 반영됨
    if (window.SharedPostsStore) window.SharedPostsStore.save(posts);
  }, [posts]);

  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);

  const openNew = () => { setEditTarget(null); setView('edit'); };
  const openEdit = (p) => { setEditTarget(p); setView('edit'); };

  // 마감 처리 — 삭제하지 않고 모집상태만 "모집완료"로 전환 (정원 미달이어도 담당자가 직접 마감 가능)
  const handleClose = (id) => {
    setPosts(ps => ps.map(p => p.id === id ? { ...p, status: '모집완료' } : p));
    setSel(s => (s && s.id === id ? { ...s, status: '모집완료' } : s));
  };
  const handleDelete = (id) => {
    setPosts(ps => ps.filter(p => p.id !== id));
    setConfirmDeleteId(null);
    if (sel && sel.id === id) setView('list');
  };

  const handleSave = (formData) => {
    const mapped = {
      title: formData.title, dept: formData.dept,
      headcount: Number(formData.headcount) || 0,
      weekly: formData.weekly, reg: formData.regStart, deadline: formData.deadline,
      location: formData.location,
      duties: formData.duties, qualifications: formData.qualifications, preferred: formData.preferred,
      workSlots: formData.workSlots, customQuestions: formData.customQuestions,
      status: formData.status,
    };
    if (editTarget) {
      setPosts(ps => ps.map(p => p.id === editTarget.id ? { ...p, ...mapped } : p));
      setSel(s => ({ ...s, ...mapped }));
      setView('detail');
    } else {
      const newId = 'P' + String(posts.length + 1).padStart(3, '0') + '-' + Date.now().toString().slice(-4);
      const newPost = { id: newId, applicants: 0, ...mapped };
      setPosts(ps => [newPost, ...ps]);
      setSel(newPost);
      setView('detail');
    }
  };

  if (view === 'edit') {
    return (
      <PostEdit
        post={editTarget}
        allPosts={posts}
        onBack={() => setView(editTarget ? 'detail' : 'list')}
        onSave={handleSave}
      />
    );
  }
  if (view === 'detail') {
    return (
      <>
        <PostDetailAdmin post={sel} onBack={() => setView('list')} onEdit={() => openEdit(sel)} onViewApplicants={onViewApplicants}
          onClose={() => handleClose(sel.id)} onDelete={() => setConfirmDeleteId(sel.id)} />
        {confirmDeleteId && (
          <ConfirmModal
            title="공고를 삭제할까요?"
            desc="삭제하면 목록에서 즉시 사라지며 되돌릴 수 없습니다. 지원자 데이터는 남아있지만 더 이상 화면에 연결되지 않습니다."
            confirmLabel="삭제"
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={() => handleDelete(confirmDeleteId)}
          />
        )}
      </>
    );
  }

  const th = (t, align, width) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>;
  const td = (c, align) => <td style={{ padding: '14px 16px', fontSize: 13, color: '#3A4048', textAlign: align || 'left' }}>{c}</td>;

  const deptOptions = ['전체', ...Array.from(new Set(posts.map(p => p.dept)))];
  const normalizedQ = q.trim().toLowerCase();
  const filteredPosts = posts.filter(p => {
    const matchesQ = !normalizedQ || `${p.title} ${p.dept}`.toLowerCase().includes(normalizedQ);
    const matchesDept = dept === '전체' || p.dept === dept;
    const matchesStatus = status === '전체' || p.status === status;
    return matchesQ && matchesDept && matchesStatus;
  });

  return (
    <div>
      <PageTitle title="교내 근로 모집 공고" desc="모집 공고를 등록하고 지원 접수 현황을 관리합니다."
        right={<AButton variant="primary" icon="plus" onClick={openNew}>신규 공고 등록</AButton>} />

      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {window.adminPostStats.map(s => <AStatCard key={s.key} stat={s} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}><AdminIcon name="search" size={17} color="#9AA1A9" /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="공고명, 부서명으로 검색" style={{ width: '100%', height: 42, padding: '0 14px 0 42px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, font: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <select value={dept} onChange={e => setDept(e.target.value)} style={{ height: 42, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>
          {deptOptions.map(d => <option key={d} value={d}>{d === '전체' ? '부서 전체' : d}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ height: 42, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>
          {['전체', '모집중', '마감임박', '모집완료', '임시저장'].map(s => <option key={s} value={s}>{s === '전체' ? '모집상태 전체' : s}</option>)}
        </select>
        <button style={{ display: 'flex', alignItems: 'center', gap: 16, height: 42, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>학기 2026-1 <AdminIcon name="chevron-down" size={15} color="#9AA1A9" /></button>
      </div>

      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>총 <b style={{ color: '#1F2937' }}>{filteredPosts.length}건</b>의 공고</div>

      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>
            {th('상태', 'center', 84)}{th('공고명 / 부서')}{th('충원 현황', 'center', 130)}{th('주당 근무')}{th('마감일', 'center', 100)}{th('관리', 'center', 130)}
          </tr></thead>
          <tbody>
            {filteredPosts.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#9AA1A9' }}>조건에 맞는 공고가 없습니다.</td></tr>
            ) : filteredPosts.map(p => {
              const fillRate = Math.min(1, p.applicants / p.headcount);
              return (
              <tr key={p.id} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}><ABadge status={p.status} /></td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>{p.dept} · 등록 {p.reg}</div>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, fontSize: 13, color: '#3A4048', marginBottom: 5 }}>
                    <span style={{ fontWeight: 700, color: '#B01116' }}>{p.applicants}</span> / {p.headcount}명 지원
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: '#EEF0F2', overflow: 'hidden' }}>
                    <div style={{ width: `${fillRate * 100}%`, height: '100%', background: fillRate >= 1 ? '#1F8A4C' : '#D9791F' }} />
                  </div>
                </td>
                {td(p.weekly)}
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, fontWeight: p.status === '마감임박' ? 700 : 400, color: p.status === '마감임박' ? '#D9791F' : '#3A4048' }}>{p.deadline}</td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => { setSel(p); setView('detail'); }} style={{ height: 32, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>상세</button>
                    <button onClick={() => openEdit(p)} style={{ height: 32, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>수정</button>
                    <IconButtonDanger onClick={() => setConfirmDeleteId(p.id)} />
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      {confirmDeleteId && (
        <ConfirmModal
          title="공고를 삭제할까요?"
          desc="삭제하면 목록에서 즉시 사라지며 되돌릴 수 없습니다. 지원자 데이터는 남아있지만 더 이상 화면에 연결되지 않습니다."
          confirmLabel="삭제"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDelete(confirmDeleteId)}
        />
      )}
    </div>
  );
}

function IconButtonDanger({ onClick }) {
  const { AdminIcon } = window;
  return (
    <button onClick={onClick} title="삭제" style={{ height: 32, width: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, cursor: 'pointer' }}>
      <AdminIcon name="trash-2" size={14} color="#B01116" />
    </button>
  );
}

// 삭제처럼 되돌릴 수 없는 작업 전 확인을 받는 공용 모달
function ConfirmModal({ title, desc, confirmLabel, onCancel, onConfirm }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,28,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 420, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 20px 48px rgba(0,0,0,.2)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 800, color: '#1F2937' }}>{title}</h3>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>{desc}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 44, background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>취소</button>
          <button onClick={onConfirm} style={{ flex: 1, height: 44, background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function PostDetailAdmin({ post, onBack, onEdit, onViewApplicants, onClose, onDelete }) {
  const { AdminIcon, ABadge, APanel, AButton, ATimeGrid } = window;
  const cell = (icon, label, value) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#F1F3F5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AdminIcon name={icon} size={19} color="#6B7280" /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 15, color: '#1F2937', fontWeight: 700 }}>{value}</span>
      </span>
    </div>
  );
  const bullet = (t) => <li key={t} style={{ display: 'flex', gap: 8, fontSize: 14, color: '#3A4048', lineHeight: 1.6, marginBottom: 8 }}><span style={{ color: '#B01116' }}>•</span> {t}</li>;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}><AdminIcon name="chevron-left" size={18} color="#6B7280" /> 목록으로</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <AButton variant="outline" icon="pencil" onClick={onEdit}>수정</AButton>
          <AButton variant="outline" icon="users" onClick={() => onViewApplicants && onViewApplicants(post.id)}>지원자 보기 ({post.applicants})</AButton>
          {post.status !== '모집완료' && <AButton variant="outline" icon="circle-check" onClick={onClose}>마감 처리</AButton>}
          <AButton variant="danger" icon="trash-2" onClick={onDelete}>삭제</AButton>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <ABadge status={post.status} />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1F2937' }}>{post.dept} <span style={{ color: '#D5D8DC', margin: '0 6px' }}>|</span> {post.title}</h1>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '22px 26px', display: 'flex', gap: 8, marginBottom: 18 }}>
        {cell('users', '모집인원', post.headcount + '명')}
        {cell('user-check', '지원인원', post.applicants + '명')}
        {cell('timer', '주당 근무시간', post.weekly)}
        {cell('clock', '지원 마감일', post.deadline)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <APanel title="업무 내용"><ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{(post.duties || []).map(bullet)}</ul></APanel>
          <APanel title="지원 자격 및 우대 조건">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>필수 조건</div>
            <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none' }}>{(post.qualifications || []).map(bullet)}</ul>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>우대 역량</div>
            {(post.preferred || []).length > 0
              ? <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{post.preferred.map(bullet)}</ul>
              : <div style={{ fontSize: 13, color: '#9AA1A9' }}>설정된 우대 역량이 없습니다.</div>}
          </APanel>
          <APanel title="자기소개서 질문">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>지원 동기 <span style={{ fontWeight: 500, color: '#9AA1A9' }}>· 공통 고정</span></div>
            <div style={{ fontSize: 14, color: '#3A4048', marginBottom: 16 }}>{FIXED_MOTIVATION_PROMPT}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', marginBottom: 8 }}>추가 질문</div>
            {(post.customQuestions || []).length > 0
              ? <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{post.customQuestions.map(bullet)}</ul>
              : <div style={{ fontSize: 13, color: '#9AA1A9' }}>설정된 추가 질문이 없습니다.</div>}
          </APanel>
        </div>
        <APanel title="근무 조건">
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3A4048', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><AdminIcon name="clock" size={16} color="#8A929B" /> 근무요일/시간</div>
          <ATimeGrid redSlots={post.workSlots || []} redLabel="" legend={false} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <AdminIcon name="map-pin" size={16} color="#8A929B" />
            <span style={{ fontSize: 13, color: '#9AA1A9', fontWeight: 600, width: 60 }}>근무장소</span>
            <span style={{ fontSize: 14, color: '#1F2937', fontWeight: 600 }}>{post.location}</span>
          </div>
        </APanel>
      </div>
    </div>
  );
}

// 항목을 하나씩 추가/삭제하는 리스트 편집기 (업무 내용처럼 문장 단위 항목에 사용)
function ListEditor({ items, onAdd, onRemove, placeholder }) {
  const { AdminIcon } = window;
  const [val, setVal] = React.useState('');
  const composing = React.useRef(false);
  const commit = () => { const v = val.trim(); if (!v) return; onAdd(v); setVal(''); };
  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', border: '1px solid #EEF0F2', borderRadius: 8, background: '#FAFBFC' }}>
              <span style={{ color: '#B01116', fontSize: 13, lineHeight: 1.5 }}>•</span>
              <span style={{ flex: 1, fontSize: 13, color: '#3A4048', lineHeight: 1.5 }}>{it}</span>
              <button type="button" onClick={() => onRemove(i)} style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 2 }}><AdminIcon name="x" size={14} color="#9AA1A9" /></button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={val} onChange={e => setVal(e.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={e => { if (e.key === 'Enter' && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          style={{ flex: 1, height: 38, padding: '0 12px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }} />
        <button type="button" onClick={commit} style={{ height: 38, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>추가</button>
      </div>
    </div>
  );
}

// 짧은 키워드를 칩 형태로 추가/삭제 (지원 자격·우대 조건처럼 학생 지원서에 체크리스트로 노출되는 항목에 사용)
function ChipEditor({ items, onAdd, onRemove, placeholder }) {
  const { AdminIcon } = window;
  const [val, setVal] = React.useState('');
  const composing = React.useRef(false);
  const commit = () => { const v = val.trim(); if (!v) return; onAdd(v); setVal(''); };
  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {items.map((it, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 8px 7px 12px', border: '1px solid #E6E8EB', borderRadius: 8, fontSize: 13, color: '#3A4048', background: '#FAFBFC' }}>
              {it}
              <button type="button" onClick={() => onRemove(i)} style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><AdminIcon name="x" size={13} color="#9AA1A9" /></button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={val} onChange={e => setVal(e.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={e => { if (e.key === 'Enter' && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          style={{ flex: 1, height: 38, padding: '0 12px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }} />
        <button type="button" onClick={commit} style={{ height: 38, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>추가</button>
      </div>
    </div>
  );
}

// 이전에 등록한 공고를 검색해서 선택하는 모달 — 선택 시 업무 내용/자격 조건/근무 시간을 그대로 불러옴
function PreviousPostPicker({ posts, onSelect, onClose }) {
  const { AdminIcon, ABadge } = window;
  const [q, setQ] = React.useState('');
  const query = q.trim();
  const filtered = query ? posts.filter(p => `${p.title} ${p.dept}`.includes(query)) : posts;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,28,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 560, maxHeight: '80vh', background: '#fff', borderRadius: 16, padding: 24, position: 'relative', boxShadow: '0 20px 48px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer' }}><AdminIcon name="x" size={20} color="#9AA1A9" /></button>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937', marginBottom: 4 }}>이전 공고 불러오기</div>
        <div style={{ fontSize: 13, color: '#9AA1A9', marginBottom: 16 }}>선택한 공고의 업무 내용·지원 자격·우대 조건·근무 가능 시간이 그대로 채워집니다. 공고명과 일정은 다시 확인해 주세요.</div>
        <div style={{ position: 'relative', marginBottom: 14, flexShrink: 0 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="공고명, 부서명으로 검색" autoFocus
            style={{ width: '100%', height: 42, padding: '0 14px 0 38px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', boxSizing: 'border-box' }} />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><AdminIcon name="search" size={15} color="#9AA1A9" /></span>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {filtered.map(p => (
            <button key={p.id} type="button" onClick={() => onSelect(p)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'left', border: '1px solid #E6E8EB', background: '#fff', borderRadius: 10, cursor: 'pointer', font: 'inherit' }}>
              <ABadge status={p.status} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.dept} <span style={{ color: '#D5D8DC' }}>|</span> {p.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>{p.weekly} · 등록 {p.reg}</span>
              </span>
              <AdminIcon name="chevron-right" size={16} color="#9AA1A9" />
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 13, color: '#9AA1A9' }}>검색 결과가 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}

// "지원 동기"는 모든 공고에 공통으로 적용되는 고정 질문 (공고별로 바꿀 수 없음)
const FIXED_MOTIVATION_PROMPT = '이 업무를 지원하고자 하는 동기를 작성해 주세요.';

function blankForm() {
  return {
    title: '', dept: '', headcount: '', weekly: '', regStart: '', deadline: '', location: '',
    duties: [], qualifications: [], preferred: [], workSlots: [], customQuestions: [],
    status: '모집중',
  };
}

function formFromPost(post) {
  return {
    title: post.title, dept: post.dept, headcount: String(post.headcount || ''), weekly: post.weekly || '',
    regStart: post.reg || '', deadline: post.deadline || '', location: post.location || '',
    duties: [...(post.duties || [])], qualifications: [...(post.qualifications || [])], preferred: [...(post.preferred || [])],
    workSlots: [...(post.workSlots || [])], customQuestions: [...(post.customQuestions || [])],
    status: post.status,
  };
}

// 공고 등록/수정 — 학생이 "부서별 지원서"에서 작성하는 항목(자격 조건, 근무 가능 시간, 자기소개서 질문)을
// 관리자가 이 화면에서 그대로 설정하도록 같은 섹션 구성과 시각 포맷을 사용함
function PostEdit({ post, allPosts, onBack, onSave }) {
  const { AdminIcon, APanel, AButton, PageTitle, ATimeGrid, ADatePicker } = window;
  const isEditing = !!post;
  const [form, setForm] = React.useState(() => (post ? formFromPost(post) : blankForm()));
  const [showPicker, setShowPicker] = React.useState(false);
  const [loadedFrom, setLoadedFrom] = React.useState(null);
  const [errors, setErrors] = React.useState([]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const addItem = (key, val) => setForm(f => ({ ...f, [key]: [...f[key], val] }));
  const removeItem = (key, idx) => setForm(f => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }));
  const toggleSlot = (key) => setForm(f => {
    const has = f.workSlots.includes(key);
    return { ...f, workSlots: has ? f.workSlots.filter(k => k !== key) : [...f.workSlots, key] };
  });

  const loadPrevious = (p) => {
    setForm(f => ({
      ...f,
      dept: p.dept, headcount: String(p.headcount || ''), weekly: p.weekly || '', location: p.location || '',
      duties: [...(p.duties || [])], qualifications: [...(p.qualifications || [])], preferred: [...(p.preferred || [])],
      workSlots: [...(p.workSlots || [])], customQuestions: [...(p.customQuestions || [])],
      title: f.title || (p.title + ' (사본)'),
    }));
    setLoadedFrom(p);
    setShowPicker(false);
  };

  const validate = () => {
    const missing = [];
    if (!form.title.trim()) missing.push('공고명');
    if (!form.dept.trim()) missing.push('담당 부서');
    if (!form.headcount) missing.push('모집 인원');
    if (!form.weekly.trim()) missing.push('주당 최대 근무시간');
    if (!form.regStart.trim()) missing.push('모집 시작일');
    if (!form.deadline.trim()) missing.push('지원 마감일');
    if (form.duties.length === 0) missing.push('업무 내용');
    if (form.qualifications.length === 0) missing.push('필수 조건');
    return missing;
  };

  const submit = () => {
    const missing = validate();
    if (missing.length > 0) { setErrors(missing); return; }
    setErrors([]);
    onSave({ ...form, status: isEditing ? form.status : '모집중' });
  };
  const saveDraft = () => onSave({ ...form, status: '임시저장' });

  const deptOptions = Array.from(new Set(allPosts.map(p => p.dept)));

  const label = (t, req) => <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>{t} {req && <span style={{ color: '#B01116' }}>*</span>}</div>;
  const textField = (lbl, key, ph, req, type) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {label(lbl, req)}
      <input type={type || 'text'} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={ph}
        style={{ height: 42, padding: '0 14px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, font: 'inherit', boxSizing: 'border-box' }} />
    </div>
  );
  const dateField = (lbl, key, req) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {label(lbl, req)}
      <ADatePicker value={form[key]} onChange={v => set(key, v)} placeholder="YYYY.MM.DD" />
    </div>
  );

  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#4B5563', cursor: 'pointer', font: 'inherit', marginBottom: 14 }}><AdminIcon name="chevron-left" size={18} color="#6B7280" /> {isEditing ? '상세로' : '목록으로'}</button>
      <PageTitle title={isEditing ? '모집 공고 수정' : '모집 공고 등록'} desc="새 교내 근로 공고를 작성합니다. 학생이 지원서에서 작성하는 항목을 이 화면에서 함께 설정합니다."
        right={<AButton variant="outline" icon="copy" onClick={() => setShowPicker(true)}>이전 공고 불러오기</AButton>} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 920 }}>
        {loadedFrom && (
          <div style={{ background: '#F1F9F3', border: '1px solid #BFE3C8', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AdminIcon name="check" size={18} color="#1F8A4C" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1F8A4C' }}>'{loadedFrom.dept} | {loadedFrom.title}' 공고 내용을 불러왔습니다</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {['담당 부서·인원·근무시간', '업무 내용', '지원 자격·우대 조건', '근무 가능 시간', '자기소개서 질문'].map(l => (
                  <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#1F8A4C', background: '#fff', border: '1px solid #CDE8D4', padding: '4px 10px', borderRadius: 12 }}>
                    <AdminIcon name="check" size={12} color="#1F8A4C" /> {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <APanel title="기본 정보">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {textField('공고명', 'title', '예) 2026-1학기 학생지원팀 행정 보조', true)}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {label('담당 부서', true)}
              <input list="dept-options" value={form.dept} onChange={e => set('dept', e.target.value)} placeholder="부서를 선택하거나 입력하세요"
                style={{ height: 42, padding: '0 14px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, font: 'inherit', boxSizing: 'border-box' }} />
              <datalist id="dept-options">{deptOptions.map(d => <option key={d} value={d} />)}</datalist>
            </div>
            {textField('모집 인원', 'headcount', '예) 2', true, 'number')}
            {textField('주당 최대 근무시간', 'weekly', '예) 최대 15시간', true)}
            {dateField('모집 시작일', 'regStart', true)}
            {dateField('지원 마감일', 'deadline', true)}
            {textField('근무 장소', 'location', '예) 학생지원팀 사무실 (본관빌딩)', false)}
          </div>
        </APanel>

        <APanel title="업무 내용">
          {label('담당 업무', true)}
          <ListEditor items={form.duties} onAdd={v => addItem('duties', v)} onRemove={i => removeItem('duties', i)} placeholder="예) 민원 응대 및 학생지원팀 행정 업무 보조 (입력 후 Enter)" />
        </APanel>

        <div style={{ background: '#FAFBFC', border: '1px dashed #DADEE3', borderRadius: 10, padding: '10px 16px', fontSize: 12, color: '#6B7280' }}>
          아래 항목은 학생이 이 공고에 지원할 때 작성하는 <b style={{ color: '#3A4048' }}>부서별 지원서</b> 화면에 그대로 표시됩니다.
        </div>

        <APanel title="지원 자격 및 우대 조건 (학생 지원서 · 공고별 확인 사항)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              {label('필수 조건', true)}
              <ChipEditor items={form.qualifications} onAdd={v => addItem('qualifications', v)} onRemove={i => removeItem('qualifications', i)} placeholder="예) 학부 재학생 (휴학생 불가)" />
            </div>
            <div>
              {label('우대 역량')}
              <ChipEditor items={form.preferred} onAdd={v => addItem('preferred', v)} onRemove={i => removeItem('preferred', i)} placeholder="예) 엑셀 활용 가능자 우대" />
            </div>
          </div>
        </APanel>

        <APanel title="자기소개서 질문 (학생 지원서)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '12px 14px', background: '#F8F9FB', border: '1px solid #EEF0F2', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3A4048' }}>지원 동기 <span style={{ fontWeight: 500, color: '#9AA1A9' }}>· 모든 공고 공통 고정 질문</span></div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>"{FIXED_MOTIVATION_PROMPT}"</div>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>관련 경험 및 역량은 학생이 공통 지원서에 입력한 경력 표가 그대로 표시되므로 별도 질문이 필요 없습니다. 이 공고에서만 추가로 확인하고 싶은 항목이 있다면 아래에 자유롭게 추가하세요.</p>
            <div>
              {label('추가 질문 (선택)')}
              <ListEditor items={form.customQuestions} onAdd={v => addItem('customQuestions', v)} onRemove={i => removeItem('customQuestions', i)} placeholder="예) 관련 자격증이나 수강 경험이 있다면 작성해 주세요. (입력 후 Enter)" />
            </div>
          </div>
        </APanel>

        <APanel title="근무 요일 / 시간 (학생 지원서 · 근무 가능 시간)"
          right={<span style={{ fontSize: 12, color: '#6B7280' }}>선택 {form.workSlots.length}칸</span>}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>여기서 설정한 시간이 학생 지원서의 근무 가능 시간 항목에 추천 슬롯으로 표시됩니다. 칸을 클릭해서 선택·해제하세요.</p>
          <ATimeGrid redSlots={form.workSlots} redLabel="근무" legend={false} onToggle={toggleSlot} />
        </APanel>

        {errors.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: '#FDF2F2', border: '1px solid #F3C7C5', borderRadius: 8, fontSize: 13, color: '#B01116' }}>
            <AdminIcon name="alert-circle" size={16} color="#B01116" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>다음 항목을 입력해 주세요: {errors.join(', ')}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <AButton variant="outline" onClick={onBack}>취소</AButton>
          <AButton variant="ghost" onClick={saveDraft}>임시저장</AButton>
          <AButton variant="primary" icon="check" onClick={submit}>{isEditing ? '수정 완료' : '공고 등록'}</AButton>
        </div>
      </div>

      {showPicker && (
        <PreviousPostPicker posts={allPosts} onSelect={loadPrevious} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
window.PostsModule = PostsModule;
