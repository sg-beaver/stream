// [디자인 시스템 예외] 이 화면은 STREAM UI가 아니라 서강대 SAINT 포털 화면을 그대로 재현한 것이다.
// 색상은 실제 포털에서 추출한 값이므로 STREAM 토큰(--neutral-*, --text-* 등)으로 치환하지 않는다.
// STREAM 디자인 시스템 적용 대상은 SAINT 껍데기 안쪽의 STREAM 화면(좌측 STREAM 메뉴 이하)이다.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Plus, FileText, ClipboardList, MessageCircle, UserCog, CalendarCheck,
  Mail, Cloud, FileEdit, LayoutGrid, Sparkles,
  Library, Monitor, Briefcase, Users, HandHeart, HeartHandshake, PenTool, Rocket,
  BookOpen, School, ShieldCheck, FileCheck, Database,
  Calendar, Bell, Building2,
} from 'lucide-react'
import SaintHeader from '../components/layout/SaintHeader'
import IdPhoto from '../components/ui/IdPhoto'
import { getSessionUser } from '../utils/session'

// 학점 등 SAINT 학적 항목은 데모 단계라 mock으로 채운다 — 학과(major)는 로그인 응답의 실제 학생 데이터를 쓴다
const MOCK_PROFILE = {
  '20220042': { totalCredit: 126, earnedCredit: 117, recentCredit: 3 },
  '20210011': { totalCredit: 130, earnedCredit: 96, recentCredit: 6 },
  staff01:    { department: '학생지원팀', totalCredit: null, earnedCredit: null, recentCredit: null },
}

const SCHEDULE_NOTICES = [
  { title: '계절수업성적 제출 마감', dept: '학사일정', period: '2026.07.21' },
]

const BOARD_TABS = ['일반공지', '학사공지', '종합봉사실 공지']
const BOARD_NOTICES = [
  { id: 1, title: '★ 교직원 사칭 사기 범죄 주의 안내', date: '2026.05.11' },
  { id: 2, title: '[국제지역문화원] 2026-1 인문고전 아카데미 <구당서> 원문 강독 프로그램 신청 안내(~05/11)', date: '2026.05.06' },
  { id: 3, title: '[교수학습센터] 서강학개론 온라인 숏강의 참여 및 추천 이벤트(~5/10)', date: '2026.04.30' },
  { id: 4, title: '[입학처] 2026년 Open Campus 전공체험 프로그램 멘토단 모집 (~5/8)', date: '2026.04.28' },
  { id: 5, title: '[국제교류팀] 2026 국제하계대학 문화체험 프로그램 버디 모집(~5/4)', date: '2026.04.28' },
  { id: 6, title: '[보건실] 교내 사랑의 헌혈 캠페인 안내 (4/28)', date: '2026.04.27' },
]

const QUICK_MENU = [
  { label: '증명서발급', icon: FileText },
  { label: 'FA과목별현황', icon: ClipboardList },
  { label: '상담신청', icon: MessageCircle },
  { label: '신상정보변경', icon: UserCog },
  { label: '시설물예약', icon: CalendarCheck },
]

const IT_SERVICES = [
  { label: 'E-Mail', icon: Mail },
  { label: '캠퍼스클라우드', icon: Cloud },
  { label: '온라인신청', icon: FileEdit },
  { label: 'MS/Google', icon: LayoutGrid },
  { label: 'GPT/Gemini', icon: Sparkles },
]

const SAINT_SERVICES = [
  { label: '로욜라도서관', icon: Library },
  { label: '사이버캠퍼스', icon: Monitor },
  { label: '비교과통합관리', icon: ClipboardList },
  { label: '취업정보', icon: Briefcase },
  { label: 'CU12', icon: Users },
  { label: 'HUSS 사회구조사업단', icon: HandHeart },
  { label: 'HUSS 포용사회사업단', icon: HeartHandshake },
  { label: '글쓰기센터', icon: PenTool },
  { label: '청년광장', icon: Rocket },
  { label: '학습경험플랫폼', icon: BookOpen },
  { label: '폴리캠퍼스', icon: School },
  { label: 'Copykiller', icon: ShieldCheck },
  { label: '입영통지서확인', icon: FileCheck },
  { label: 'RIMS', icon: Database },
]

function notReady(e) {
  e?.preventDefault?.()
  alert('데모에서는 지원하지 않는 기능입니다.')
}

