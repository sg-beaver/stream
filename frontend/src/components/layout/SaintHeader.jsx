import { useNavigate } from 'react-router-dom'
import { getSessionUser, clearSessionUser } from '../../utils/session'

const STUDENT_TABS = ['학생정보', '학적변동', '수업·성적', '등록·장학', '졸업', '학생신청', '학생활동', '시설', 'STREAM']
const STAFF_TABS = ['인사', '예산', '자산', '구매', '시설', 'BI·평가', 'STREAM']

function today() {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}(${days[d.getDay()]})`
}

// SAINT 상단(빨간 띠 + 유틸리티 바 + 로고/탭) — Shell(STREAM 내부)과 SAINT 홈에서 공용으로 사용
export default function SaintHeader({ activeTab = 'STREAM' }) {
  const navigate = useNavigate()
  const user = getSessionUser()
  const isStaff = user?.role === 'staff'
  const tabs = isStaff ? STAFF_TABS : STUDENT_TABS

  function handleTabClick(tab) {
    if (tab === activeTab) return
    if (tab === 'STREAM') { navigate(isStaff ? '/admin/posts' : '/posts'); return }
    alert('데모에서는 지원하지 않는 기능입니다.')
  }

  return (
    <>
      {/* 최상단 빨간 띠 */}
      <div style={{ height: 4, background: 'var(--saint-red)', flexShrink: 0 }} />

      {/* 유틸리티 바 — 흰 배경, 우측 정렬 */}
      <div style={{
        height: 34, background: 'var(--surface-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 28px', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: 'var(--saint-text)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
          {today()} &nbsp;<strong>{user?.name}</strong>님 환영합니다.
        </span>
        <span style={{ margin: '0 14px', color: 'var(--saint-border)' }}>|</span>
        <button type="button" style={utilBtn}>PASSWORD CHANGE</button>
        <span style={{ margin: '0 14px', color: 'var(--saint-border)' }}>|</span>
        <button type="button" style={utilBtn}>ENGLISH</button>
        <span style={{ margin: '0 14px', color: 'var(--saint-border)' }}>|</span>
        <button type="button" onClick={() => { clearSessionUser(); navigate('/login') }} style={utilBtn}>LOGOUT</button>
      </div>

      {/* SAINT 헤더 */}
      <header style={{ background: 'var(--saint-header-bg)', borderBottom: '1px solid var(--saint-border-soft)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', padding: 0, minHeight: 64 }}>
          {/* 로고 — 사이드바 너비(230px)와 정렬. 클릭 시 SAINT 홈으로 이동 (실제 SAINT와 동일) */}
          <button
            type="button"
            onClick={() => navigate('/home')}
            title="SAINT 홈으로 이동"
            style={{ width: 230, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', boxSizing: 'border-box', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <img
              src="/assets/sogang-logo.png"
              alt="서강대학교 SOGANG UNIVERSITY"
              style={{ height: 36, objectFit: 'contain' }}
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
            />
            <div style={{ display: 'none', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontFamily: 'var(--font-saint)', fontSize: 15, fontWeight: 700, color: 'var(--saint-red)' }}>서강대학교</span>
              <span style={{ fontSize: 9, color: 'var(--saint-text-soft)', letterSpacing: '0.05em' }}>SOGANG UNIVERSITY</span>
            </div>
          </button>

          {/* SAINT 탭 */}
          <nav className="hide-scrollbar" style={{ display: 'flex', alignItems: 'flex-end', flex: 1, overflowX: 'auto' }}>
            {tabs.map(tab => {
              const isActive = tab === activeTab
              return (
                <div
                  key={tab}
                  onClick={() => handleTabClick(tab)}
                  style={{
                    height: 64, display: 'flex', alignItems: 'center', padding: '0 18px',
                    borderBottom: isActive ? '3px solid var(--saint-red)' : '3px solid transparent',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-saint)',
                    fontSize: isActive ? 17 : 15,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? 'var(--saint-red)' : 'var(--saint-tab-inactive)',
                    whiteSpace: 'nowrap',
                  }}>
                    {tab}
                  </span>
                </div>
              )
            })}
          </nav>
        </div>
      </header>
    </>
  )
}

const utilBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 12, color: 'var(--saint-topbar-text)', fontFamily: 'var(--font-sans)',
  padding: '0 4px', letterSpacing: '-0.2px',
}
