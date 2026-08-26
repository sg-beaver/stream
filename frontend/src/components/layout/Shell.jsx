import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { streamMenu } from '../../data/mockData'
import { getSessionUser } from '../../utils/session'
import SaintHeader from './SaintHeader'
import SidebarNav from './SidebarNav'

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
          footer={<ChatbotCard />}
        />

        {/* 메인 콘텐츠 */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--surface-card)', minHeight: 0, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}

// 좌측 바 하단 AI 챗봇 진입 카드
function ChatbotCard() {
  return (
    <div style={{
      padding: '12px 10px',
      background: 'linear-gradient(180deg, var(--sogang-red-50) 0%, var(--sogang-red-50) 100%)',
      border: '1px solid var(--sogang-red-100)',
      borderRadius: 'var(--radius-lg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', gap: 3,
    }}>
      {/* 서강이 마스코트 — 원본 비율 208:262. width/height를 모두 적어 로드 전 레이아웃 밀림을 막는다 */}
      <img
        src="/assets/stream-mascot.png"
        alt=""
        width={72}
        height={91}
        style={{ objectFit: 'contain', marginBottom: 3 }}
        onError={e => { e.target.style.display = 'none' }}
      />
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-extrabold)', color: 'var(--sogang-red)', fontFamily: 'var(--font-saint)' }}>AI 챗봇</div>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-bold)', color: 'var(--text-body)' }}>서강 근로 지원 도우미</div>
      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>무엇을 도와드릴까요?</div>
      <button type="button" style={{
        marginTop: 5, width: '100%', padding: '6px 0',
        background: 'var(--sogang-red)', border: 'none',
        borderRadius: 'var(--radius-sm)', color: 'var(--text-on-brand)',
        fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-bold)',
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
      }}>
        질문하기
      </button>
    </div>
  )
}
