// 근로 시간표 (가능시간 수합 → 제약 기반 생성 → 주간 그리드 → 시나리오 비교 → 확정)
function ScheduleModule() {
  const { AdminIcon, AButton, APanel, ATimeGrid } = window;
  const [stage, setStage] = React.useState(0); // 0 수합, 1 생성, 2 그리드/비교, 3 확정
  const steps = ['가능 시간 수합', '제약 기반 생성', '주간 그리드 · 비교', '최종 확정'];

  const Stepper = () => (
    <div style={{ display: 'flex', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '18px 28px', marginBottom: 20 }}>
      {steps.map((s, i) => {
        const done = i < stage, active = i === stage;
        return (
          <div key={s} style={{ flex: i < 3 ? 1 : '0 0 auto', display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: done ? '#1F8A4C' : (active ? '#B01116' : '#fff'), border: '2px solid ' + (done ? '#1F8A4C' : (active ? '#B01116' : '#D5D8DC')), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {done ? <AdminIcon name="check" size={15} color="#fff" strokeWidth={3} /> : (i + 1)}
            </span>
            <span style={{ marginLeft: 10, fontSize: 14, fontWeight: active ? 700 : 500, color: (done || active) ? '#1F2937' : '#9AA1A9', whiteSpace: 'nowrap' }}>{s}</span>
            {i < 3 && <span style={{ flex: 1, height: 2, background: done ? '#1F8A4C' : '#E6E8EB', margin: '0 16px' }}></span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>근로 시간표</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>학생 가능 시간을 수합하고 제약 조건 기반으로 근무표를 생성·확정합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {stage > 0 && <AButton variant="outline" icon="chevron-left" onClick={() => setStage(stage - 1)}>이전 단계</AButton>}
          {stage < 3 && <AButton variant="primary" onClick={() => setStage(stage + 1)} icon="chevron-right">다음 단계</AButton>}
        </div>
      </div>

      <Stepper />

      {stage === 0 && (
        <APanel title="가능 시간 수합 현황" right={<span style={{ fontSize: 13, color: '#6B7280' }}>제출 <b style={{ color: '#1F8A4C' }}>2</b> / 미제출 <b style={{ color: '#D9791F' }}>1</b></span>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[{ n: '안희진', ok: true, h: 8 }, { n: '박민수', ok: true, h: 10 }, { n: '이영희', ok: false, h: 0 }].map(s => (
              <div key={s.n} style={{ border: '1px solid ' + (s.ok ? '#CDE9D5' : '#F5D9C2'), background: s.ok ? '#F1F9F3' : '#FDF4EC', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{s.n}</span>
                  <AdminIcon name={s.ok ? 'circle-check' : 'clock'} size={18} color={s.ok ? '#1F8A4C' : '#D9791F'} />
                </div>
                <div style={{ fontSize: 12, color: s.ok ? '#1F8A4C' : '#D9791F', fontWeight: 600 }}>{s.ok ? '제출 완료' : '미제출'}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1F2937', marginTop: 8 }}>{s.h}<span style={{ fontSize: 13, fontWeight: 600, color: '#9AA1A9' }}> 가능시간</span></div>
              </div>
            ))}
          </div>
        </APanel>
      )}

      {stage === 1 && (
        <APanel title="제약 조건 설정">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
            {[['중복 근무 제한', '동일 학생이 같은 시간대 중복 배정되지 않도록 합니다.', true], ['최대 연속 근무시간 제한', '연속 근무는 4시간을 넘지 않도록 합니다.', true], ['부서별 인원 선호 반영', '부서가 요청한 선호 인원을 우선 배정합니다.', false], ['수업시간 자동 회피', 'SAINT 수강 정보를 기반으로 수업시간을 제외합니다.', true]].map(([t, d, on]) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid #E6E8EB', borderRadius: 10, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked={on} style={{ width: 18, height: 18, accentColor: '#B01116' }} />
                <span><span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{t}</span><span style={{ fontSize: 12, color: '#9AA1A9' }}>{d}</span></span>
              </label>
            ))}
          </div>
        </APanel>
      )}

      {stage === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <APanel title="시나리오 비교">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[{ n: '시나리오 A', tag: '충원 우선', fill: '94%', conf: '0건', note: '빈 슬롯 최소화. 일부 학생 연속 근무 발생.', best: true }, { n: '시나리오 B', tag: '균형 배분', fill: '88%', conf: '1건', note: '학생별 근무시간 균등. 1개 슬롯 미충원.', best: false }].map(s => (
                <div key={s.n} style={{ border: '1.5px solid ' + (s.best ? '#B01116' : '#E6E8EB'), borderRadius: 10, padding: 18, position: 'relative' }}>
                  {s.best && <span style={{ position: 'absolute', top: -10, left: 16, background: '#B01116', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 5 }}>추천</span>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#1F2937' }}>{s.n}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', background: '#F1F3F5', padding: '3px 10px', borderRadius: 5 }}>{s.tag}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                    <div><div style={{ fontSize: 12, color: '#9AA1A9' }}>충원율</div><div style={{ fontSize: 20, fontWeight: 800, color: '#1F8A4C' }}>{s.fill}</div></div>
                    <div><div style={{ fontSize: 12, color: '#9AA1A9' }}>충돌</div><div style={{ fontSize: 20, fontWeight: 800, color: s.conf === '0건' ? '#1F8A4C' : '#D9791F' }}>{s.conf}</div></div>
                  </div>
                  <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 14 }}>{s.note}</div>
                  <AButton variant={s.best ? 'primary' : 'outline'} size="sm">이 시나리오 선택</AButton>
                </div>
              ))}
            </div>
          </APanel>
          <APanel title="주간 근무 시간표 (시나리오 A)">
            <ATimeGrid redSlots={['월-10:00','월-11:00','화-10:00','수-10:00','수-11:00','목-14:00','금-10:00','금-11:00']} redLabel="배정" legend={false} />
          </APanel>
        </div>
      )}

      {stage === 3 && (
        <APanel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
            <span style={{ width: 72, height: 72, borderRadius: '50%', background: '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><AdminIcon name="calendar-check" size={34} color="#1F8A4C" /></span>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1F2937' }}>근무 시간표를 확정하시겠습니까?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>시나리오 A · 충원율 94% · 충돌 0건 · 확정 시 학생에게 알림이 전송됩니다.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <AButton variant="outline" onClick={() => setStage(2)}>다시 검토</AButton>
              <AButton variant="primary" icon="check">시간표 확정</AButton>
            </div>
          </div>
        </APanel>
      )}
    </div>
  );
}
window.ScheduleModule = ScheduleModule;
