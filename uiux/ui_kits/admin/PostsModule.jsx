// 교내 근로 모집 공고 (목록 / 상세 / 등록·수정)
function PostsModule() {
  const { AdminIcon, ABadge, AStatCard, APanel, AButton, PageTitle, ATimeGrid } = window;
  const [view, setView] = React.useState('list'); // list | detail | edit
  const [sel, setSel] = React.useState(window.adminPosts[0]);

  if (view === 'edit') return <PostEdit onBack={() => setView('list')} />;
  if (view === 'detail') return <PostDetailAdmin post={sel} onBack={() => setView('list')} onEdit={() => setView('edit')} />;

  const th = (t, align) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: align || 'left', whiteSpace: 'nowrap' }}>{t}</th>;
  const td = (c, align) => <td style={{ padding: '14px 16px', fontSize: 13, color: '#3A4048', textAlign: align || 'left' }}>{c}</td>;

  return (
    <div>
      <PageTitle title="교내 근로 모집 공고" desc="모집 공고를 등록하고 지원 접수 현황을 관리합니다."
        right={<div style={{ display: 'flex', gap: 8 }}>
          <AButton variant="outline" icon="copy">이전 공고 불러오기</AButton>
          <AButton variant="primary" icon="plus" onClick={() => setView('edit')}>신규 공고 등록</AButton>
        </div>} />

      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {window.adminPostStats.map(s => <AStatCard key={s.key} stat={s} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}><AdminIcon name="search" size={17} color="#9AA1A9" /></span>
          <input placeholder="공고명, 부서명으로 검색" style={{ width: '100%', height: 42, padding: '0 14px 0 42px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, font: 'inherit', boxSizing: 'border-box' }} />
        </div>
        {['부서 전체', '모집상태 전체', '학기 2026-1'].map(f => (
          <button key={f} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 42, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>{f} <AdminIcon name="chevron-down" size={15} color="#9AA1A9" /></button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F6F0E6', borderBottom: '1px solid #E6E8EB' }}>
            {th('상태', 'center')}{th('공고명 / 부서')}{th('모집인원', 'center')}{th('지원인원', 'center')}{th('주당 근무')}{th('마감일', 'center')}{th('관리', 'center')}
          </tr></thead>
          <tbody>
            {window.adminPosts.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #EEF0F2' }}>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}><ABadge status={p.status} /></td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>{p.dept} · 등록 {p.reg}</div>
                </td>
                {td(p.headcount + '명', 'center')}
                <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#B01116' }}>{p.applicants}</td>
                {td(p.weekly)}
                {td(p.deadline, 'center')}
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => { setSel(p); setView('detail'); }} style={{ height: 32, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>상세</button>
                    <button onClick={() => { setSel(p); setView('edit'); }} style={{ height: 32, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>수정</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PostDetailAdmin({ post, onBack, onEdit }) {
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
          <AButton variant="outline" icon="users">지원자 보기 ({post.applicants})</AButton>
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
          <APanel title="업무 내용"><ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{['민원 응대 및 부서 행정 업무 보조', '문서 정리, 자료 입력, 안내 자료 관리', '부서 내 단순 행정 업무 지원'].map(bullet)}</ul></APanel>
          <APanel title="지원 자격 및 우대 조건"><ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{['학부 재학생 (휴학생 불가)', '엑셀 활용 가능자 우대', '문서 작성 및 자료 정리 경험자 우대'].map(bullet)}</ul></APanel>
        </div>
        <APanel title="근무 조건">
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3A4048', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><AdminIcon name="clock" size={16} color="#8A929B" /> 근무요일/시간</div>
          <ATimeGrid redSlots={['월-10:00','월-11:00','월-12:00','수-10:00','수-11:00','수-12:00']} redLabel="" legend={false} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <AdminIcon name="map-pin" size={16} color="#8A929B" />
            <span style={{ fontSize: 13, color: '#9AA1A9', fontWeight: 600, width: 60 }}>근무장소</span>
            <span style={{ fontSize: 14, color: '#1F2937', fontWeight: 600 }}>{post.dept} 사무실 (본관빌딩)</span>
          </div>
        </APanel>
      </div>
    </div>
  );
}

function PostEdit({ onBack }) {
  const { AdminIcon, APanel, AButton, PageTitle, ATimeGrid } = window;
  const field = (label, ph, req) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: '#3A4048', fontWeight: 600 }}>{label} {req && <span style={{ color: '#B01116' }}>*</span>}</span>
      <input placeholder={ph} style={{ height: 42, padding: '0 14px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, font: 'inherit', boxSizing: 'border-box' }} />
    </div>
  );
  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#4B5563', cursor: 'pointer', font: 'inherit', marginBottom: 14 }}><AdminIcon name="chevron-left" size={18} color="#6B7280" /> 목록으로</button>
      <PageTitle title="모집 공고 등록" desc="새 교내 근로 공고를 작성합니다. 이전 공고를 불러와 빠르게 채울 수 있습니다."
        right={<AButton variant="outline" icon="copy">이전 공고 불러오기</AButton>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
        <APanel title="기본 정보">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {field('공고명', '예) 2026-1학기 학생지원팀 행정 보조', true)}
            {field('담당 부서', '부서를 선택하세요', true)}
            {field('모집 인원', '예) 2', true)}
            {field('주당 최대 근무시간', '예) 15', true)}
            {field('모집 시작일', 'YYYY.MM.DD', true)}
            {field('지원 마감일', 'YYYY.MM.DD', true)}
          </div>
        </APanel>
        <APanel title="업무 내용 및 자격">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>업무 내용 <span style={{ color: '#B01116' }}>*</span></div>
              <textarea placeholder="담당 업무를 구체적으로 작성하세요." style={{ width: '100%', height: 90, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600, marginBottom: 6 }}>지원 자격 및 우대 조건</div>
              <textarea placeholder="지원 자격, 우대 역량을 작성하세요." style={{ width: '100%', height: 80, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
        </APanel>
        <APanel title="근무 요일 / 시간"><ATimeGrid redSlots={['월-10:00','월-11:00','수-10:00','수-11:00']} redLabel="" legend={false} /></APanel>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <AButton variant="outline" onClick={onBack}>취소</AButton>
          <AButton variant="ghost">임시저장</AButton>
          <AButton variant="primary" icon="check">공고 등록</AButton>
        </div>
      </div>
    </div>
  );
}
window.PostsModule = PostsModule;
