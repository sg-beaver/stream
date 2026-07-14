import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { setSessionUser } from '../utils/session'

const MOCK_ACCOUNTS = {
  '20220042': { password: '1234', name: '안희진', role: 'student', major: '경영학과', phone: '010-1234-5678', email: 'heejin@sogang.ac.kr' },
  '20210011': { password: '1234', name: '김민준', role: 'student', major: '컴퓨터공학과', phone: '010-9876-5432', email: 'minjun@sogang.ac.kr' },
  'staff01':  { password: '1234', name: '이담당', role: 'staff', dept: '학생지원팀' },
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saveId, setSaveId] = useState(false)
  const [error, setError] = useState('')
  const [roleTab, setRoleTab] = useState('student')

  function handleLogin(e) {
    e.preventDefault()
    const account = MOCK_ACCOUNTS[id]
    if (!id || !pw) { setError('아이디와 비밀번호를 입력해주세요.'); return }
    if (!account || account.password !== pw) { setError('아이디 또는 비밀번호가 올바르지 않습니다.\n학번(사번)과 비밀번호를 확인해주세요.'); return }
    if (roleTab === 'staff' && account.role !== 'staff') { setError('교직원 계정이 아닙니다.'); return }
    if (roleTab === 'student' && account.role !== 'student') { setError('학생 계정이 아닙니다.'); return }
    // 비밀번호는 세션에 저장하지 않는다
    const { password: _password, ...safeUser } = account
    setSessionUser({ ...safeUser, id })
    navigate('/posts')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--saint-page-bg)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column' }}>

      {/* SAINT 헤더 */}
      <header style={{ background: '#fff', borderBottom: '2px solid #CCCCCC', padding: '0 24px', display: 'flex', alignItems: 'center', height: 52, flexShrink: 0 }}>
        <img src="/assets/sogang-logo.png" alt="서강대학교" style={{ height: 36, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />
        <span style={{ marginLeft: 16, fontSize: 12, color: '#999', letterSpacing: '0.05em' }}>SAINT</span>
        <span style={{ marginLeft: 4, fontSize: 10, color: '#bbb' }}>Sogang Advanced Information Network and Technology</span>
      </header>

      {/* 메인 로그인 영역 */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{
          width: '100%', maxWidth: 860,
          background: '#fff', borderRadius: 8,
          boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
          overflow: 'hidden', display: 'flex',
          border: '1px solid #E0E0E0',
        }}>
          {/* 왼쪽 비주얼 패널 */}
          <div style={{
            flex: 1, minHeight: 420,
            background: 'linear-gradient(135deg, #1a3a6b 0%, #2d5a9e 50%, #1a3a6b 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 32, position: 'relative', overflow: 'hidden',
          }}>
            <img
              src="/assets/stream-mascot.png"
              alt=""
              style={{ width: 100, height: 100, objectFit: 'contain', marginBottom: 20, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}
              onError={e => { e.target.style.display = 'none' }}
            />
            <div style={{ fontFamily: 'var(--font-saint)', fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', marginBottom: 8 }}>STREAM</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 1.8, letterSpacing: '-0.2px' }}>
              서강대학교 교내 근로<br />통합 관리 시스템
            </div>
          </div>

          {/* 오른쪽 로그인 패널 */}
          <div style={{ width: 340, padding: '40px 36px', flexShrink: 0 }}>
            {/* 로그인 구분 탭 */}
            <div style={{ display: 'flex', marginBottom: 28, borderBottom: '2px solid #E0E0E0' }}>
              {[{ key: 'student', label: '학생' }, { key: 'staff', label: '교직원' }].map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setRoleTab(t.key); setError('') }}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', background: 'none',
                    fontFamily: 'var(--font-sans)', fontSize: 13,
                    fontWeight: roleTab === t.key ? 700 : 400,
                    color: roleTab === t.key ? 'var(--saint-red)' : '#888',
                    borderBottom: roleTab === t.key ? '2px solid var(--saint-red)' : '2px solid transparent',
                    cursor: 'pointer', marginBottom: -2, letterSpacing: '-0.2px',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 20, letterSpacing: '-0.3px', fontFamily: 'var(--font-saint)' }}>
              MEMBER LOGIN
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder={roleTab === 'student' ? '학번' : '사번'}
                value={id}
                onChange={e => { setId(e.target.value); setError('') }}
                style={inputStyle}
              />
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="비밀번호"
                  value={pw}
                  onChange={e => { setPw(e.target.value); setError('') }}
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#999', display: 'flex', padding: 0 }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && (
                <p style={{ margin: 0, fontSize: 11, color: '#c00', background: '#fff5f5', border: '1px solid #fcc', borderRadius: 3, padding: '7px 10px', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                  {error}
                </p>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', cursor: 'pointer', marginTop: 2 }}>
                <input type="checkbox" checked={saveId} onChange={e => setSaveId(e.target.checked)} style={{ accentColor: 'var(--saint-red)', width: 13, height: 13 }} />
                아이디 저장
              </label>

              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="submit" style={{
                  flex: 1, height: 48,
                  background: 'var(--saint-red)', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  fontFamily: 'var(--font-saint)', fontSize: 15, fontWeight: 700,
                  letterSpacing: '0.05em',
                }}>
                  LOGIN
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
              {[{ icon: '🔍', label: 'ID 찾기', sub: 'Search ID' }, { icon: '🔍', label: 'Password 찾기', sub: 'Search PW' }, { icon: '🔓', label: 'ID 잠금해제', sub: 'Unlock ID' }].map(item => (
                <button key={item.label} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center', padding: 0 }}>
                  <div style={{ fontSize: 18, marginBottom: 3 }}>{item.icon}</div>
                  <div style={{ fontSize: 10, color: 'var(--saint-red)', fontWeight: 600, letterSpacing: '-0.2px' }}>{item.label}</div>
                  <div style={{ fontSize: 9, color: '#aaa', letterSpacing: '0.02em' }}>{item.sub}</div>
                </button>
              ))}
            </div>

            {/* 테스트 계정 안내 */}
            <div style={{ marginTop: 20, padding: '10px 12px', background: '#f8f8f8', borderRadius: 4, fontSize: 10, color: '#888', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: '#555', marginBottom: 2 }}>테스트 계정</div>
              <div>학생: <strong>20220042</strong> / 1234</div>
              <div>학생2: <strong>20210011</strong> / 1234</div>
              <div>교직원: <strong>staff01</strong> / 1234</div>
            </div>
          </div>
        </div>
      </div>

      <footer style={{ textAlign: 'center', padding: '12px 0', fontSize: 10, color: '#aaa', letterSpacing: '-0.1px' }}>
        COPYRIGHT (C) SOGANG UNIVERSITY. ALL RIGHTS RESERVED.
      </footer>
    </div>
  )
}

const inputStyle = {
  width: '100%', height: 44, padding: '0 12px',
  background: '#EEF1F8', border: '1px solid #DDE2EE',
  borderRadius: 4, fontFamily: 'var(--font-sans)',
  fontSize: 13, color: '#333', outline: 'none',
  letterSpacing: '-0.2px', boxSizing: 'border-box',
}
