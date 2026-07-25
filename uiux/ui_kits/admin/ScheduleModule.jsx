// 근로 시간표 (공고 선택 → 가능시간 수합 → 제약 기반 생성 → 주간 그리드 · 비교 → 최종 확정)
// 근무표 생성 로직은 AI가 아니라 이 파일 안의 순수 함수(제약조건 계산 Layer)로 분리되어 있다.
// (docs/STREAM_CONTEXT.md 6.5, 9, 14-3 참고: 시간표 생성의 핵심 제약조건 계산은 AI Layer와 분리)

// 슬롯('요일-시간') 정렬 순서 — 요일 인덱스*100 + 시간 인덱스
function scheduleSlotOrder(slot) {
  const [day, time] = slot.split('-');
  return window.adminDayCols.indexOf(day) * 100 + window.adminTimeRows.indexOf(time);
}
function sortSlots(slots) {
  return [...slots].sort((a, b) => scheduleSlotOrder(a) - scheduleSlotOrder(b));
}

// 학생에게 이 슬롯을 배정하면 같은 요일 연속 근무 시간이 limit을 넘는지 확인
function wouldExceedConsecutive(assignedSlotSet, slot, limit) {
  const [day, time] = slot.split('-');
  const idx = window.adminTimeRows.indexOf(time);
  let run = 1;
  for (let i = idx - 1; i >= 0; i--) {
    if (assignedSlotSet.has(day + '-' + window.adminTimeRows[i])) run++; else break;
  }
  return run > limit;
}

// 학생의 근무 가능 후보 슬롯 (수업시간 자동 회피 여부 반영)
function candidateSlots(student, avoidClass) {
  const base = student.availableSlots || [];
  if (avoidClass) return new Set(base);
  return new Set([...base, ...(student.classSlots || [])]);
}

// 공고의 'weekly' 문구(예: '최대 15시간', '주 14시간 이하')에서 주당 시간 상한 숫자만 추출
function parseWeeklyCap(weeklyText) {
  const m = (weeklyText || '').match(/(\d+)\s*시간/);
  return m ? parseInt(m[1], 10) : null;
}

