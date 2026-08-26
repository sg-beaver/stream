import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { streamMenu } from '../../data/mockData'
import { getSessionUser } from '../../utils/session'
import SaintHeader from './SaintHeader'

// 라우트가 없는 메뉴(출결)는 아직 미구현
const MENU_ROUTES = {
  posts:      '/posts',
  liked:      '/liked',
  profile:    '/profile',
  status:     '/applications',
  schedule:   '/schedule',
  substitute: '/substitute',
}

export default function Shell({ children, activeMenu }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const user = getSessionUser()

  // 로그인하지 않은 상태로 접근하면 로그인 화면으로, 직원 계정이면 관리자 화면으로 보낸다
  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return }
    if (user.role === 'staff') navigate('/admin/posts', { replace: true })
  }, [user, navigate])

  if (!user || user.role === 'staff') return null

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', fontFamily: 'var(--font-sans)' }}>

      <SaintHeader activeTab="STREAM" />

      {/* STREAM 콘텐츠 영역 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* 좌측 STREAM 사이드바 */}
        {!collapsed && (
          <aside style={{
            width: 230, flexShrink: 0,
            background: 'var(--surface-card)',
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
                  background: 'var(--saint-toggle)', border: 'none', borderRadius: 3,
                  color: 'var(--text-on-brand)', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >«</button>
            </div>

            {/* 흰 내부 패널 (섹션 제목 + 메뉴) */}
            <div style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--saint-border)',
              flex: 1, overflowY: 'auto', minHeight: 0,
            }}>
              {/* 섹션 제목 */}
              <div style={{ padding: '8px 12px 7px', borderBottom: '1px solid var(--saint-border-soft)' }}>
                <div style={{ fontFamily: 'var(--font-saint)', fontSize: 14, fontWeight: 700, color: 'var(--saint-red)' }}>
                  STREAM
                </div>
                <div style={{ fontSize: 10, color: 'var(--saint-text-faint)', marginTop: 1, fontFamily: 'var(--font-sans)' }}>
                  교내 근로 관리 시스템
                </div>
              </div>

              {/* 메뉴 항목 */}
              {streamMenu.map(item => {
                const isActive = activeMenu === item.id
                return (
                  <div key={item.id} style={{ borderBottom: '1px solid var(--saint-border-faint)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const route = MENU_ROUTES[item.id]
                        if (route) navigate(route)
                        else alert('준비 중인 기능입니다.')
                      }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px',
                        border: 'none',
                        background: isActive ? 'var(--saint-nav-active)' : 'var(--surface-card)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12, fontWeight: isActive ? 700 : 400,
                        color: isActive ? 'var(--saint-red)' : 'var(--saint-tab-inactive)',
                        cursor: 'pointer', textAlign: 'left',
                        letterSpacing: '-0.2px', boxSizing: 'border-box',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--saint-hover)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-card)' }}
                    >
                      <span style={{ color: 'var(--saint-red)', fontSize: 8, flexShrink: 0, lineHeight: 1 }}>■</span>
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
              background: 'linear-gradient(180deg, var(--sogang-red-50) 0%, var(--sogang-red-50) 100%)',
              border: '1px solid var(--sogang-red-100)',
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
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sogang-red)', fontFamily: 'var(--font-saint)' }}>AI 챗봇</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-body)', fontFamily: 'var(--font-sans)' }}>서강 근로 지원 도우미</div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', fontFamily: 'var(--font-sans)' }}>무엇을 도와드릴까요?</div>
              <button type="button" style={{
                marginTop: 5, width: '100%', padding: '5px 0',
                background: 'var(--sogang-red)', border: 'none',
                borderRadius: 6, color: 'var(--text-on-brand)', fontSize: 11, fontWeight: 700,
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
                background: 'var(--saint-red)', border: 'none', borderRadius: 3,
                color: 'var(--text-on-brand)', fontSize: 10, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >»</button>
          </div>
        )}

        {/* 메인 콘텐츠 */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--surface-card)', minHeight: 0, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
