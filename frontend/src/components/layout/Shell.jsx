import { NavLink, useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import { saintNav, streamMenu, currentUser } from '../../data/mockData'

const MENU_ROUTES = {
  posts:       '/posts',
  apply:       '/apply',
  status:      '/applications',
  schedule:    '/posts',
  substitute:  '/posts',
  attendance:  '/posts',
}

function Icon({ name, size = 18, color = 'currentColor' }) {
  const Comp = LucideIcons[name]
  if (!Comp) return null
  return <Comp size={size} color={color} strokeWidth={1.75} />
}

export default function Shell({ children, activeMenu }) {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--saint-bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)' }}>
      {/* SAINT top header */}
      <header style={{
        height: 48, background: 'var(--saint-maroon)', display: 'flex', alignItems: 'center',
        padding: '0 24px', flexShrink: 0, gap: 24,
      }}>
        <img src="/assets/sogang-logo.png" alt="서강대학교" style={{ height: 24, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 400 }}>SAINT</span>
      </header>

      {/* SAINT tab bar */}
      <nav style={{
        height: 40, background: 'var(--saint-tan)', borderBottom: '1px solid var(--saint-grid)',
        display: 'flex', alignItems: 'flex-end', padding: '0 24px', flexShrink: 0, overflowX: 'auto',
      }}>
        {saintNav.map(tab => (
          <button
            key={tab}
            type="button"
            style={{
              height: 36, padding: '0 16px',
              fontSize: 13, fontWeight: tab === 'STREAM' ? 700 : 400,
              color: tab === 'STREAM' ? 'var(--sogang-red)' : 'var(--saint-maroon)',
              background: tab === 'STREAM' ? 'var(--neutral-0)' : 'transparent',
              border: 'none', borderTop: tab === 'STREAM' ? '2px solid var(--sogang-red)' : '2px solid transparent',
              borderLeft: '1px solid transparent', borderRight: '1px solid transparent',
              borderRadius: '4px 4px 0 0', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)',
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* STREAM content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar */}
        <aside style={{
          width: 220, flexShrink: 0, background: 'var(--saint-tan-soft)',
          borderRight: '1px solid var(--saint-grid)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Sidebar header */}
          <div style={{
            padding: '16px 18px 10px', borderBottom: '1px solid var(--saint-grid)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <img src="/assets/stream-mascot.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--sogang-red)', letterSpacing: '-0.01em' }}>STREAM</span>
          </div>

          {/* User info chip */}
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--saint-grid)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currentUser.major}</span>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginTop: 2 }}>{currentUser.name}</div>
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{currentUser.studentId}</span>
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, padding: '8px 0' }}>
            {streamMenu.map(item => {
              const isActive = activeMenu === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(MENU_ROUTES[item.id] || '/posts')}
                  className="stream-navitem"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 18px', border: 'none', font: 'inherit',
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--sogang-red)' : 'var(--text-body)',
                    background: isActive ? 'rgba(176,17,22,0.07)' : 'transparent',
                    borderRight: isActive ? '3px solid var(--sogang-red)' : '3px solid transparent',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background var(--dur-fast) var(--ease-standard)',
                  }}
                >
                  <Icon name={item.icon} size={16} color={isActive ? 'var(--sogang-red)' : 'var(--text-muted)'} />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* AI chatbot card */}
          <div style={{
            margin: '12px', padding: '14px 16px',
            background: 'linear-gradient(135deg, var(--sogang-red) 0%, #8a0d11 100%)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon name="Bot" size={16} color="#fff" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>AI 도우미</span>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5 }}>
              근로 관련 질문이 있으신가요? AI 도우미에게 물어보세요!
            </p>
            <button
              type="button"
              style={{
                marginTop: 10, width: '100%', padding: '6px 0',
                background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              질문하기
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--surface-page)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
