import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { streamMenu } from '../../data/mockData'
import { getSessionUser } from '../../utils/session'
import SaintHeader from './SaintHeader'
import SidebarNav from './SidebarNav'

// 메뉴 정의(streamMenu)에 라우트를 잇는다 — 짝이 없는 메뉴는 '준비 중'으로 안내한다
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

        <SidebarNav
          title="STREAM"
          subtitle="교내 근로 관리 시스템"
          items={streamMenu}
          active={activeMenu}
          onSelect={id => {
            const route = MENU_ROUTES[id]
            if (route) navigate(route)
            else alert('준비 중인 기능입니다.')
          }}
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
        />

        {/* 메인 콘텐츠 */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--surface-card)', minHeight: 0, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}

