import { useState } from 'react'
import { ChevronLeft, CircleCheck, CircleDashed, CalendarCheck2 } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import StatusPill from '../../components/ui/StatusPill'
import TimeGrid from '../../components/ui/TimeGrid'
import { AdminPanel } from '../../components/admin/AdminPanel'
import { adminStatusSlug } from '../../utils/adminStatus'
import { adminPosts, applicants as initialApplicants } from '../../data/adminMockData'

// 필수/우대 조건 문구와 지원자가 실제로 입력한 데이터를 대조 — 점수화하지 않고, 키워드가 확인되면
// 초록 체크만 표시. 안 보인다고 해서 "불충족"으로 단정하지 않고 "확인 필요"로만 안내함
const CONDITION_KEYWORD_THEMES = [
  ['엑셀', '컴퓨터활용', '전산', '문서 작성', '문서작성', '한글', '문서 정리', '자료 정리'],
  ['민원', '응대'],
  ['영어', '중국어', '외국어', '회화', 'TOEIC', 'OPIc', 'JLPT'],
  ['사진', '영상', '촬영', '편집', 'SNS'],
  ['행정', '행정지원', '행정업무'],
]

function buildApplicantPool(a) {
  return [
    a.major, a.grade,
    ...(a.careers || []).flatMap(c => [c.type, c.org, c.role, c.detail]),
    ...(a.languages || []).map(l => l.test),
    ...(a.certificates || []).map(c => c.name),
    a.motivation, a.selfIntro,
  ].filter(Boolean).join(' ')
}

function matchCondition(conditionText, pool) {
  if (/재학생|휴학생\s*불가/.test(conditionText)) return { ok: true, reason: '재학 중 (SAINT 연동)' }
  for (const theme of CONDITION_KEYWORD_THEMES) {
    const condHit = theme.find(k => conditionText.includes(k))
    if (!condHit) continue
    const poolHit = theme.find(k => pool.includes(k))
    if (poolHit) return { ok: true, reason: `지원서에서 "${poolHit}" 확인됨` }
  }
  return { ok: false, reason: null }
}

function workTimeMatch(applicant, post) {
  const required = (post && post.workSlots) || []
  const available = applicant.availableSlots || []
  const matched = required.filter(s => available.includes(s))
  return { matched, total: required.length }
}

// 담당자는 하나의 부서 소속이므로, 그 부서가 등록한 공고의 지원자만 다룸 — 지금은 STF001 = 학생지원팀 고정
const MY_DEPT = '학생지원팀'

