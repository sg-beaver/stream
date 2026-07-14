import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { streamMenu } from '../../data/mockData'
import { getSessionUser, clearSessionUser } from '../../utils/session'

const MENU_ROUTES = {
  posts:      '/posts',
  apply:      '/apply',
  status:     '/applications',
  schedule:   '/posts',
  substitute: '/posts',
  attendance: '/posts',
}

const SAINT_TABS = ['학생정보', '학적변동', '수업·성적', '등록·장학', '졸업', '학생신청', '학생활동', '시설', 'STREAM']

function today() {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}(${days[d.getDay()]})`
}

export default function Shell({ children, activeMenu }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const user = getSessionUser()

  // 로그인하지 않은 상태로 접근하면 로그인 화면으로 보낸다
  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  if (!user) return null

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'var(--font-sans)' }}>

      {/* ① 최상단 빨간 띠 */}
      <div style={{ height: 4, background: 'var(--saint-red)', flexShrink: 0 }} />

      {/* ② 유틸리티 바 — 흰 배경, 우측 정렬 */}
      <div style={{
        height: 34, background: '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 28px', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: '#444', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
          {today()} &nbsp;<strong>{user.name}</strong>님 환영합니다.
        </span>
        <span style={{ margin: '0 14px', color: '#C8C8C8' }}>|</span>
        <button type="button" style={utilBtn}>PASSWORD CHANGE</button>
        <span style={{ margin: '0 14px', color: '#C8C8C8' }}>|</span>
        <button type="button" style={utilBtn}>ENGLISH</button>
        <span style={{ margin: '0 14px', color: '#C8C8C8' }}>|</span>
        <button type="button" onClick={() => { clearSessionUser(); navigate('/login') }} style={utilBtn}>LOGOUT</button>
      </div>

      {/* ③ SAINT 헤더 */}
      <header style={{ background: 'var(--saint-header-bg)', borderBottom: '1px solid #D8D8D8', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', padding: 0, minHeight: 64 }}>
          {/* 로고 — 사이드바 너비(230px)와 정렬 */}
          <div style={{ width: 230, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', boxSizing: 'border-box' }}>
            <img
              src="/assets/sogang-logo.png"
              alt="서강대학교 SOGANG UNIVERSITY"
              style={{ height: 36, objectFit: 'contain' }}
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
            />
            <div style={{ display: 'none', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontFamily: 'var(--font-saint)', fontSize: 15, fontWeight: 700, color: 'var(--saint-red)' }}>서강대학교</span>
              <span style={{ fontSize: 9, color: '#888', letterSpacing: '0.05em' }}>SOGANG UNIVERSITY</span>
            </div>
          </div>

          {/* SAINT 탭 */}
          <nav className="hide-scrollbar" style={{ display: 'flex', alignItems: 'flex-end', flex: 1, overflowX: 'auto' }}>
            {SAINT_TABS.map(tab => {
              const isStream = tab === 'STREAM'
              return (
                <div key={tab} style={{
                  height: 64, display: 'flex', alignItems: 'center', padding: '0 18px',
                  borderBottom: isStream ? `3px solid var(--saint-red)` : '3px solid transparent',
                  cursor: 'pointer', flexShrink: 0,
                }}>
                  <span style={{
                    fontFamily: 'var(--font-saint)',
                    fontSize: isStream ? 17 : 15,
                    fontWeight: isStream ? 700 : 400,
                    color: isStream ? 'var(--saint-red)' : 'var(--saint-tab-inactive)',
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

      {/* ④ STREAM 콘텐츠 영역 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* 좌측 STREAM 사이드바 */}
        {!collapsed && (
          <aside style={{
            width: 230, flexShrink: 0,
            background: '#FFFFFF',
            display: 'flex', flexDirection: 'column',
            padding: '4px 4px 4px',
            overflow: 'hidden', minHeight: 0,
          }}>
            {/* «» 버튼 — 우측 상단 작은 탭 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                title="사이드바 닫기"
                style={{
                  width: 24, height: 18,
                  background: '#8C8C8C', border: 'none', borderRadius: 3,
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >«</button>
            </div>

            {/* 흰 내부 패널 (섹션 제목 + 메뉴) */}
            <div style={{
              background: '#fff',
              border: '1px solid #C8C8C8',
              flex: 1, overflowY: 'auto', minHeight: 0,
            }}>
              {/* 섹션 제목 */}
              <div style={{ padding: '8px 12px 7px', borderBottom: '1px solid #D8D8D8' }}>
                <div style={{ fontFamily: 'var(--font-saint)', fontSize: 14, fontWeight: 700, color: '#B60005' }}>
                  STREAM
                </div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 1, fontFamily: 'var(--font-sans)' }}>
                  교내 근로 관리 시스템
                </div>
              </div>

              {/* 메뉴 항목 */}
              {streamMenu.map(item => {
                const isActive = activeMenu === item.id
                return (
                  <div key={item.id} style={{ borderBottom: '1px solid #E8E8E8' }}>
                    <button
                      type="button"
                      onClick={() => navigate(MENU_ROUTES[item.id] || '/posts')}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px',
                        border: 'none',
                        background: isActive ? '#FDF3F3' : '#fff',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12, fontWeight: isActive ? 700 : 400,
                        color: isActive ? '#B60005' : '#333333',
                        cursor: 'pointer', textAlign: 'left',
                        letterSpacing: '-0.2px', boxSizing: 'border-box',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F5F5' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}
                    >
                      <span style={{ color: '#B60005', fontSize: 8, flexShrink: 0, lineHeight: 1 }}>■</span>
                      {item.label}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* AI 챗봇 카드 */}
            <div style={{
              flexShrink: 0,
              marginTop: 8,
              padding: '12px 10px',
              background: 'linear-gradient(180deg, #FEF4F3 0%, #FDECEC 100%)',
              border: '1px solid #F7D9D8',
              borderRadius: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', gap: 3,
            }}>
              <img
                src="/assets/stream-mascot.png"
                alt=""
                style={{ width: 52, height: 'auto', objectFit: 'contain', marginBottom: 3 }}
                onError={e => { e.target.style.display = 'none' }}
              />
              <div style={{ fontSize: 13, fontWeight: 800, color: '#B01116', fontFamily: 'var(--font-saint)' }}>AI 챗봇</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#3A4048', fontFamily: 'var(--font-sans)' }}>서강 근로 지원 도우미</div>
              <div style={{ fontSize: 10, color: '#9AA1A9', fontFamily: 'var(--font-sans)' }}>무엇을 도와드릴까요?</div>
              <button type="button" style={{
                marginTop: 5, width: '100%', padding: '5px 0',
                background: '#B01116', border: 'none',
                borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>
                질문하기
              </button>
            </div>
          </aside>
        )}

        {/* 축소 상태일 때 » 탭 */}
        {collapsed && (
          <div style={{ flexShrink: 0, padding: '6px 4px 0' }}>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="사이드바 열기"
              style={{
                width: 24, height: 18,
                background: '#B60005', border: 'none', borderRadius: 3,
                color: '#fff', fontSize: 10, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >»</button>
          </div>
        )}

        {/* 메인 콘텐츠 */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#FFFFFF', minHeight: 0, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}

const utilBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 12, color: '#555', fontFamily: 'var(--font-sans)',
  padding: '0 4px', letterSpacing: '-0.2px',
}
