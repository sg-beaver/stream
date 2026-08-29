import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminMenu, teamLeadMenu } from '../../data/mockData'
import { getSessionUser } from '../../utils/session'
import SaintHeader from './SaintHeader'
import SidebarNav from './SidebarNav'
import { MENU_ROUTES as STUDENT_MENU_ROUTES } from './Shell'

// 명세 도착 전까지는 uiux/ui_kits/admin 구조만 참고 — 비주얼은 학생 Shell과 동일한 SAINT 톤 유지
const MENU_ROUTES = {
  posts:      '/admin/posts',
  selection:  '/admin/selection',
  students:   '/admin/students',
  schedule:   '/admin/schedule',
  substitute: '/admin/substitute',
  settings:   '/admin/settings',
}

// 학생팀장에게 열린 관리자 메뉴 (#156). 백엔드 권한(services.require_schedule_editor)과
// 같은 범위 — 대타 승인·공고/선발·부서 설정은 직원 몫이라 메뉴에서도 빠진다.
const TEAM_LEAD_MENUS = ['schedule']

// 학생팀장 사이드바는 관리자 메뉴가 아니라 학생 메뉴 + 근무표 편성이다 — 팀장도 근로 학생이라
// 공고·지원·본인 근무표 화면을 그대로 쓴다. 편성 화면은 학생 메뉴의 'schedule'(내 근무 시간표)와
// 겹치지 않게 'leadSchedule'로 표시한다.
const TEAM_LEAD_ACTIVE = { schedule: 'leadSchedule' }

function canUseAdmin(user) {
  return Boolean(user) && (user.role === 'staff' || user.is_team_lead)
}

export default function AdminShell({ children, activeMenu }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const user = getSessionUser()
  const isTeamLead = Boolean(user) && user.role !== 'staff' && user.is_team_lead
  const menu = isTeamLead ? teamLeadMenu : adminMenu
  const routes = isTeamLead ? STUDENT_MENU_ROUTES : MENU_ROUTES
  const active = isTeamLead ? (TEAM_LEAD_ACTIVE[activeMenu] || activeMenu) : activeMenu

  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return }
    if (!canUseAdmin(user)) { navigate('/posts', { replace: true }); return }
    // 팀장이 열 수 없는 관리자 화면에 직접 들어오면 근무표 화면으로 돌린다
    if (isTeamLead && activeMenu && !TEAM_LEAD_MENUS.includes(activeMenu)) {
      navigate('/admin/schedule', { replace: true })
    }
  }, [user, isTeamLead, activeMenu, navigate])

  if (!canUseAdmin(user)) return null
  if (isTeamLead && activeMenu && !TEAM_LEAD_MENUS.includes(activeMenu)) return null

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', fontFamily: 'var(--font-sans)' }}>

      <SaintHeader activeTab="STREAM" />

      {/* STREAM 콘텐츠 영역 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        <SidebarNav
          title="STREAM"
          subtitle={isTeamLead ? '교내 근로 관리 시스템 (학생팀장)' : '교내 근로 관리 시스템 (관리자)'}
          items={menu}
          active={active}
          onSelect={id => navigate(routes[id])}
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
