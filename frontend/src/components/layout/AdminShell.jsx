import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminMenu } from '../../data/mockData'
import { getSessionUser } from '../../utils/session'
import SaintHeader from './SaintHeader'

// 명세 도착 전까지는 uiux/ui_kits/admin 구조만 참고 — 비주얼은 학생 Shell과 동일한 SAINT 톤 유지
const MENU_ROUTES = {
  posts:      '/admin/posts',
  selection:  '/admin/selection',
  students:   '/admin/students',
  schedule:   '/admin/schedule',
  substitute: '/admin/substitute',
  dashboard:  '/admin/dashboard',
}

export default function AdminShell({ children, activeMenu }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const user = getSessionUser()

  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return }
    if (user.role !== 'staff') navigate('/posts', { replace: true })
  }, [user, navigate])

  if (!user || user.role !== 'staff') return null

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'var(--font-sans)' }}>

      <SaintHeader activeTab="STREAM" />

      {/* STREAM 콘텐츠 영역 */}
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

            <div style={{
              background: '#fff',
              border: '1px solid #C8C8C8',
              flex: 1, overflowY: 'auto', minHeight: 0,
            }}>
              <div style={{ padding: '8px 12px 7px', borderBottom: '1px solid #D8D8D8' }}>
                <div style={{ fontFamily: 'var(--font-saint)', fontSize: 14, fontWeight: 700, color: '#B60005' }}>
                  STREAM
                </div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 1, fontFamily: 'var(--font-sans)' }}>
                  교내 근로 관리 시스템 (관리자)
                </div>
              </div>

              {adminMenu.map(item => {
                const isActive = activeMenu === item.id
                return (
                  <div key={item.id} style={{ borderBottom: '1px solid #E8E8E8' }}>
                    <button
                      type="button"
                      onClick={() => navigate(MENU_ROUTES[item.id])}
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
          </aside>
        )}

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
