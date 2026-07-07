// 교내 근로 모집 공고 (post list)
function PostListScreen({ onOpenDetail, onApply }) {
  const { Icon, StatCard, StatusBadge } = window;
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('전체 기한');
  const [showOnlyMatch, setShowOnlyMatch] = React.useState(false);
  const cats = [
    { label: '도서관', icon: 'book-open' },
    { label: '학과별 사무실', icon: 'map-pin' },
    { label: '교내 부서', icon: 'building-2' },
    { label: '전체 기한', icon: 'layout-grid' },
  ];
  const filters = [
    { label: '부서', value: '전체' },
    { label: '모집상태', value: '전체' },
    { label: '요일', value: '전체' },
    { label: '시간대', value: '전체' },
    { label: '정렬', value: '마감임박순' },
  ];
  const suggestions = ['행정 업무', '도서관', '학생지원팀', '민원'];
  const normalizedQ = q.trim().toLowerCase();
  const filteredPosts = window.posts.filter(p => {
    const matchesCat = cat === '전체 기한' || p.category === cat;
    const text = `${p.dept} ${p.title} ${p.team} ${p.preferred}`.toLowerCase();
    const matchesQ = !normalizedQ || text.includes(normalizedQ);
    const matchesSchedule = !showOnlyMatch || p.scheduleMatch;
    return matchesCat && matchesQ && matchesSchedule;
  });

  const infoItem = (icon, label, value) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9AA1A9', fontWeight: 600 }}>
        <Icon name={icon} size={14} color="#B9BFC6" /> {label}
      </span>
      <span style={{ fontSize: 13, color: '#3A4048', fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div>
      <div style={{ border: '2px solid #B01116', borderRadius: 12, padding: '16px 22px', marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1F2937' }}>교내 근로 모집 공고</h1>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {window.postStats.map(s => <StatCard key={s.key} stat={s} />)}
      </div>

      {/* Search + filters */}
      <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 620 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
              <Icon name="search" size={18} color="#9AA1A9" />
            </span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="부서명, 업무명, 키워드로 검색하세요"
              style={{ width: '100%', height: 44, padding: '0 14px 0 42px', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, font: 'inherit', boxSizing: 'border-box' }} />
            {q && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 8px)', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 8, padding: '8px 10px', boxShadow: '0 8px 24px rgba(16,24,40,.08)', zIndex: 2 }}>
                {suggestions.filter(s => s.includes(q)).map(s => (
                  <button key={s} onClick={() => setQ(s)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 6px', fontSize: 13, color: '#4B5563', cursor: 'pointer', font: 'inherit' }}>{s}</button>
                ))}
              </div>
            )}
          </div>
          <button style={{ height: 44, padding: '0 26px', background: '#26292E', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>검색</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', marginBottom: 16 }}>
          {filters.map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{f.label}</span>
              <button style={{ display: 'flex', alignItems: 'center', gap: 20, height: 38, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>
                {f.value} <Icon name="chevron-down" size={15} color="#9AA1A9" />
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4B5563', cursor: 'pointer' }}>
            <input checked={showOnlyMatch} onChange={() => setShowOnlyMatch(v => !v)} type="checkbox" style={{ width: 16, height: 16, accentColor: '#B01116' }} />
            내 시간표와 맞는 공고만 보기 <Icon name="info" size={14} color="#B9BFC6" />
          </label>
          <button onClick={() => { setQ(''); setCat('전체 기한'); setShowOnlyMatch(false); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', font: 'inherit' }}>
            <Icon name="rotate-ccw" size={14} color="#9AA1A9" /> 필터 초기화
          </button>
        </div>
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {cats.map(c => {
          const on = cat === c.label;
          return (
            <button key={c.label} onClick={() => setCat(c.label)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46,
              background: on ? '#FDECEC' : '#fff', border: '1px solid ' + (on ? '#EBB9B8' : '#E6E8EB'),
              borderRadius: 8, fontSize: 14, fontWeight: 600, color: on ? '#B01116' : '#4B5563', cursor: 'pointer', font: 'inherit',
            }}>
              <Icon name={c.icon} size={16} color={on ? '#B01116' : '#8A929B'} /> {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: '#4B5563' }}>총 <b style={{ color: '#1F2937' }}>{filteredPosts.length}개</b>의 공고</div>
        <div style={{ fontSize: 13, color: '#9AA1A9' }}>{q ? `"${q}" 검색 결과` : '추천 공고 기준'}</div>
      </div>

      {/* Post cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {filteredPosts.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '30px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937', marginBottom: 8 }}>조건에 맞는 공고가 없습니다</div>
            <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>선택한 필터를 초기화하고 다시 검색해 보세요.</div>
            <button onClick={() => { setQ(''); setCat('전체 기한'); setShowOnlyMatch(false); }} style={{ height: 40, padding: '0 18px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>필터 초기화</button>
          </div>
        ) : filteredPosts.map(p => (
          <div key={p.id} style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ paddingTop: 2 }}><StatusBadge status={p.status} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#1F2937', marginBottom: 16 }}>
                  {p.dept} <span style={{ color: '#D5D8DC', margin: '0 8px' }}>|</span> {p.title}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18 }}>
                  {infoItem('calendar', '근무기간', p.period)}
                  {infoItem('clock', '근무시간', p.hours)}
                  {infoItem('users', '모집인원', p.headcount)}
                  {infoItem('timer', '주당 근무시간', p.weeklyMax)}
                  {infoItem('award', '우대조건', p.preferred)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, width: 220, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    {p.applied ? (
                      <div style={{ fontSize: 13, color: '#6B7280' }}>지원일 <span style={{ color: '#3A4048', fontWeight: 600 }}>{p.appliedDate}</span></div>
                    ) : (
                      <>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#D9791F' }}>마감까지 {p.dday}</div>
                        <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 2 }}>마감일 {p.deadline}</div>
                      </>
                    )}
                  </div>
                  <Icon name="heart" size={20} color="#C9CED4" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => onOpenDetail && onOpenDetail(p)} style={{ height: 40, padding: '0 18px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit' }}>상세보기</button>
                  {p.applied ? (
                    <button style={{ height: 40, padding: '0 18px', background: '#E8F0FB', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#2563C9', cursor: 'pointer', font: 'inherit' }}>지원현황 보기</button>
                  ) : p.status === '모집완료' ? (
                    <button disabled style={{ height: 40, padding: '0 22px', background: '#EEF0F2', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#6B7280', cursor: 'not-allowed', font: 'inherit' }}>지원 마감</button>
                  ) : (
                    <button onClick={() => onApply && onApply(p)} style={{ height: 40, padding: '0 22px', background: p.status === '마감임박' ? '#D9791F' : '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>{p.status === '마감임박' ? '마감임박 지원' : '지원하기'}</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.PostListScreen = PostListScreen;