// mode: 'fill'(충원 우선) | 'balance'(균형 배분) | 'consolidate'(요일 집중 — 하루를 통째로 몰아서, 짧게 여러 번 출근하지 않도록)
function generateAssignment(students, requiredSlots, mode, constraints, weeklyCap) {
  const sortedRequired = sortSlots(requiredSlots);
  const pool = students.map(s => ({ id: s.id, name: s.name, slots: candidateSlots(s, constraints.avoidClass) }));
  const assigned = {};
  pool.forEach(s => { assigned[s.id] = new Set(); });
  const assignment = {};

  const isEligible = (s, slot) => {
    if (!s.slots.has(slot)) return false;
    if (constraints.maxConsecutive && wouldExceedConsecutive(assigned[s.id], slot, constraints.maxConsecutiveValue)) return false;
    if (weeklyCap != null && assigned[s.id].size >= weeklyCap) return false;
    return true;
  };

  if (mode === 'fill') {
    // 가능 시간이 적은(제약이 큰) 학생부터 우선 배정해 빈 슬롯을 최소화
    const order = [...pool].sort((a, b) => a.slots.size - b.slots.size);
    order.forEach(s => {
      sortedRequired.forEach(slot => {
        if (assignment[slot]) return;
        if (isEligible(s, slot)) {
          assignment[slot] = s.id;
          assigned[s.id].add(slot);
        }
      });
    });
  } else if (mode === 'balance') {
    // 1인당 상한(전체 슬롯 / 인원수, 올림 — 주당 근무시간 상한을 넘지 않는 선에서)을 두고 가장 적게 배정된 학생부터 채움
    let cap = Math.max(1, Math.ceil(sortedRequired.length / Math.max(pool.length, 1)));
    if (weeklyCap != null) cap = Math.min(cap, weeklyCap);
    sortedRequired.forEach(slot => {
      const eligible = pool.filter(s => assigned[s.id].size < cap && isEligible(s, slot));
      if (eligible.length === 0) return;
      eligible.sort((a, b) => assigned[a.id].size - assigned[b.id].size);
      const chosen = eligible[0];
      assignment[slot] = chosen.id;
      assigned[chosen.id].add(slot);
    });
  } else {
    // 요일 집중: 학생마다 '홈 요일'을 정해 그 날 위주로 몰아준다. 다만 요일 수보다 선발 인원이 많아
    // 모두에게 온전한 하루를 줄 수 없을 때는, 전원이 배정받는 것을 최우선으로 하고 — 정말 필요한
    // 사람만 다른 요일 자투리를 보태 받도록 해서 여러 날에 걸치는 사람 수를 최소화한다.
    const byDay = {};
    sortedRequired.forEach(slot => {
      const day = slot.split('-')[0];
      (byDay[day] = byDay[day] || []).push(slot);
    });
    const dayOrder = Object.keys(byDay).sort((a, b) => window.adminDayCols.indexOf(a) - window.adminDayCols.indexOf(b));
    // 이 시나리오에서 "전원 배정" 기준 시간 — 최소 배정 시간 제약이 꺼져 있어도 최소 1시간은 보장
    const needMin = constraints.minHoursEnabled ? Math.max(1, constraints.minHoursValue) : 1;

    // 1) 학생별 홈 요일 결정 — 그 학생이 가능한 슬롯이 가장 많은 요일. 동률이면 이미 홈으로 정해진 인원이 적은 요일 우선(부하 분산)
    const dayCountFor = (s, day) => byDay[day].filter(slot => s.slots.has(slot)).length;
    const homeDay = {}, homeLoad = {};
    dayOrder.forEach(d => { homeLoad[d] = 0; });
    [...pool].sort((a, b) => a.slots.size - b.slots.size).forEach(s => {
      let bestDay = null, bestScore = -1;
      dayOrder.forEach(d => {
        const score = dayCountFor(s, d);
        if (score === 0) return;
        if (score > bestScore || (score === bestScore && homeLoad[d] < homeLoad[bestDay])) { bestScore = score; bestDay = d; }
      });
      if (bestDay) { homeDay[s.id] = bestDay; homeLoad[bestDay]++; }
    });

    // 2) 홈 요일 안에서 우선 최소 배정 시간만큼만 나눠 채운다 (한 사람이 그 날을 다 가져가 다른 홈 동료 몫이 없어지지 않도록)
    dayOrder.forEach(day => {
      const homies = pool.filter(s => homeDay[s.id] === day);
      homies.forEach(s => {
        byDay[day].forEach(slot => {
          if (assigned[s.id].size >= needMin) return;
          if (assignment[slot]) return;
          if (isEligible(s, slot)) { assignment[slot] = s.id; assigned[s.id].add(slot); }
        });
      });
    });

    // 3) 그래도 최소 배정 시간을 못 채운 학생은, 다른 요일의 남는 슬롯에서라도 모자란 만큼만 보태 받는다 —
    //    이 학생만 부득이 여러 날에 걸치게 되더라도, 배정을 아예 못 받는 것보다는 낫다
    pool.forEach(s => {
      if (assigned[s.id].size >= needMin) return;
      sortedRequired.forEach(slot => {
        if (assigned[s.id].size >= needMin) return;
        if (assignment[slot]) return;
        if (isEligible(s, slot)) { assignment[slot] = s.id; assigned[s.id].add(slot); }
      });
    });

    // 4) 아직 안 채워진 슬롯은 같은 날 이미 근무 중인 학생을 우선으로 채워 충원율을 최대한 끌어올린다(새 요일이 추가로 늘지 않도록)
    sortedRequired.forEach(slot => {
      if (assignment[slot]) return;
      const day = slot.split('-')[0];
      const eligible = pool.filter(s => isEligible(s, slot));
      if (eligible.length === 0) return;
      eligible.sort((a, b) => {
        const aSame = Array.from(assigned[a.id]).some(sl => sl.split('-')[0] === day);
        const bSame = Array.from(assigned[b.id]).some(sl => sl.split('-')[0] === day);
        if (aSame !== bSame) return aSame ? -1 : 1;
        return assigned[a.id].size - assigned[b.id].size;
      });
      const chosen = eligible[0];
      assignment[slot] = chosen.id;
      assigned[chosen.id].add(slot);
    });
  }

  // 최소 배정 시간 미만으로 걸린 학생은 배정을 접는다. 그 슬롯을 억지로 다른 학생에게 재배정하면
  // (그 학생도 결국 짧은 시간만 받는) 같은 문제가 재발할 수 있어, 안전하게 미충원으로 남긴다 —
  // 즉 이 제약은 충원율을 낮추더라도 "애매하게 짧은 배정"을 만들지 않는 쪽을 택한다.
  if (constraints.minHoursEnabled && constraints.minHoursValue > 0) {
    pool.forEach(s => {
      if (assigned[s.id].size > 0 && assigned[s.id].size < constraints.minHoursValue) {
        assigned[s.id].forEach(slot => { delete assignment[slot]; });
        assigned[s.id] = new Set();
      }
    });
  }

  const filled = Object.keys(assignment).length;
  const perStudent = pool.map(s => {
    const slots = sortSlots(Array.from(assigned[s.id]));
    return { id: s.id, name: s.name, count: assigned[s.id].size, slots, days: new Set(slots.map(sl => sl.split('-')[0])).size };
  });
  const counts = perStudent.map(p => p.count);
  return {
    assignment,
    perStudent,
    filled,
    total: sortedRequired.length,
    fillRate: sortedRequired.length ? Math.round((filled / sortedRequired.length) * 100) : 0,
    balanceGap: counts.length ? Math.max(...counts) - Math.min(...counts) : 0,
    totalCommutes: perStudent.reduce((sum, p) => sum + p.days, 0),
  };
}

