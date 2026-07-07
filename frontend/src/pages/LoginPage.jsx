import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import Button from '../components/ui/Button'

export default function LoginPage() {
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!id || !pw) { setError('학번과 비밀번호를 모두 입력해주세요.'); return }
    navigate('/posts')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--saint-bg)', fontFamily: 'var(--font-sans)',
    }}>
      {/* SAINT-style header bar */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 48,
        background: 'var(--saint-maroon)', display: 'flex', alignItems: 'center', padding: '0 24px',
      }}>
        <img src="/assets/sogang-logo.png" alt="서강대학교" style={{ height: 24, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        <span style={{ marginLeft: 16, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>SAINT</span>
      </header>

      <div style={{
        marginTop: 48, width: '100%', maxWidth: 400, padding: 32,
        background: 'var(--neutral-0)', borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-subtle)',
      }}>
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--sogang-red)', marginBottom: 12,
          }}>
            <img src="/assets/stream-mascot.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--sogang-red)', letterSpacing: '-0.01em' }}>
            STREAM
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            서강대학교 교내 근로 통합 관리 시스템
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 5 }}>학번</label>
            <input
              className="stream-input"
              type="text"
              placeholder="학번을 입력하세요"
              value={id}
              onChange={e => { setId(e.target.value); setError('') }}
              style={{
                width: '100%', height: 42, padding: '0 14px',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-strong)',
                background: 'var(--neutral-0)', boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 5 }}>비밀번호</label>
            <input
              className="stream-input"
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={pw}
              onChange={e => { setPw(e.target.value); setError('') }}
              style={{
                width: '100%', height: 42, padding: '0 14px',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-strong)',
                background: 'var(--neutral-0)', boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)', padding: '8px 12px', background: 'var(--danger-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger-100)' }}>
              {error}
            </p>
          )}
          <Button type="submit" block style={{ marginTop: 6, height: 44, fontSize: 15 }}>
            로그인
          </Button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-subtle)' }}>
          SAINT 계정으로 로그인합니다. 계정 문의: 학사지원팀 02-705-8000
        </p>
      </div>
    </div>
  )
}
