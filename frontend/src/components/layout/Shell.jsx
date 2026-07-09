import { useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import { streamMenu, currentUser } from '../../data/mockData'

const MENU_ROUTES = {
  posts:      '/posts',
  apply:      '/apply',
  status:     '/applications',
  schedule:   '/posts',
  substitute: '/posts',
  attendance: '/posts',
}

const SAINT_TABS = ['학생정보', '학적변동', '수업·성적', '등록·장학', '졸업', '학생신청', '학생활동', '시설', 'STREAM']

function Icon({ name, size = 16, color = 'currentColor' }) {
  const Comp = LucideIcons[name]
  if (!Comp) return null
  return <Comp size={size} color={color} strokeWidth={1.75} />
}

function today() {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}(${days[d.getDay()]})`
}

export default function Shell({ children, activeMenu }) {
  const navigate = useNavigate()

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--saint-page-bg)', fontFamily: 'var(--font-sans)' }}>

      {/* ① 최상단 유틸리티 바 */}
      <div style={{
        height: 28, background: 'var(--saint-topbar-bg)',
        borderBottom: '1px solid #D8D8D8',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 24px', gap: 0, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: 'var(--saint-topbar-text)' }}>
          {today()} &nbsp;<strong>{currentUser.name}</strong>님 환영합니다.
        </span>
        <span style={{ margin: '0 10px', color: '#ccc' }}>|</span>
        <button type="button" style={utilBtn}>STREAM</button>
        <span style={{ margin: '0 6px', color: '#ccc' }}>|</span>
        <button type="button" onClick={() => navigate('/login')} style={utilBtn}>LOGOUT</button>
      </div>

      {/* ② SAINT 헤더 (흰색 배경 + 로고 + 탭) */}
      <header style={{
        background: 'var(--saint-header-bg)',
        borderBottom: '2px solid #CCCCCC',
        flexShrink: 0,
      }}>
        {/* 로고 + 탭 영역 */}
        <div style={{ display: 'flex', alignItems: 'stretch', padding: '0 24px', minHeight: 52 }}>
          {/* 로고 */}
          <div style={{ display: 'flex', alignItems: 'center', marginRight: 32, paddingRight: 24, borderRight: '1px solid #E0E0E0', flexShrink: 0 }}>
            <img
              src="/assets/sogang-logo.png"
              alt="서강대학교 SOGANG UNIVERSITY"
              style={{ height: 36, objectFit: 'contain' }}
              onError={e => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            {/* 로고 폴백 */}
            <div style={{ display: 'none', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontFamily: 'var(--font-saint)', fontSize: 15, fontWeight: 700, color: 'var(--saint-red)' }}>서강대학교</span>
              <span style={{ fontSize: 9, color: '#888', letterSpacing: '0.05em' }}>SOGANG UNIVERSITY</span>
            </div>
          </div>

          {/* SAINT 탭 */}
          <nav style={{ display: 'flex', alignItems: 'flex-end', flex: 1, overflowX: 'auto' }}>
            {SAINT_TABS.map(tab => {
              const isStream = tab === 'STREAM'
              return (
                <div
                  key={tab}
                  style={{
                    height: 52, display: 'flex', alignItems: 'center', padding: '0 14px',
                    borderBottom: isStream ? `2px solid var(--saint-red)` : '2px solid transparent',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <span style={{
                    fontFamily: isStream ? 'var(--font-saint)' : 'var(--font-sans)',
                    fontSize: isStream ? 15 : 13,
                    fontWeight: isStream ? 700 : 400,
                    color: isStream ? 'var(--saint-red)' : 'var(--saint-tab-inactive)',
                    whiteSpace: 'nowrap',
                    letterSpacing: isStream ? 0 : '-0.2px',
                  }}>
                    {tab}
                  </span>
                </div>
              )
            })}
          </nav>

          {/* 우측 알림+사용자 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 16 }}>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#666', display: 'flex' }}>
              <Icon name="Bell" size={18} color="#666" />
            </button>
            <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontFamily: 'var(--font-sans)', fontSize: 12, color: '#333' }}>
              <Icon name="User" size={16} color="#666" />
              <span>{currentUser.name} (학생)</span>
              <Icon name="ChevronDown" size={12} color="#999" />
            </button>
          </div>
        </div>
      </header>

      {/* ③ STREAM 콘텐츠 영역 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* 좌측 STREAM 사이드바 */}
        <aside style={{
          width: 200, flexShrink: 0,
          background: 'var(--saint-sidebar-bg)',
          borderRight: '1px solid #C8D0DC',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* STREAM 섹션 제목 */}
          <div style={{
            padding: '14px 18px 10px',
            borderBottom: '1px solid #C8D0DC',
          }}>
            <div style={{
              fontFamily: 'var(--font-saint)',
              fontSize: 14, fontWeight: 700,
              color: 'var(--saint-red)',
              letterSpacing: '-0.01em',
            }}>
              STREAM
            </div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>교내 근로 관리 시스템</div>
          </div>

          {/* 메뉴 항목 — 넘치면 여기만 스크롤 */}
          <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto', minHeight: 0 }}>
            {streamMenu.map(item => {
              const isActive = activeMenu === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(MENU_ROUTES[item.id] || '/posts')}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 18px 8px 30px',
                    border: 'none', background: isActive ? 'rgba(182,0,5,0.07)' : 'transparent',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13, fontWeight: isActive ? 700 : 400,
                    color: isActive ? 'var(--saint-red)' : '#333333',
                    cursor: 'pointer', textAlign: 'left',
                    letterSpacing: '-0.2px',
                    transition: 'background 100ms',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* ■ 불릿 */}
                  <span style={{
                    width: 6, height: 6, flexShrink: 0,
                    background: isActive ? 'var(--saint-red)' : '#888',
                    borderRadius: 1,
                  }} />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* AI 챗봇 카드 — 항상 하단 고정 */}
          <div style={{
            flexShrink: 0,
            margin: '10px 12px 14px',
            padding: '12px 14px',
            background: 'var(--saint-red)',
            borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <img
                src="/assets/stream-mascot.png"
                alt=""
                style={{ width: 22, height: 22, objectFit: 'contain' }}
                onError={e => { e.target.style.display = 'none' }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-saint)' }}>AI 챗봇</span>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.88)', margin: '0 0 8px', lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>
              서강 근로 지원 도우미<br />무엇을 도와드릴까요?
            </p>
            <button type="button" style={{
              width: '100%', padding: '5px 0',
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 3, color: '#fff', fontSize: 10, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              질문하기
            </button>
          </div>
        </aside>

        {/* 메인 콘텐츠 */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', background: '#FFFFFF' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

const utilBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 11, color: '#555', fontFamily: 'var(--font-sans)',
  padding: '0 4px', letterSpacing: '-0.2px',
}
