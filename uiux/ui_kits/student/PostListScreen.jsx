// 교내 근로 모집 공고 (post list)
function PostListScreen({ onOpenDetail, onApply, liked: likedProp, onToggleLike }) {
  const { Icon, StatCard, StatusBadge } = window;
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('전체 기한');
  const [showOnlyMatch, setShowOnlyMatch] = React.useState(false);
  // 하트 상태는 App에서 내려주면 공유(관심 공고 탭과 동기화), 없으면 로컬로 동작
  const [likedLocal, setLikedLocal] = React.useState({});
  const liked = likedProp || likedLocal;
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

  const toggleLike = (id) => onToggleLike ? onToggleLike(id) : setLikedLocal(m => ({ ...m, [id]: !m[id] }));

  const th = (label, width) => (
    <th style={{
      padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: 'center',
      whiteSpace: 'nowrap', width, background: '#F6F0E6', borderBottom: '1px solid #E6E8EB',
    }}>{label}</th>
  );

  const resetFilters = () => { setQ(''); setCat('전체 기한'); setShowOnlyMatch(false); };

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
          <button onClick={resetFilters} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', font: 'inherit' }}>
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

      {/* Post table */}
      {filteredPosts.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '30px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937', marginBottom: 8 }}>조건에 맞는 공고가 없습니다</div>
          <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>선택한 필터를 초기화하고 다시 검색해 보세요.</div>
          <button onClick={resetFilters} style={{ height: 40, padding: '0 18px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>필터 초기화</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {th('상태', 84)}
                {th('공고명 · 부서')}
                {th('근무시간', 170)}
                {th('모집인원', 84)}
                {th('마감', 130)}
                {th('시간표', 68)}
                {th('관심', 56)}
                {th('관리', 160)}
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i === filteredPosts.length - 1 ? 'none' : '1px solid #EEF0F2' }}>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}><StatusBadge status={p.status} /></td>
                  <td style={{ padding: '14px 16px' }} title={p.preferred}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: '#9AA1A9', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {p.dept}{p.team && p.team !== p.dept ? ` · ${p.team}` : ''}
                      <Icon name="info" size={12} color="#C9CED4" />
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048' }}>{p.hours}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: '#3A4048', fontWeight: 600 }}>{p.headcount}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    {p.status === '모집완료' ? (
                      <span style={{ fontSize: 13, color: '#9AA1A9', fontWeight: 600 }}>모집 마감</span>
                    ) : p.applied ? (
                      <>
                        <div style={{ fontSize: 12, color: '#9AA1A9' }}>지원일</div>
                        <div style={{ fontSize: 13, color: '#3A4048', fontWeight: 600 }}>{p.appliedDate.split(' ')[0]}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 800, color: p.status === '마감임박' ? '#D9791F' : '#3A4048' }}>{p.dday}</div>
                        <div style={{ fontSize: 11, color: '#9AA1A9', marginTop: 1 }}>{p.deadline.split(' ')[0]}</div>
                      </>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    {p.scheduleMatch ? (
                      <span title="내 시간표와 일치하는 공고입니다" style={{ display: 'inline-flex' }}><Icon name="check-circle-2" size={18} color="#1F8A4C" /></span>
                    ) : (
                      <span style={{ display: 'inline-flex' }}><Icon name="minus" size={16} color="#D5D8DC" /></span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button onClick={() => toggleLike(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
                      <Icon name="heart" size={18} color={liked[p.id] ? '#B01116' : '#C9CED4'} style={liked[p.id] ? { fill: '#B01116' } : {}} />
                    </button>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => onOpenDetail && onOpenDetail(p)} style={{ height: 34, padding: '0 12px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>상세보기</button>
                      {p.applied ? (
                        <button style={{ height: 34, padding: '0 12px', background: '#E8F0FB', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#2563C9', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>지원현황</button>
                      ) : p.status === '모집완료' ? (
                        <button disabled style={{ height: 34, padding: '0 12px', background: '#EEF0F2', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#9AA1A9', cursor: 'not-allowed', font: 'inherit', whiteSpace: 'nowrap' }}>마감</button>
                      ) : (
                        <button onClick={() => onApply && onApply(p)} style={{ height: 34, padding: '0 14px', background: p.status === '마감임박' ? '#D9791F' : '#B01116', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>지원하기</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
window.PostListScreen = PostListScreen;