function todayDateTime() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function SaintHomePage() {
  const navigate = useNavigate()
  const user = getSessionUser()

  // 로그인하지 않은 상태로 접근하면 로그인 화면으로 보낸다
  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  if (!user) return null

  // 학생은 로그인 응답의 실제 학과, 직원은 mock의 소속 부서
  const profile = { ...(MOCK_PROFILE[user.id] || {}), ...(user.major ? { department: user.major } : {}) }

  return (
    // html/body가 overflow:hidden이므로 이 래퍼가 스크롤을 담당
    <div style={{ height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#FFFFFF', fontFamily: 'var(--font-sans)' }}>
      <SaintHeader activeTab="학생정보" />

      <main style={{ flex: 1, padding: '20px 28px 40px', boxSizing: 'border-box' }}>
        {/* 1행: 내 정보(35%) / 일정 알림(65%) — 실제 SAINT .main_content.schedule_alert 비율 기준 */}
        <div style={topRowGrid}>
          <div style={card}>
            <div style={cardTitleRow}>
              <span style={cardTitle}><User size={15} color="var(--saint-red)" style={{ marginRight: 6 }} />내 정보</span>
              <a href="#" onClick={notReady} style={smallLink}>변경</a>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <IdPhoto studentId={user.role === 'student' ? user.id : null} width={72} style={avatarBox} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#222' }}>
                  {user.name} <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}>({user.id})</span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{profile.department || '-'}</div>
                <div style={{ borderTop: '1px solid #eee', marginTop: 12, paddingTop: 10, fontSize: 11, color: '#999', lineHeight: 1.8 }}>
                  <div>최종 로그인</div>
                  <div>일시&nbsp;&nbsp;{todayDateTime()}</div>
                  <div>IP&nbsp;&nbsp;&nbsp;&nbsp;127.0.0.1</div>
                </div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={cardTitleRow}>
              <span style={cardTitle}><Calendar size={15} color="var(--saint-red)" style={{ marginRight: 6 }} />일정 알림</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['일정', '부서', '기간'].map((h, i) => (
                    <th key={h} style={{ ...tableHeadCell, textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCHEDULE_NOTICES.map(n => (
                  <tr key={n.title}>
                    <td style={tableCell}>{n.title}</td>
                    <td style={{ ...tableCell, textAlign: 'center', color: '#888' }}>{n.dept}</td>
                    <td style={{ ...tableCell, textAlign: 'center', color: '#888' }}>{n.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2행: 알림 정보 / 게시판 */}
        <div style={{ ...rowGrid, marginTop: 16 }}>
          <div style={card}>
            <div style={cardTitleRow}>
              <span style={cardTitle}><Bell size={15} color="var(--saint-red)" style={{ marginRight: 6 }} />알림 정보</span>
            </div>

            <div style={{ display: 'flex' }}>
              {[
                { label: '서강웹메일', value: 249 },
                { label: '사이버 캠퍼스', value: 19 },
                { label: '비교과프로그램', value: 0 },
                { label: '법정의무교육', value: 0 },
              ].map(s => (
                <button key={s.label} type="button" onClick={notReady} style={statCol}>
                  <div style={{ fontSize: 12, color: '#666' }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.value ? 'var(--saint-red)' : '#B6B6B6', marginTop: 6 }}>{s.value}</div>
                </button>
              ))}
            </div>

            {profile.totalCredit != null && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 16, borderTop: '1px solid #eee' }}>
                <div style={{ display: 'flex', gap: 32 }}>
                  <StatColumn label="취득학점" value={profile.earnedCredit} suffix={profile.recentCredit ? `(+${profile.recentCredit})` : null} />
                  <StatColumn label="전체학점" value={profile.totalCredit} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <SquareTile icon={FileCheck} label="과목이수표" />
                  <SquareTile icon={Building2} label="과목이수시뮬레이션" />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 16, borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>도서관</div>
              <div style={{ display: 'flex', gap: 28 }}>
                <StatColumn label="대출중" value={0} muted />
                <StatColumn label="연체중" value={0} muted />
                <StatColumn label="예약중" value={0} muted />
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={cardTitleRow}>
              <span style={cardTitle}><ClipboardList size={15} color="var(--saint-red)" style={{ marginRight: 6 }} />게시판</span>
              <button type="button" onClick={notReady} style={iconBtn}><Plus size={15} /></button>
            </div>
            <div style={{ display: 'flex' }}>
              {BOARD_TABS.map((t, i) => (
                <button key={t} type="button" onClick={notReady} style={boardTab(i === 0)}>{t}</button>
              ))}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0 0' }}>
              {BOARD_NOTICES.map(n => (
                <li key={n.id} style={boardLi}>
                  <a href="#" onClick={notReady} title={n.title} style={boardA}>{n.title}</a>
                  <span style={{ fontSize: 11, color: '#999', flexShrink: 0, marginLeft: 8 }}>{n.date}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 메뉴 바로가기 */}
        <QuickLinkSection title="메뉴 바로가기" items={QUICK_MENU} />
        {/* IT서비스 바로가기 */}
        <QuickLinkSection title="IT서비스 바로가기" items={IT_SERVICES} />
        {/* SAINT 연계서비스 */}
        <QuickLinkSection title="SAINT 연계서비스" items={SAINT_SERVICES} cols={7} />
      </main>
    </div>
  )
}

function QuickLinkSection({ title, items, cols = 5 }) {
  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={cardTitleRow}>
        <span style={cardTitle}>{title}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
        {items.map(item => (
          <button key={item.label} type="button" onClick={notReady} style={tileBtn}>
            <item.icon size={28} color="#888" strokeWidth={1.5} />
            <span style={{ fontSize: 12, color: '#555', marginTop: 8, textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// 취득학점/전체학점/도서관 대출·연체·예약 — 라벨 위, 숫자 아래인 컬럼형 통계
function StatColumn({ label, value, suffix, muted }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: muted ? '#888' : 'var(--saint-red)', marginTop: 4 }}>
        {value}{suffix && <span style={{ fontSize: 11, fontWeight: 400, color: '#888', marginLeft: 3 }}>{suffix}</span>}
      </div>
    </div>
  )
}

// 과목이수표/과목이수시뮬레이션 — 아이콘 위, 라벨 아래인 정사각형 타일 버튼
function SquareTile({ icon: Icon, label }) {
  return (
    <button type="button" onClick={notReady} style={squareTile}>
      <Icon size={20} color="#888" strokeWidth={1.5} />
      <span style={{ fontSize: 10, color: '#666', marginTop: 4, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
    </button>
  )
}

// 실제 SAINT .main_content 실측값: border-radius 15px, border 1px solid #d9d9d9, padding 25px
const card = {
  background: '#fff',
  border: '1px solid #d9d9d9',
  borderRadius: 15,
  padding: 25,
  boxSizing: 'border-box',
}

// 1행: 내 정보 35% / 일정 알림 65% (.main_content.schedule_alert: width calc(65% - 30px) 기준)
const topRowGrid = { display: 'grid', gridTemplateColumns: '35fr 65fr', gap: 16 }
const rowGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

const cardTitleRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  paddingBottom: 14,
  marginBottom: 14,
  borderBottom: '1px solid #EEE',
}

const cardTitle = {
  fontSize: 16, fontWeight: 700, color: '#222', fontFamily: 'var(--font-sans)', letterSpacing: '-0.2px',
  display: 'flex', alignItems: 'center',
}

const smallLink = { fontSize: 12, color: '#888', textDecoration: 'none' }

const iconBtn = {
  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#F5F5F5', border: 'none', borderRadius: 4, color: '#888', cursor: 'pointer',
}

// 크기는 IdPhoto가 증명사진 3:4로 계산한다 — 여기서 width/height를 주면 비율이 깨진다
const avatarBox = {
  borderRadius: 4,
  background: '#F2F2F2', border: '1px solid #E5E5E5',
}

const tableHeadCell = {
  background: '#F7F7F7', color: '#666', fontWeight: 600,
  padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #E5E5E5',
}

const tableCell = {
  padding: '10px 12px', borderBottom: '1px solid #F0F0F0', color: '#333',
}

const statCol = {
  flex: 1, minWidth: 0, textAlign: 'center', padding: '4px 0',
  background: 'none', border: 'none', cursor: 'pointer',
}

const squareTile = {
  width: 64, height: 64, flexShrink: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 8, cursor: 'pointer',
}

const boardLi = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '7px 0', borderBottom: '1px solid #F5F5F5', fontSize: 12,
}

const boardA = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  color: '#444', textDecoration: 'none', flex: 1, minWidth: 0,
}

function boardTab(active) {
  return {
    padding: '6px 12px', fontSize: 12, fontWeight: active ? 700 : 400,
    color: active ? '#fff' : '#666',
    background: active ? 'var(--saint-red)' : '#F5F5F5',
    border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer', marginRight: 2,
  }
}

const tileBtn = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '20px 4px', minHeight: 92, background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 8, cursor: 'pointer',
}