export default function AdminSelectionPage() {
  const [applicants, setApplicants] = useState(initialApplicants)
  const [tab, setTab] = useState('all')
  const [postId, setPostId] = useState('all')
  const [detailId, setDetailId] = useState(null)

  const myDeptPosts = adminPosts.filter(p => p.dept === MY_DEPT)
  const myDeptPostIds = myDeptPosts.map(p => p.id)
  const postById = Object.fromEntries(myDeptPosts.map(p => [p.id, p]))
  const myApplicants = applicants.filter(a => myDeptPostIds.includes(a.postId))

  const decide = (id, status) => setApplicants(as => as.map(a => a.id === id ? { ...a, status } : a))

  if (detailId) {
    const a = applicants.find(x => x.id === detailId)
    return (
      <AdminShell activeMenu="selection">
        <ApplicantDetail applicant={a} post={postById[a.postId]} onBack={() => setDetailId(null)} onDecide={status => decide(detailId, status)} />
      </AdminShell>
    )
  }

  const tabs = [
    { id: 'all', label: '전체' }, { id: '검토중', label: '검토중' }, { id: '보류', label: '보류' },
    { id: '선발', label: '선발' }, { id: '탈락', label: '탈락' },
  ]
  const postScoped = postId === 'all' ? myApplicants : myApplicants.filter(a => a.postId === postId)
  const shown = tab === 'all' ? postScoped : postScoped.filter(a => a.status === tab)
  const count = id => id === 'all' ? postScoped.length : postScoped.filter(a => a.status === id).length

  return (
    <AdminShell activeMenu="selection">
      <PageTitle>학생 선발</PageTitle>
      <p style={{ margin: '-12px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
        {MY_DEPT} 담당 공고 전체 ({myDeptPosts.length}건 · 지원 {myApplicants.length}명) · 지원자 목록을 확인하고 상세보기에서 지원서를 검토해 선발 여부를 결정합니다.
      </p>

      {myDeptPosts.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setPostId('all')} style={filterChip(postId === 'all')}>전체 공고 <span style={{ fontSize: 11 }}>({myApplicants.length})</span></button>
          {myDeptPosts.map(p => {
            const n = myApplicants.filter(a => a.postId === p.id).length
            return <button key={p.id} onClick={() => setPostId(p.id)} style={filterChip(postId === p.id)}>{p.title} <span style={{ fontSize: 11 }}>({n})</span></button>
          })}
        </div>
      )}

      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          {tabs.map(t => {
            const on = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: 'none',
                borderBottom: '2px solid ' + (on ? 'var(--sogang-red)' : 'transparent'), background: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? 'var(--sogang-red)' : 'var(--text-muted)',
              }}>
                {t.label} <span style={{ fontSize: 11, fontWeight: 700, color: on ? 'var(--sogang-red)' : 'var(--text-subtle)', background: on ? 'var(--sogang-red-50)' : 'var(--neutral-100)', padding: '1px 7px', borderRadius: 10 }}>{count(t.id)}</span>
              </button>
            )
          })}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--saint-tan)' }}>
              {th('지원자')}{th('지원 공고')}{th('학과 / 학년')}{th('필수조건', 'center', 110)}{th('근무시간', 'center', 110)}{th('지원일', 'center', 100)}{th('상태', 'center', 90)}{th('', 'center', 100)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>해당 조건의 지원자가 없습니다.</td></tr>
            ) : shown.map(a => {
              const post = postById[a.postId]
              const pool = buildApplicantPool(a)
              const reqResults = post ? (post.qualifications || []).map(c => matchCondition(c, pool)) : []
              const reqOkCount = reqResults.filter(r => r.ok).length
              const { matched, total } = workTimeMatch(a, post)
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{a.sid}</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13 }}>{post ? post.title : '-'}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13 }}>{a.major} · {a.grade}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                    {reqResults.length > 0 ? keywordChip(`${reqOkCount}/${reqResults.length} 확인`, reqOkCount === reqResults.length) : <span style={{ fontSize: 12, color: 'var(--border-strong)' }}>-</span>}
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                    {total > 0 ? keywordChip(`${matched.length}/${total} 일치`, matched.length === total) : <span style={{ fontSize: 12, color: 'var(--border-strong)' }}>-</span>}
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13 }}>{a.applyDate}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}><StatusPill status={adminStatusSlug(a.status)} label={a.status} /></td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                    <button onClick={() => setDetailId(a.id)} style={rowBtnStyle}>상세보기</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '10px 2px 0', fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.6 }}>
        "필수조건"·"근무시간"은 지원서에 입력된 정보를 기준으로 자동 확인한 참고 정보입니다. 확인되지 않았다고 해서 조건을 충족하지 못한 것은 아니니 상세보기에서 직접 확인해 주세요.
      </p>
    </AdminShell>
  )
}

function th(t, align, width) {
  return <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', textAlign: align || 'left', whiteSpace: 'nowrap', width }}>{t}</th>
}
function keywordChip(label, ok) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10, whiteSpace: 'nowrap',
      color: ok ? 'var(--success)' : 'var(--text-body)', background: ok ? 'var(--success-50)' : 'var(--neutral-100)',
    }}>{label}</span>
  )
}
function filterChip(on) {
  return {
    display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 'var(--radius-lg)',
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    border: '1.5px solid ' + (on ? 'var(--sogang-red)' : 'var(--border-subtle)'),
    background: on ? 'var(--sogang-red-50)' : '#fff', color: on ? 'var(--sogang-red)' : 'var(--text-body)',
  }
}
const rowBtnStyle = {
  height: 30, padding: '0 14px', background: '#fff', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, color: 'var(--text-body)', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
}
const backBtnStyle = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }

