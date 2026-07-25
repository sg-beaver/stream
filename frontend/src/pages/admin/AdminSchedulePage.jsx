import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleCheck, Clock, CalendarCheck } from 'lucide-react'
import AdminShell from '../../components/layout/AdminShell'
import PageTitle from '../../components/ui/PageTitle'
import Button from '../../components/ui/Button'
import TimeGrid from '../../components/ui/TimeGrid'
import { AdminPanel } from '../../components/admin/AdminPanel'

const STEPS = ['가능 시간 수합', '제약 기반 생성', '주간 그리드 · 비교', '최종 확정']
const SUBMISSIONS = [{ n: '안희진', ok: true, h: 8 }, { n: '박민수', ok: true, h: 10 }, { n: '이영희', ok: false, h: 0 }]
const CONSTRAINTS = [
  ['중복 근무 제한', '동일 학생이 같은 시간대 중복 배정되지 않도록 합니다.', true],
  ['최대 연속 근무시간 제한', '연속 근무는 4시간을 넘지 않도록 합니다.', true],
  ['부서별 인원 선호 반영', '부서가 요청한 선호 인원을 우선 배정합니다.', false],
  ['수업시간 자동 회피', 'SAINT 수강 정보를 기반으로 수업시간을 제외합니다.', true],
]
const SCENARIOS = [
  { n: '시나리오 A', tag: '충원 우선', fill: '94%', conf: '0건', note: '빈 슬롯 최소화. 일부 학생 연속 근무 발생.', best: true },
  { n: '시나리오 B', tag: '균형 배분', fill: '88%', conf: '1건', note: '학생별 근무시간 균등. 1개 슬롯 미충원.', best: false },
]
const GENERATED_SLOTS = ['월-10:00', '월-11:00', '화-10:00', '수-10:00', '수-11:00', '목-14:00', '금-10:00', '금-11:00']

export default function AdminSchedulePage() {
  const [stage, setStage] = useState(0)

  return (
    <AdminShell activeMenu="schedule">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <PageTitle>근로 시간표</PageTitle>
          <p style={{ margin: '-8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>학생 가능 시간을 수합하고 제약 조건 기반으로 근무표를 생성·확정합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {stage > 0 && <Button variant="secondary" size="sm" onClick={() => setStage(stage - 1)}><ChevronLeft size={14} /> 이전 단계</Button>}
          {stage < 3 && <Button size="sm" onClick={() => setStage(stage + 1)}>다음 단계 <ChevronRight size={14} /></Button>}
        </div>
      </div>

      <Stepper stage={stage} />

      {stage === 0 && (
        <AdminPanel title="가능 시간 수합 현황" right={<span style={{ fontSize: 13, color: 'var(--text-muted)' }}>제출 <b style={{ color: 'var(--success)' }}>2</b> / 미제출 <b style={{ color: 'var(--warning)' }}>1</b></span>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {SUBMISSIONS.map(s => (
              <div key={s.n} style={{ border: `1px solid ${s.ok ? 'var(--success-100)' : 'var(--warning-100)'}`, background: s.ok ? 'var(--success-50)' : 'var(--warning-50)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{s.n}</span>
                  {s.ok ? <CircleCheck size={18} color="var(--success)" /> : <Clock size={18} color="var(--warning)" />}
                </div>
                <div style={{ fontSize: 12, color: s.ok ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{s.ok ? '제출 완료' : '미제출'}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-strong)', marginTop: 8 }}>{s.h}<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-subtle)' }}> 가능시간</span></div>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      {stage === 1 && (
        <AdminPanel title="제약 조건 설정">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
            {CONSTRAINTS.map(([t, d, on]) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked={on} style={{ width: 17, height: 17, accentColor: 'var(--sogang-red)' }} />
                <span><span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{t}</span><span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{d}</span></span>
              </label>
            ))}
          </div>
        </AdminPanel>
      )}

      {stage === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AdminPanel title="시나리오 비교">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {SCENARIOS.map(s => (
                <div key={s.n} style={{ border: `1.5px solid ${s.best ? 'var(--sogang-red)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-lg)', padding: 18, position: 'relative' }}>
                  {s.best && <span style={{ position: 'absolute', top: -10, left: 16, background: 'var(--sogang-red)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 5 }}>추천</span>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)' }}>{s.n}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--neutral-100)', padding: '3px 10px', borderRadius: 5 }}>{s.tag}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                    <div><div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>충원율</div><div style={{ fontSize: 19, fontWeight: 800, color: 'var(--success)' }}>{s.fill}</div></div>
                    <div><div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>충돌</div><div style={{ fontSize: 19, fontWeight: 800, color: s.conf === '0건' ? 'var(--success)' : 'var(--warning)' }}>{s.conf}</div></div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 }}>{s.note}</div>
                  <Button variant={s.best ? 'primary' : 'secondary'} size="sm">이 시나리오 선택</Button>
                </div>
              ))}
            </div>
          </AdminPanel>
          <AdminPanel title="주간 근무 시간표 (시나리오 A)">
            <TimeGrid classSlots={[]} availableSlots={GENERATED_SLOTS} editable={false} />
          </AdminPanel>
        </div>
      )}

      {stage === 3 && (
        <AdminPanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--success-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><CalendarCheck size={30} color="var(--success)" /></span>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>근무 시간표를 확정하시겠습니까?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>시나리오 A · 충원율 94% · 충돌 0건 · 확정 시 학생에게 알림이 전송됩니다.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={() => setStage(2)}>다시 검토</Button>
              <Button><Check size={14} /> 시간표 확정</Button>
            </div>
          </div>
        </AdminPanel>
      )}
    </AdminShell>
  )
}

function Stepper({ stage }) {
  return (
    <div style={{ display: 'flex', background: 'var(--neutral-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 26px', marginBottom: 18 }}>
      {STEPS.map((s, i) => {
        const done = i < stage, active = i === stage
        return (
          <div key={s} style={{ flex: i < 3 ? 1 : '0 0 auto', display: 'flex', alignItems: 'center' }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%',
              background: done ? 'var(--success)' : (active ? 'var(--sogang-red)' : '#fff'),
              border: `2px solid ${done ? 'var(--success)' : (active ? 'var(--sogang-red)' : 'var(--border-default)')}`,
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {done ? <Check size={13} strokeWidth={3} /> : (i + 1)}
            </span>
            <span style={{ marginLeft: 10, fontSize: 13, fontWeight: active ? 700 : 500, color: (done || active) ? 'var(--text-strong)' : 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{s}</span>
            {i < 3 && <span style={{ flex: 1, height: 2, background: done ? 'var(--success)' : 'var(--border-subtle)', margin: '0 16px' }} />}
          </div>
        )
      })}
    </div>
  )
}
