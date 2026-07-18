import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Headphones } from 'lucide-react'
import { setSessionUser } from '../utils/session'
import { login } from '../api/client'

// 탭 없이 ID 형식만으로 role을 추론한다 (숫자만 = 학번 = student, 그 외 = 사번 = staff)
function inferRole(id) {
  return /^\d+$/.test(id) ? 'student' : 'staff'
}

const NOTICES = [
  { id: 1, title: '★ 교직원 사칭 사기 범죄 주의 안내', date: '2026.05.11' },
  { id: 2, title: '[국제지역문화원] 2026-1 인문고전 아카데미 <구당서> 원문 강독 프로그램 신청 안내(~05/11)', date: '2026.05.06' },
  { id: 3, title: '[교수학습센터] 서강학개론 온라인 숏강의 참여 및 추천 이벤트(~5/10)', date: '2026.04.30' },
  { id: 4, title: '[입학처] 2026년 Open Campus 전공체험 프로그램 멘토단 모집 (~5/8)', date: '2026.04.28' },
  { id: 5, title: '[국제교류팀] 2026 국제하계대학 문화체험 프로그램 버디 모집(~5/4)', date: '2026.04.28' },
]

const INFO_LINKS = ['학번 안내\n(2000년 이전)', '2차인증 안내', '팝업차단 안내']

