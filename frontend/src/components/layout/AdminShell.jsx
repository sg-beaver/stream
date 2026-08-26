import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminMenu } from '../../data/mockData'
import { getSessionUser } from '../../utils/session'
import SaintHeader from './SaintHeader'
import SidebarNav from './SidebarNav'

// 명세 도착 전까지는 uiux/ui_kits/admin 구조만 참고 — 비주얼은 학생 Shell과 동일한 SAINT 톤 유지
const MENU_ROUTES = {
  posts:      '/admin/posts',
  selection:  '/admin/selection',
  students:   '/admin/students',
  schedule:   '/admin/schedule',
  substitute: '/admin/substitute',
  settings:   '/admin/settings',
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
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', fontFamily: 'var(--font-sans)' }}>

      <SaintHeader activeTab="STREAM" />

      {/* STREAM 콘텐츠 영역 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        <SidebarNav
          title="STREAM"
          subtitle="교내 근로 관리 시스템 (관리자)"
          items={adminMenu}
          active={activeMenu}
          onSelect={id => navigate(MENU_ROUTES[id])}
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