function ApplicantDetail({ applicant: a, post, onBack, onDecide }) {
  const pool = buildApplicantPool(a)
  const requiredResults = post ? (post.qualifications || []).map(c => ({ text: c, ...matchCondition(c, pool) })) : []
  const preferredResults = post ? (post.preferred || []).map(c => ({ text: c, ...matchCondition(c, pool) })) : []
  const { matched: matchedSlots, total: requiredSlotCount } = workTimeMatch(a, post)

  const field = (label, value) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 600 }}>{value}</span>
    </div>
  )
  const conditionRow = ({ text, ok, reason }) => (
    <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      {ok ? <CircleCheck size={16} color="var(--success)" style={{ marginTop: 1, flexShrink: 0 }} /> : <CircleDashed size={16} color="var(--border-strong)" style={{ marginTop: 1, flexShrink: 0 }} />}
      <span style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.5 }}>
        {text}
        {ok ? <span style={{ color: 'var(--success)', fontWeight: 600 }}> · {reason}</span> : <span style={{ color: 'var(--text-subtle)' }}> · 지원서에서 자동 확인되지 않음</span>}
      </span>
    </div>
  )
  const miniTable = (columns, rows) => (
    rows.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>등록된 내역이 없습니다.</div> : (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{columns.map(c => <th key={c.key} style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', background: 'var(--saint-tan)', textAlign: 'left', whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map(c => <td key={c.key} style={{ padding: '7px 10px', fontSize: 13, color: 'var(--text-body)', borderBottom: '1px solid var(--border-subtle)' }}>{r[c.key] || '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    )
  )

  return (
    <div>
      <button onClick={onBack} style={{ ...backBtnStyle, marginBottom: 16 }}><ChevronLeft size={17} /> 지원자 목록으로</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <StatusPill status={adminStatusSlug(a.status)} label={a.status} />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{a.name}</h1>
        <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>{a.sid} · {a.major} {a.grade} · 지원일 {a.applyDate}</span>
      </div>
      {post && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18, fontSize: 13, fontWeight: 600, color: 'var(--sogang-red)', background: 'var(--sogang-red-50)', padding: '5px 12px', borderRadius: 'var(--radius-lg)' }}>
          지원 공고 · {post.dept} | {post.title}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AdminPanel title="지원자 정보">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {field('연락처', a.phone)}
              {field('이메일', a.email)}
            </div>
          </AdminPanel>

          {post && (requiredResults.length > 0 || preferredResults.length > 0) && (
            <AdminPanel title="지원 자격 확인" right={<span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>참고용 · 담당자가 최종 확인</span>}>
              {requiredResults.length > 0 && (
                <div style={{ marginBottom: preferredResults.length > 0 ? 16 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>필수 조건</div>
                  {requiredResults.map(conditionRow)}
                </div>
              )}
              {preferredResults.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>우대 역량</div>
                  {preferredResults.map(conditionRow)}
                </div>
              )}
            </AdminPanel>
          )}

          <AdminPanel title="자기소개서">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>지원 동기</div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7 }}>{a.motivation}</p>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>자기소개</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7 }}>{a.selfIntro}</p>
          </AdminPanel>

          <AdminPanel title="경력·활동 사항">
            {miniTable([{ key: 'type', label: '구분' }, { key: 'org', label: '기관' }, { key: 'role', label: '직책' }, { key: 'detail', label: '세부내용' }], a.careers || [])}
          </AdminPanel>
          <AdminPanel title="어학성적 · 자격증">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', marginBottom: 8 }}>어학성적</div>
            {miniTable([{ key: 'test', label: '공인시험' }, { key: 'score', label: '점수' }, { key: 'grade', label: '등급' }, { key: 'date', label: '취득일자' }], a.languages || [])}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-body)', margin: '16px 0 8px' }}>자격증</div>
            {miniTable([{ key: 'name', label: '자격증명' }, { key: 'org', label: '발급처' }, { key: 'date', label: '취득일자' }], a.certificates || [])}
          </AdminPanel>

          <AdminPanel title="관리자 메모">
            <textarea defaultValue={a.note} placeholder="검토 의견을 남기세요." style={{ width: '100%', height: 64, padding: 10, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'none', boxSizing: 'border-box' }} />
          </AdminPanel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AdminPanel title="근무 가능 시간"
            right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--info)', background: 'var(--info-50)', padding: '4px 10px', borderRadius: 10, fontWeight: 600 }}><CalendarCheck2 size={12} /> 수강신청 내역 자동 연동</span>}>
            {requiredSlotCount > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                color: matchedSlots.length === requiredSlotCount ? 'var(--success)' : 'var(--text-body)',
                background: matchedSlots.length === requiredSlotCount ? 'var(--success-50)' : 'var(--neutral-100)',
              }}>
                <CalendarCheck2 size={14} /> 공고 근무 시간과 {matchedSlots.length}/{requiredSlotCount} 일치
              </div>
            )}
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
              붉은 칸은 학생의 수강신청 시간표에서 자동 연동된 <b style={{ color: 'var(--sogang-red)' }}>수업시간</b>이고, 체크 표시는 학생이 지원서에서 근무 가능하다고 체크한 시간입니다.
            </p>
            <TimeGrid classSlots={a.classSlots || []} availableSlots={a.availableSlots || []} editable={false} />
          </AdminPanel>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 22px' }}>
            <span style={{ fontSize: 13, color: 'var(--text-body)' }}>최종 선발 결정 <b style={{ color: 'var(--text-strong)' }}>— 담당자가 직접 선택</b></span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onDecide('선발')} style={decideBtn(a.status === '선발', 'var(--success)')}>선발</button>
              <button onClick={() => onDecide('보류')} style={decideBtn(a.status === '보류', 'var(--warning)')}>보류</button>
              <button onClick={() => onDecide('탈락')} style={decideBtn(a.status === '탈락', 'var(--text-muted)')}>탈락</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function decideBtn(active, color) {
  return {
    height: 38, padding: '0 20px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)',
    background: active ? color : '#fff', color: active ? '#fff' : color, border: `1px solid ${color}`,
  }
}
