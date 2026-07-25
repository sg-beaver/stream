// 학생 관리 (선발 학생 목록 + 상세: 근무현황/배정시간/대타이력/관리자 메모)
// 근로 시간표에서 확정한 근무표가 있으면 그걸 그대로 보여주고, 아직 확정 전이면 지원서 기준 가능 시간을 보여준다
function StudentsModule() {
  const { AdminIcon, ABadge, ATimeGrid } = window;
  const [selId, setSelId] = React.useState(window.workers[0].id);
  const w = window.workers.find(x => x.id === selId);

  const scheduleFor = (worker) => {
    if (!window.SharedSchedulesStore) return null;
    const sched = window.SharedSchedulesStore.getForPost(worker.postId);
    if (!sched) return null;
    return { ...sched, mine: sched.perStudent.find(p => p.id === worker.applicantId) || null };
  };

  const th = (t, a) => <th style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#5B4B33', textAlign: a || 'left', whiteSpace: 'nowrap' }}>{t}</th>;
  const stat = (label, value) => (
    <div style={{ flex: 1, background: '#F8F9FB', border: '1px solid #EEF0F2', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: '#9AA1A9', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1F2937' }}>{value}</div>
    </div>
  );

  const mySchedule = scheduleFor(w);
  const myHours = mySchedule && mySchedule.mine ? mySchedule.mine.count : w.assigned;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>학생 관리</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>선발된 근로 학생의 근무 현황과 배정 시간, 대타 이력을 관리합니다.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #EEF0F2', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>선발 학생 ({window.workers.length}명)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F6F0E6' }}>{th('이름')}{th('부서')}{th('근무(주)', 'center')}{th('출결', 'center')}</tr></thead>
            <tbody>
              {window.workers.map(x => {
                const on = x.id === selId;
                const sched = scheduleFor(x);
                const hours = sched && sched.mine ? sched.mine.count : x.assigned;
                return (
                  <tr key={x.id} onClick={() => setSelId(x.id)} style={{ borderBottom: '1px solid #F1F3F5', background: on ? '#FDF6F6' : '#fff', cursor: 'pointer' }}>
                    <td style={{ padding: '13px 16px', borderLeft: '3px solid ' + (on ? '#B01116' : 'transparent') }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{x.name}</div>
                      <div style={{ fontSize: 12, color: '#9AA1A9' }}>{x.sid}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: '#4B5563' }}>{x.dept}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: '#4B5563' }}>주 {hours}h</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: sched ? '#1F8A4C' : '#9AA1A9' }}>{sched ? '확정' : '미확정'}</div>
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}><ABadge status={x.attendance === '정상' ? '정상' : '검토중'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1F2937' }}>{w.name}</h2>
                <div style={{ fontSize: 13, color: '#9AA1A9', marginTop: 4 }}>{w.sid} · {w.major} · {w.dept} · {w.role}</div>
              </div>
              <ABadge status={w.attendance === '정상' ? '정상' : '검토중'} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {stat('주당 ' + (mySchedule ? '배정' : '가능') + ' 시간', myHours + '시간')}
              {stat('누적 근무시간', w.worked + '시간')}
              {stat('시급', '₩' + w.rate)}
              {stat('급여 지급', w.pay)}
            </div>

            {mySchedule ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#3A4048' }}>확정 근무 시간</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1F8A4C', background: '#E7F4EA', padding: '2px 8px', borderRadius: 10 }}>근로 시간표에서 확정됨</span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>
                  {w.role} 공고의 근로 시간표에서 "{mySchedule.scenarioName} · {mySchedule.scenarioTag}" 시나리오로 확정된 배정입니다. {mySchedule.mine && mySchedule.mine.count === 0 && '이번 확정에서는 배정된 시간이 없습니다.'}
                </p>
                <ATimeGrid redSlots={mySchedule.mine ? mySchedule.mine.slots : []} redLabel="근무" legend={false} />
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3A4048', marginBottom: 4 }}>가능 시간 (지원서 기준)</div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>아직 {w.role} 공고의 근무표가 확정되지 않았습니다. 근로 시간표 화면에서 확정하면 이 자리에 실제 배정 시간이 표시됩니다. 지금은 학생이 지원서에서 체크한 근무 가능 시간입니다.</p>
                <ATimeGrid redSlots={w.classSlots || []} checkSlots={w.availableSlots || []} redLabel="수업"
                  redLegendText="수업시간 (수강신청 자동 연동)" checkLegendText="근무 가능 시간 (그 외)" />
              </>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>대타 이력 ({w.subs}건)</h3>
            {w.subs > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F6F0E6' }}>{th('날짜')}{th('시간')}{th('사유')}{th('상태', 'center')}</tr></thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #F1F3F5' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#3A4048' }}>2026.05.28</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#3A4048' }}>10:00-13:00</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#3A4048' }}>수강신청</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><ABadge status="미처리" /></td>
                  </tr>
                </tbody>
              </table>
            ) : <div style={{ fontSize: 13, color: '#9AA1A9', padding: '8px 0' }}>대타 이력이 없습니다.</div>}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>관리자 메모</h3>
            <textarea defaultValue="성실하고 정시 출근 양호. 문서 정리 정확도 높음." style={{ width: '100%', height: 72, padding: 12, border: '1px solid #DADEE3', borderRadius: 8, fontSize: 13, font: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
window.StudentsModule = StudentsModule;
