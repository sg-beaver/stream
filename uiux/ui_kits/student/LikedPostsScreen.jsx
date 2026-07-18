// 관심 공고 — 하트 누른 공고를 마감 임박순으로 관리
function LikedPostsScreen({ liked, onToggleLike, onOpenDetail, onApply, onBrowse }) {
  const { Icon, StatCard, StatusBadge } = window;
  const likedPosts = window.posts.filter(p => liked[p.id]);

  // 마감 알림 토글 (마감임박 공고는 기본 켜짐)
  const [alarms, setAlarms] = React.useState(() => {
    const a = {};
    window.posts.forEach(p => { if (liked[p.id] && p.status === '마감임박') a[p.id] = true; });
    return a;
  });
  const toggleAlarm = (id) => setAlarms(m => ({ ...m, [id]: !m[id] }));

  const ddayNum = (p) => {
    if (p.status === '모집완료') return 999;
    if (p.dday) return parseInt(p.dday.replace('D-', ''), 10);
    return 500; // 지원완료 등 D-day 없는 공고는 뒤로
  };
  const sorted = [...likedPosts].sort((a, b) => ddayNum(a) - ddayNum(b));

  const stats = [
    { key: 'all', label: '관심 공고', value: likedPosts.length + '건', sub: '하트를 누른 공고', icon: 'heart', tone: 'neutral' },
    { key: 'open', label: '모집중', value: likedPosts.filter(p => p.status === '모집중').length + '건', sub: '지금 지원 가능', icon: 'megaphone', tone: 'green' },
    { key: 'soon', label: '마감임박', value: likedPosts.filter(p => p.status === '마감임박').length + '건', sub: '3일 이내 마감', icon: 'clock', tone: 'orange' },
    { key: 'closed', label: '마감됨', value: likedPosts.filter(p => p.status === '모집완료').length + '건', sub: '모집이 종료된 공고', icon: 'circle-slash-2', tone: 'neutral' },
  ];

  const ddayChip = (p) => {
    if (p.status === '모집완료') return <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', background: '#EEF0F2', padding: '3px 10px', borderRadius: 10 }}>마감</span>;
    if (p.applied) return null;
    const n = ddayNum(p);
    const tone = n <= 1 ? { bg: '#FDECEC', fg: '#B01116' } : n <= 3 ? { bg: '#FDEEE0', fg: '#D9791F' } : { bg: '#EEF0F2', fg: '#4B5563' };
    return <span style={{ fontSize: 12, fontWeight: 800, color: tone.fg, background: tone.bg, padding: '3px 10px', borderRadius: 10 }}>{p.dday}</span>;
  };

  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1F2937' }}>관심 공고</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>공고 목록에서 ♥를 누른 공고를 한곳에서 관리하세요. 마감이 임박한 순으로 보여드립니다.</p>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {stats.map(s => <StatCard key={s.key} stat={s} />)}
      </div>

      {likedPosts.length === 0 ? (
        /* 빈 상태 */
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '56px 24px', textAlign: 'center' }}>
          <span style={{ width: 72, height: 72, borderRadius: '50%', background: '#FDECEC', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Icon name="heart" size={32} color="#B01116" />
          </span>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937', marginBottom: 8 }}>아직 관심 공고가 없습니다</div>
          <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>공고 목록에서 ♥를 눌러 관심 있는 공고를 모아보세요.</div>
          <button onClick={onBrowse} style={{ height: 44, padding: '0 24px', background: '#B01116', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit' }}>공고 보러가기</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: '#4B5563' }}>총 <b style={{ color: '#1F2937' }}>{likedPosts.length}개</b>의 관심 공고</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#9AA1A9' }}>
              <Icon name="arrow-down-narrow-wide" size={14} color="#9AA1A9" /> 마감 임박순 정렬
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sorted.map(p => {
              const closed = p.status === '모집완료';
              const alarmOn = !!alarms[p.id];
              return (
                <div key={p.id} style={{ background: '#fff', border: '1px solid ' + (ddayNum(p) <= 1 && !closed && !p.applied ? '#EBB9B8' : '#E6E8EB'), borderRadius: 12, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16, opacity: closed ? 0.65 : 1 }}>
                  {/* 하트 (해제) */}
                  <button onClick={() => onToggleLike(p.id)} title="관심 공고에서 제거" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'inline-flex', flexShrink: 0 }}>
                    <Icon name="heart" size={20} color="#B01116" style={{ fill: '#B01116' }} />
                  </button>

                  {/* 본문 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{p.title}</span>
                      <StatusBadge status={p.status} />
                      {ddayChip(p)}
                      {p.scheduleMatch && !closed && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#1F8A4C', background: '#E7F4EA', padding: '3px 10px', borderRadius: 10 }}>
                          <Icon name="check-circle-2" size={12} color="#1F8A4C" /> 시간표 일치
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#9AA1A9', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{p.dept}{p.team && p.team !== p.dept ? ' · ' + p.team : ''}</span>
                      <span style={{ color: '#D5D8DC' }}>|</span>
                      <span>{p.hours}</span>
                      <span style={{ color: '#D5D8DC' }}>|</span>
                      <span>모집 {p.headcount}</span>
                      <span style={{ color: '#D5D8DC' }}>|</span>
                      <span>마감 {p.deadline.split(' ')[0]}</span>
                    </div>
                  </div>

                  {/* 마감 알림 토글 */}
                  {!closed && !p.applied && (
                    <button onClick={() => toggleAlarm(p.id)} title={alarmOn ? '마감 하루 전 알림이 설정되어 있습니다' : '마감 알림 받기'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', flexShrink: 0,
                        background: alarmOn ? '#FDECEC' : '#fff', border: '1px solid ' + (alarmOn ? '#EBB9B8' : '#E6E8EB'),
                        borderRadius: 8, fontSize: 12, fontWeight: 600, color: alarmOn ? '#B01116' : '#9AA1A9', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap',
                      }}>
                      <Icon name={alarmOn ? 'bell-ring' : 'bell-off'} size={14} color={alarmOn ? '#B01116' : '#9AA1A9'} />
                      {alarmOn ? '알림 켜짐' : '마감 알림'}
                    </button>
                  )}

                  {/* 액션 */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => onOpenDetail && onOpenDetail(p)} style={{ height: 36, padding: '0 14px', background: '#fff', border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#3A4048', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>상세보기</button>
                    {p.applied ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 14px', background: '#E8F0FB', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#2563C9', whiteSpace: 'nowrap' }}>지원완료</span>
                    ) : closed ? (
                      <button disabled style={{ height: 36, padding: '0 14px', background: '#EEF0F2', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#9AA1A9', cursor: 'not-allowed', font: 'inherit', whiteSpace: 'nowrap' }}>마감</button>
                    ) : (
                      <button onClick={() => onApply && onApply(p)} style={{ height: 36, padding: '0 16px', background: p.status === '마감임박' ? '#D9791F' : '#B01116', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }}>바로 지원</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 12, color: '#9AA1A9' }}>
            <Icon name="info" size={13} color="#B9BFC6" />
            알림을 켜둔 공고는 마감 하루 전에 알림을 보내드립니다. 하트를 다시 누르면 목록에서 제거됩니다.
          </div>
        </>
      )}
    </div>
  );
}
window.LikedPostsScreen = LikedPostsScreen;