// 시나리오별 표시 라벨 — cap(균형 배분 상한)·minNote(최소 배정 시간 문구)는 balance/fill에서만 사용
const SCENARIO_LABELS = {
  fill: (cap, minNote) => ({ n: '시나리오 A', tag: '충원 우선', note: '가능 시간이 적은 학생부터 우선 배정해 빈 슬롯을 최소화합니다. 학생별 근무시간·출근 요일은 불균등할 수 있습니다.' + (minNote || '') }),
  balance: (cap, minNote) => ({ n: '시나리오 B', tag: '균형 배분', note: `1인당 근무시간 상한(최대 ${cap}시간)을 두어 고르게 배정합니다. 상한 때문에 일부 슬롯은 미충원될 수 있습니다.` + (minNote || '') }),
  consolidate: (cap, minNote) => ({ n: '시나리오 C', tag: '요일 집중', note: '가능하면 한 학생이 하루를 통째로 맡도록 배정해, 짧은 시간을 여러 날에 걸쳐 나눠 출근하지 않도록 합니다.' + (minNote || '') }),
};

function ScheduleModule() {
  const { AdminIcon, AButton, APanel, ATimeGrid } = window;

  const deptPosts = window.adminPosts.filter(p => p.dept === window.adminUser.dept);
  const candidatesFor = (postId) => {
    const submitted = window.SharedApplicantsStore ? window.SharedApplicantsStore.getAll() : [];
    return [...submitted, ...window.applicants].filter(a => a.postId === postId && a.status === '선발');
  };

  const [postId, setPostId] = React.useState(null);
  const [stage, setStage] = React.useState(0);
  const [constraints, setConstraints] = React.useState({ noDouble: true, maxConsecutive: true, maxConsecutiveValue: 4, avoidClass: true, minHoursEnabled: true, minHoursValue: 2, weeklyCapEnabled: true });
  const [scenario, setScenario] = React.useState('fill');
  const [confirmed, setConfirmed] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState(null);

  const post = postId ? window.adminPosts.find(p => p.id === postId) : null;
  const candidates = post ? candidatesFor(post.id) : [];
  const weeklyCap = post && constraints.weeklyCapEnabled ? parseWeeklyCap(post.weekly) : null;
  const fillResult = post ? generateAssignment(candidates, post.workSlots, 'fill', constraints, weeklyCap) : null;
  const balanceResult = post ? generateAssignment(candidates, post.workSlots, 'balance', constraints, weeklyCap) : null;
  const consolidateResult = post ? generateAssignment(candidates, post.workSlots, 'consolidate', constraints, weeklyCap) : null;
  const results = { fill: fillResult, balance: balanceResult, consolidate: consolidateResult };
  const current = post ? results[scenario] : null;
  // 추천 시나리오 — 충원율이 가장 높은 것을 우선하고, 동률이면 배정 편차가 적은 것을, 그마저 동률이면 출근 횟수(쪼개진 출근)가 적은 것을 우선
  const recommended = post ? ['fill', 'balance', 'consolidate'].reduce((best, id) => {
    const r = results[id], b = results[best];
    if (r.fillRate > b.fillRate) return id;
    if (r.fillRate < b.fillRate) return best;
    if (r.balanceGap < b.balanceGap) return id;
    if (r.balanceGap > b.balanceGap) return best;
    if (r.totalCommutes < b.totalCommutes) return id;
    return best;
  }, 'fill') : null;
  const expandedCandidate = expandedId ? candidates.find(c => c.id === expandedId) : null;

  const resetToPicker = () => { setPostId(null); setStage(0); setScenario('fill'); setConfirmed(false); setExpandedId(null); };
  const pick = (id) => { setPostId(id); setStage(0); setScenario('fill'); setConfirmed(false); setExpandedId(null); };

  // 확정 시 학생 관리 등 다른 화면에서도 같은 근무표를 볼 수 있도록 공유 저장소에 기록
  const confirmSchedule = () => {
    if (window.SharedSchedulesStore) {
      const { n: scenarioName, tag: scenarioTag } = SCENARIO_LABELS[scenario]();
      window.SharedSchedulesStore.confirm(post.id, {
        postId: post.id, dept: post.dept, title: post.title,
        scenario, scenarioName, scenarioTag,
        assignment: current.assignment, perStudent: current.perStudent,
        fillRate: current.fillRate, total: current.total, filled: current.filled,
        confirmedAt: new Date().toISOString(),
      });
    }
    setConfirmed(true);
  };

  const info = (label, value) => (
    <div key={label}>
      <div style={{ fontSize: 12, color: '#9AA1A9', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{value}</div>
    </div>
  );

  // ---- 진입 화면: 근무표를 생성할 공고 선택 ----
  if (!post) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>근로 시간표</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>근무표를 생성할 공고를 선택하세요. 학생 선발이 완료된 공고만 시간표를 생성할 수 있습니다.</p>
        </div>
        <APanel title={`${window.adminUser.dept} 담당 공고`}>
          {deptPosts.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#9AA1A9' }}>담당 공고가 없습니다.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {deptPosts.map(p => {
                const n = candidatesFor(p.id).length;
                const ready = n > 0;
                return (
                  <div key={p.id} style={{ border: '1px solid ' + (ready ? '#E6E8EB' : '#EEF0F2'), background: ready ? '#fff' : '#FAFAFA', borderRadius: 10, padding: 18 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: '#9AA1A9', marginBottom: 14 }}>{p.dept}</div>
                    <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#9AA1A9' }}>선발 인원</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: ready ? '#1F8A4C' : '#B9BFC6' }}>{n}/{p.headcount}명</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#9AA1A9' }}>필요 시간</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1F2937' }}>{p.workSlots.length}칸/주</div>
                      </div>
                    </div>
                    {ready ? (
                      <AButton variant="primary" size="sm" icon="calendar-days" onClick={() => pick(p.id)}>이 공고로 시간표 생성</AButton>
                    ) : (
                      <div style={{ height: 34, display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: '#B9BFC6' }}>선발된 학생 없음 · 학생 선발에서 먼저 선발하세요</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </APanel>
      </div>
    );
  }

  // ---- 생성 마법사 ----
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

  const recordedCount = candidates.filter(c => (c.availableSlots || []).length > 0).length;
  const notFilled = sortSlots(post.workSlots.filter(s => !current.assignment[s]));

  // 주간 근무 시간표: 공고의 필요 시간대(post.workSlots)를 그대로 칸으로 쓰고, 채워진 칸엔 학생 이름을, 못 채운 칸엔 '미충원'을 표시
  const nameById = Object.fromEntries(candidates.map(c => [c.id, c.name]));
  const gridLabels = {}, gridColors = {};
  post.workSlots.forEach(slot => {
    const sid = current.assignment[slot];
    if (sid) { gridLabels[slot] = nameById[sid] || ''; gridColors[slot] = '#B01116'; }
    else { gridLabels[slot] = '미충원'; gridColors[slot] = '#D9791F'; }
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <button onClick={resetToPicker} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontSize: 13, color: '#6B7280', font: 'inherit' }}>
            <AdminIcon name="chevron-left" size={14} color="#9AA1A9" /> 공고 선택으로
          </button>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>근로 시간표</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>{post.dept} · {post.title} — 학생이 지원서에 체크한 근무 가능 시간을 확인하고 제약 조건 기반으로 근무표를 생성·확정합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {stage > 0 && !confirmed && <AButton variant="outline" icon="chevron-left" onClick={() => setStage(stage - 1)}>이전 단계</AButton>}
          {stage < 3 && <AButton variant="primary" onClick={() => setStage(stage + 1)} icon="chevron-right">다음 단계</AButton>}
        </div>
      </div>

      <Stepper />

      {stage === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <APanel title="공고 정보">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 16 }}>
              {info('부서', post.dept)}
              {info('공고', post.title)}
              {info('선발 인원', `${candidates.length}/${post.headcount}명`)}
              {info('필요 근무 시간', `${post.workSlots.length}칸/주`)}
            </div>
            <div style={{ fontSize: 12, color: '#9AA1A9', marginBottom: 8 }}>필요 시간대</div>
            <ATimeGrid redSlots={post.workSlots} redLabel="필요" legend={false} />
          </APanel>
          <APanel title="가능 시간 확인 (지원서 기준)" right={<span style={{ fontSize: 13, color: '#6B7280' }}>선발 {candidates.length}명 중 가능 시간 기재 <b style={{ color: '#1F8A4C' }}>{recordedCount}</b>명</span>}>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9AA1A9', lineHeight: 1.6 }}>
              별도로 시간을 다시 받지 않고, 학생이 이 공고에 지원할 때 지원서에서 체크한 근무 가능 시간을 그대로 사용합니다. 카드를 클릭하면 지원서에 제출된 시간표를 볼 수 있습니다.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {candidates.map(c => {
                const ok = (c.availableSlots || []).length > 0;
                const on = expandedId === c.id;
                return (
                  <button key={c.id} onClick={() => setExpandedId(on ? null : c.id)} style={{
                    textAlign: 'left', cursor: 'pointer', font: 'inherit',
                    border: '1.5px solid ' + (on ? '#B01116' : (ok ? '#CDE9D5' : '#F5D9C2')),
                    background: on ? '#FDECEC' : (ok ? '#F1F9F3' : '#FDF4EC'), borderRadius: 10, padding: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{c.name}</span>
                      <AdminIcon name={ok ? 'circle-check' : 'triangle-alert'} size={18} color={ok ? '#1F8A4C' : '#D9791F'} />
                    </div>
                    <div style={{ fontSize: 12, color: ok ? '#1F8A4C' : '#D9791F', fontWeight: 600 }}>{ok ? '지원서에 기재됨' : '가능 시간 미기재'}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1F2937', marginTop: 8 }}>{(c.availableSlots || []).length}<span style={{ fontSize: 13, fontWeight: 600, color: '#9AA1A9' }}> 가능시간</span></div>
                    <div style={{ fontSize: 11, color: on ? '#B01116' : '#9AA1A9', fontWeight: 600, marginTop: 10 }}>{on ? '시간표 접기 ▲' : '지원서 시간표 보기 ▼'}</div>
                  </button>
                );
              })}
            </div>
          </APanel>

          {expandedCandidate && (
            <APanel title={`${expandedCandidate.name} · 지원서 제출 시간표`} right={<button onClick={() => setExpandedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9AA1A9', fontSize: 13, font: 'inherit' }}>닫기</button>}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#4B5563', lineHeight: 1.6 }}>
                붉은 칸은 학생의 수강신청 시간표에서 자동 연동된 <b style={{ color: '#B01116' }}>수업시간</b>이고, 체크 표시는 학생이 지원서에서 <b style={{ color: '#B01116' }}>추가로 근무 가능하다고 체크</b>한 시간입니다. <b style={{ color: '#1F8A4C' }}>초록 체크</b>는 그중 이 공고가 요구하는 근무 시간과 겹치는 시간입니다.
              </p>
              <ATimeGrid
                redSlots={expandedCandidate.classSlots || []}
                checkSlots={expandedCandidate.availableSlots || []}
                matchSlots={post.workSlots.filter(s => (expandedCandidate.availableSlots || []).includes(s))}
                redLabel="수업"
                redLegendText="수업시간 (수강신청 자동 연동)"
                checkLegendText="근무 가능 시간 (그 외)"
                matchLegendText="공고 근무 시간과 일치"
              />
            </APanel>
          )}
        </div>
      )}

      {stage === 1 && (
        <APanel title="제약 조건 설정">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
            {[
              { key: 'noDouble', t: '중복 근무 제한', d: '동일 학생이 같은 시간대 중복 배정되지 않도록 합니다.' },
              { key: 'weeklyCapEnabled', t: '주당 최대 근무시간 제한', d: weeklyCap != null ? `이 공고 기준(${post.weekly}) 학생 1인당 주 ${weeklyCap}시간을 넘지 않도록 합니다.` : '이 공고에는 주당 근무시간 상한 정보가 없습니다.' },
              { key: 'avoidClass', t: '수업시간 자동 회피', d: 'SAINT 수강 정보를 기반으로 수업시간을 근무 가능 시간에서 제외합니다.' },
            ].map(item => (
              <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid #E6E8EB', borderRadius: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={constraints[item.key]}
                  onChange={() => setConstraints(c => ({ ...c, [item.key]: !c[item.key] }))}
                  style={{ width: 18, height: 18, accentColor: '#B01116', flexShrink: 0 }} />
                <span><span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{item.t}</span><span style={{ fontSize: 12, color: '#9AA1A9' }}>{item.d}</span></span>
              </label>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid #E6E8EB', borderRadius: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', flex: 1 }}>
                <input type="checkbox" checked={constraints.maxConsecutive}
                  onChange={() => setConstraints(c => ({ ...c, maxConsecutive: !c.maxConsecutive }))}
                  style={{ width: 18, height: 18, accentColor: '#B01116', flexShrink: 0 }} />
                <span><span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>최대 연속 근무시간 제한</span><span style={{ fontSize: 12, color: '#9AA1A9' }}>연속 근무는 이 시간을 넘지 않도록 합니다.</span></span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <input type="number" min={1} max={12} value={constraints.maxConsecutiveValue} disabled={!constraints.maxConsecutive}
                  onChange={(e) => setConstraints(c => ({ ...c, maxConsecutiveValue: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  style={{ width: 52, height: 34, padding: '0 8px', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 13, font: 'inherit', textAlign: 'center', opacity: constraints.maxConsecutive ? 1 : 0.5 }} />
                <span style={{ fontSize: 13, color: '#6B7280' }}>시간 초과 제한</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1px solid #E6E8EB', borderRadius: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', flex: 1 }}>
                <input type="checkbox" checked={constraints.minHoursEnabled}
                  onChange={() => setConstraints(c => ({ ...c, minHoursEnabled: !c.minHoursEnabled }))}
                  style={{ width: 18, height: 18, accentColor: '#B01116', flexShrink: 0 }} />
                <span><span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>최소 배정 시간 설정</span><span style={{ fontSize: 12, color: '#9AA1A9' }}>배정 시간이 이보다 짧게 나오는 학생은 배정에서 제외합니다. 그 시간대는 억지로 채우지 않고 미충원으로 남을 수 있습니다.</span></span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <input type="number" min={1} max={12} value={constraints.minHoursValue} disabled={!constraints.minHoursEnabled}
                  onChange={(e) => setConstraints(c => ({ ...c, minHoursValue: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  style={{ width: 52, height: 34, padding: '0 8px', border: '1px solid #DADEE3', borderRadius: 6, fontSize: 13, font: 'inherit', textAlign: 'center', opacity: constraints.minHoursEnabled ? 1 : 0.5 }} />
                <span style={{ fontSize: 13, color: '#6B7280' }}>시간 미만 제외</span>
              </div>
            </div>
          </div>
        </APanel>
      )}

      {stage === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <APanel title="시나리오 비교">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {['fill', 'balance', 'consolidate'].map(id => {
                const r = results[id];
                let cap = Math.max(1, Math.ceil(post.workSlots.length / Math.max(candidates.length, 1)));
                if (weeklyCap != null) cap = Math.min(cap, weeklyCap);
                const minNote = constraints.minHoursEnabled ? ` 배정 시간이 ${constraints.minHoursValue}시간 미만인 학생은 제외됩니다.` : '';
                const label = SCENARIO_LABELS[id](cap, minNote);
                const best = id === recommended;
                const on = scenario === id;
                return (
                  <div key={id} onClick={() => setScenario(id)} style={{ cursor: 'pointer', border: '1.5px solid ' + (on ? '#B01116' : (best ? '#EBB9B8' : '#E6E8EB')), borderRadius: 10, padding: 18, position: 'relative' }}>
                    {best && <span style={{ position: 'absolute', top: -10, left: 16, background: '#B01116', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 5 }}>추천</span>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#1F2937' }}>{label.n}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', background: '#F1F3F5', padding: '3px 10px', borderRadius: 5 }}>{label.tag}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
                      <div><div style={{ fontSize: 12, color: '#9AA1A9' }}>충원율</div><div style={{ fontSize: 20, fontWeight: 800, color: '#1F8A4C' }}>{r.fillRate}%</div></div>
                      <div><div style={{ fontSize: 12, color: '#9AA1A9' }}>미충원</div><div style={{ fontSize: 20, fontWeight: 800, color: r.total - r.filled === 0 ? '#1F8A4C' : '#D9791F' }}>{r.total - r.filled}칸</div></div>
                      <div><div style={{ fontSize: 12, color: '#9AA1A9' }}>배정 편차</div><div style={{ fontSize: 20, fontWeight: 800, color: r.balanceGap <= 1 ? '#1F8A4C' : '#D9791F' }}>{r.balanceGap}시간</div></div>
                      <div><div style={{ fontSize: 12, color: '#9AA1A9' }}>출근 횟수</div><div style={{ fontSize: 20, fontWeight: 800, color: '#1F2937' }}>{r.totalCommutes}회</div></div>
                    </div>
                    <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 14 }}>{label.note}</div>
                    <AButton variant={scenario === id ? 'primary' : 'outline'} size="sm" onClick={() => setScenario(id)}>{scenario === id ? '선택됨' : '이 시나리오 선택'}</AButton>
                  </div>
                );
              })}
            </div>
          </APanel>
          <APanel title={`주간 근무 시간표 (${SCENARIO_LABELS[scenario]().n} · ${SCENARIO_LABELS[scenario]().tag})`}>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9AA1A9', lineHeight: 1.6 }}>
              공고에 등록된 필요 시간대({post.workSlots.length}칸)를 그대로 표시합니다. 배정된 칸에는 학생 이름이, 아직 채워지지 않은 칸에는 <span style={{ color: '#D9791F', fontWeight: 700 }}>미충원</span>이 표시됩니다.
            </p>
            <ATimeGrid redSlots={post.workSlots} redLabel="배정" redLabels={gridLabels} redColors={gridColors} legend={false} />
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: '#6B7280' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 13, height: 13, background: '#B01116', borderRadius: 3 }}></span> 학생 배정됨</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 13, height: 13, background: '#D9791F', borderRadius: 3 }}></span> 미충원</span>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3A4048' }}>학생별 배정 시간</div>
              {current.perStudent.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13, color: '#3A4048' }}>
                  <span style={{ fontWeight: 700, minWidth: 60 }}>{p.name}</span>
                  <span style={{ color: '#6B7280', minWidth: 44 }}>{p.count}시간</span>
                  <span style={{ color: '#9AA1A9', fontSize: 12 }}>{p.slots.length > 0 ? p.slots.join(', ') : '배정 없음'}</span>
                </div>
              ))}
              {notFilled.length > 0 && (
                <div style={{ fontSize: 12, color: '#D9791F', marginTop: 4 }}>미충원 슬롯: {notFilled.join(', ')}</div>
              )}
            </div>
          </APanel>
        </div>
      )}

      {stage === 3 && (
        <APanel>
          {!confirmed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
              <span style={{ width: 72, height: 72, borderRadius: '50%', background: '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><AdminIcon name="calendar-check" size={34} color="#1F8A4C" /></span>
              <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1F2937' }}>근무 시간표를 확정하시겠습니까?</h2>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280', maxWidth: 520 }}>
                {post.dept} · {post.title} · {SCENARIO_LABELS[scenario]().n}({SCENARIO_LABELS[scenario]().tag}) · 충원율 {current.fillRate}% · 미충원 {current.total - current.filled}칸 · 확정 시 선발 학생 {candidates.length}명에게 알림이 전송됩니다.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <AButton variant="outline" onClick={() => setStage(2)}>다시 검토</AButton>
                <AButton variant="primary" icon="check" onClick={confirmSchedule}>시간표 확정</AButton>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 0' }}>
              <span style={{ width: 72, height: 72, borderRadius: '50%', background: '#E7F4EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><AdminIcon name="check-circle-2" size={34} color="#1F8A4C" /></span>
              <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1F2937' }}>근무 시간표가 확정되었습니다</h2>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>{post.dept} · {post.title} 근무표가 선발 학생 {candidates.length}명에게 전송되었습니다.</p>
              <AButton variant="outline" icon="calendar-days" onClick={resetToPicker}>다른 공고 근무표 생성</AButton>
            </div>
          )}
        </APanel>
      )}
    </div>
  );
}
window.ScheduleModule = ScheduleModule;