const LOGIN_BTN_ITEMS = [
  { label: 'ID 찾기', sub: 'Search ID', icon: '/assets/login/icon-search.png' },
  { label: 'Password 찾기', sub: 'Search PW', icon: '/assets/login/icon-search.png' },
  { label: 'ID 잠금해제', sub: 'Unlock ID', icon: '/assets/login/icon-lock.png' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saveId, setSaveId] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function checkCaps(e) {
    setCapsOn(Boolean(e.getModifierState && e.getModifierState('CapsLock')))
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!id || !pw) { setError('아이디와 비밀번호를 입력해주세요.'); return }
    setLoading(true)
    try {
      // POST /api/auth/login — 응답: { token, role, name }
      const role = inferRole(id)
      const res = await login(id, pw, role)
      setSessionUser({ id, name: res.name, role: res.role, token: res.token })
      navigate('/posts')
    } catch (err) {
      setError(err.status === 401
        ? '아이디 또는 비밀번호가 올바르지 않습니다.\n학번(사번)과 비밀번호를 확인해주세요.'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  function notReady(e) {
    e.preventDefault()
    alert('데모에서는 지원하지 않는 기능입니다.')
  }

  return (
    <div style={pageWrap}>
      <div style={bgLayer} />
      <div style={container}>
        <div style={article}>

          {/* 로고 박스 */}
          <div style={loginBox}>
            <div style={{ padding: '5px 20px' }}>
              <img src="/assets/login/saint-login-logo.png" alt="서강대학교 SAINT" style={{ height: 63, width: 'auto', display: 'block' }} />
            </div>
          </div>

          {/* 로그인 폼 박스 */}
          <div style={{ ...loginBox, display: 'flex' }}>
            <div style={imageBox}>
              <img
                src="/assets/stream-mascot.png"
                alt=""
                style={{ width: 96, height: 'auto', objectFit: 'contain', marginBottom: 12, opacity: 0.85 }}
                onError={e => { e.target.style.display = 'none' }}
              />
              <div style={{ fontSize: 22, fontWeight: 600, color: '#9a9a9a', letterSpacing: '0.02em' }}>STREAM</div>
              <div style={{ fontSize: 13, color: '#b5b5b5', marginTop: 6 }}>이미지 준비 중</div>
            </div>

            <div style={{ width: 580, flexShrink: 0 }}>
              <div style={{ padding: '0 47px' }}>
                <div style={formTitle}>MEMBER LOGIN</div>

                <form onSubmit={handleLogin} style={formCtn}>
                  <div style={formInputCol}>
                    <div style={formItem}>
                      <input
                        type="text"
                        placeholder="ID(학번/사번)"
                        value={id}
                        onChange={e => { setId(e.target.value); setError('') }}
                        style={textInput}
                      />
                    </div>

                    <div style={{ ...formItem, position: 'relative' }}>
                      {capsOn && (
                        <div style={capsTooltip}>
                          대문자고정키가 눌려있습니다.<br />(CapsLock is on)
                        </div>
                      )}
                      <input
                        type={showPw ? 'text' : 'password'}
                        placeholder="Password"
                        value={pw}
                        onChange={e => { setPw(e.target.value); setError('') }}
                        onKeyDown={checkCaps}
                        onKeyUp={checkCaps}
                        style={{ ...textInput, paddingRight: 44 }}
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)} style={pwToggle}>
                        {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    <div style={{ ...formItem, alignItems: 'center' }}>
                      <input
                        id="id_save"
                        type="checkbox"
                        checked={saveId}
                        onChange={e => setSaveId(e.target.checked)}
                        style={{ accentColor: 'var(--saint-red)', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <label htmlFor="id_save" style={{ color: '#686868', marginLeft: 6, fontSize: 14, cursor: 'pointer' }}>아이디 저장</label>
                    </div>

                    {error && <p style={errorText}>{error}</p>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{ ...loginBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer' }}
                      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#c4201f' }}
                      onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--saint-red)' }}
                    >
                      {loading ? '로그인 중...' : 'LOGIN'}
                    </button>
                  </div>
                </form>
              </div>

              <div style={loginBtns}>
                {LOGIN_BTN_ITEMS.map((item, i) => (
                  <div key={item.label} style={{ display: 'flex', flex: 1 }}>
                    {i > 0 && <span style={btnDivider} />}
                    <button
                      type="button"
                      onClick={notReady}
                      style={loginBtnItem}
                      onMouseEnter={e => {
                        e.currentTarget.querySelector('strong').style.color = 'var(--saint-red)'
                        e.currentTarget.querySelector('span').style.color = '#aa6e70'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.querySelector('strong').style.color = '#272727'
                        e.currentTarget.querySelector('span').style.color = '#a7a7a7'
                      }}
                    >
                      <img src={item.icon} alt="" style={{ width: 20, height: 23 }} />
                      <strong style={loginBtnStrong}>{item.label}</strong>
                      <span style={loginBtnSpan}>{item.sub}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 공지/안내 + 푸터 박스 */}
          <div style={{ ...loginBox, flexDirection: 'column' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ ...ctnBox, paddingLeft: 40 }}>
                <div style={ctnTitle}>
                  <strong>공지사항</strong>
                  <a
                    href="https://www.sogang.ac.kr/ko/story/notification-general"
                    target="_blank" rel="noreferrer"
                    style={moreLink}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--saint-red)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#a7a7a7' }}
                  >
                    More
                  </a>
                </div>
                <div style={{ paddingTop: 25 }}>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {NOTICES.map(n => (
                      <li key={n.id} style={noticeLi}>
                        <a
                          href="#" onClick={notReady} title={n.title} style={noticeA}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--saint-red)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#686868' }}
                        >
                          {n.title}
                        </a>
                        <span style={{ flex: '0 0 100px', textAlign: 'right', color: '#8f8f8f' }}>{n.date}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={ctnBox}>
                <div style={ctnTitle}>
                  <strong>안내사항</strong>
                </div>
                <div style={infoLinksWrap}>
                  {INFO_LINKS.map(label => (
                    <a
                      key={label} href="#" onClick={notReady} style={infoLinkItem}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--saint-red)'; e.currentTarget.style.background = '#f1f1f1' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#686868'; e.currentTarget.style.background = '#eeeeee' }}
                    >
                      <span style={{ whiteSpace: 'pre-line' }}>{label}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div style={footer}>
              <div style={{ fontSize: 15, color: '#888' }}>COPYRIGHT (C) SOGANG UNIVERSITY. ALL RIGHTS RESERVED.</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <a
                  href="https://pc119.sogang.ac.kr/" target="_blank" rel="noreferrer" style={footerBtnBox}
                  onMouseEnter={e => { e.currentTarget.style.background = '#efefef' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#eee' }}
                >
                  <Headphones size={14} />
                  <span style={{ marginLeft: 5 }}>원격지원</span>
                </a>
                <a
                  href="#" onClick={notReady} style={footerBtn}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--saint-red)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#686868' }}
                >
                  개인정보처리방침
                </a>
                <a
                  href="https://www.sogang.ac.kr/ko/campus/administrative-support/report-inconvenience" target="_blank" rel="noreferrer" style={footerBtn}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--saint-red)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#686868' }}
                >
                  이용불편신고
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// html/body가 overflow:hidden이므로 낮은 뷰포트에서는 이 래퍼가 스크롤을 담당
const pageWrap = {
  position: 'relative',
  height: '100vh',
  overflowY: 'auto',
  fontFamily: "'Pretendard', var(--font-sans)",
  color: '#131313',
}

const bgLayer = {
  position: 'fixed',
  inset: 0,
  zIndex: -1,
  background: '#dddddd',
}

const container = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px 0 50px 0',
  minHeight: '100%',
  boxSizing: 'border-box',
}

// 실제 SAINT 사이트는 이 영역 전체를 zoom:0.8로 축소해서 배치한다
const article = {
  maxWidth: 1280,
  zoom: 0.8,
}

const loginBox = {
  borderRadius: 15,
  background: '#fff',
  boxShadow: '0 0 10px rgba(0,0,0,0.08)',
  marginTop: 25,
}

const imageBox = {
  width: 700,
  height: 495,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f0f0f0',
  borderRadius: '15px 0 0 15px',
}

const formTitle = {
  padding: '70px 0 35px 0',
  fontSize: 24,
  fontWeight: 600,
  color: '#484848',
}

const formCtn = {
  display: 'flex',
  justifyContent: 'space-between',
}

const formInputCol = {
  display: 'flex',
  flexDirection: 'column',
  gap: 15,
}

const formItem = {
  display: 'flex',
}

const textInput = {
  width: 305,
  height: 65,
  border: '2px solid #f0f0f0',
  borderRadius: 10,
  padding: '0 20px',
  fontFamily: "'Pretendard', sans-serif",
  fontWeight: 500,
  fontSize: 20,
  color: '#333',
  boxSizing: 'border-box',
  outline: 'none',
}

const pwToggle = {
  position: 'absolute',
  right: 16,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#999',
  display: 'flex',
  padding: 0,
}

const capsTooltip = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: 8,
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  padding: '8px 12px',
  fontSize: 12,
  color: '#555',
  lineHeight: 1.5,
  zIndex: 5,
  whiteSpace: 'nowrap',
}

const errorText = {
  margin: 0,
  fontSize: 12,
  color: 'var(--saint-red)',
  background: '#fff5f5',
  border: '1px solid #f3caca',
  borderRadius: 6,
  padding: '8px 12px',
  whiteSpace: 'pre-line',
  lineHeight: 1.5,
}

const loginBtn = {
  width: 165,
  height: 145,
  border: 0,
  background: 'var(--saint-red)',
  color: '#fff',
  fontFamily: "'Pretendard', sans-serif",
  fontWeight: 500,
  fontSize: 24,
  textAlign: 'center',
  borderRadius: 10,
  cursor: 'pointer',
  transition: 'background 0.15s',
}

const loginBtns = {
  display: 'flex',
  padding: '0 47px',
  marginTop: 40,
}

const loginBtnItem = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '7px 0',
}

const btnDivider = {
  width: 1,
  height: 40,
  alignSelf: 'center',
  background: '#e5e5e5',
}

const loginBtnStrong = {
  fontSize: 17,
  color: '#272727',
  padding: '10px 0 5px 0',
  fontWeight: 700,
}

const loginBtnSpan = {
  fontSize: 14,
  color: '#a7a7a7',
}

const ctnBox = {
  padding: '50px 40px 30px 0',
  flex: 1,
  boxSizing: 'border-box',
}

const ctnTitle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 20,
  fontWeight: 500,
}

const moreLink = {
  fontSize: 13,
  color: '#a7a7a7',
  textDecoration: 'none',
}

const noticeLi = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 18,
  fontWeight: 400,
  color: '#8f8f8f',
  lineHeight: '36px',
  gap: 16,
}

const noticeA = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  color: '#686868',
  flex: 1,
  minWidth: 0,
}

const infoLinksWrap = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1rem',
  marginTop: 25,
}

const infoLinkItem = {
  fontSize: 18,
  background: '#eeeeee',
  color: '#686868',
  width: 'calc(50% - .5rem)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  height: 77,
  borderRadius: 10,
  textDecoration: 'none',
  boxSizing: 'border-box',
  lineHeight: 1.4,
}

const footer = {
  background: '#fafafa',
  borderRadius: '0 0 15px 15px',
  padding: '15px 40px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const footerBtn = {
  textDecoration: 'none',
  color: '#686868',
  marginLeft: 20,
  fontSize: 13,
}

const footerBtnBox = {
  ...footerBtn,
  marginLeft: 0,
  padding: '5px 10px',
  background: '#eee',
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
}
