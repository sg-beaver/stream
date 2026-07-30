// STREAM student shell + shared UI helpers (plain script, window exports)

// ---- Icon (Lucide) ----
function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.75, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        attrs: { width: size, height: size, stroke: color, 'stroke-width': strokeWidth },
        nameAttr: 'data-lucide',
      });
    }
  }, [name, size, color, strokeWidth]);
  return React.createElement('span', {
    ref,
    style: { display: 'inline-flex', width: size, height: size, ...style },
  });
}

// ---- Status badge ----
const STATUS_TONES = {
  '모집중':   { bg: '#E7F4EA', fg: '#1F8A4C' },
  '지원완료': { bg: '#E8F0FB', fg: '#2563C9' },
  '지원 완료':{ bg: '#E7F4EA', fg: '#1F8A4C' },
  '마감임박': { bg: '#FDEEE0', fg: '#D9791F' },
  '검토 중':  { bg: '#FDEEE0', fg: '#D9791F' },
  '면접 진행':{ bg: '#EEEAFB', fg: '#6D4FCB' },
  '최종 합격':{ bg: '#E7F4EA', fg: '#1F8A4C' },
  '불합격':   { bg: '#EEF0F2', fg: '#6B7280' },
  '모집완료': { bg: '#EEF0F2', fg: '#6B7280' },
};
function StatusBadge({ status, size = 'md' }) {
  const t = STATUS_TONES[status] || { bg: '#EEF0F2', fg: '#6B7280' };
  const pad = size === 'lg' ? '6px 14px' : '4px 11px';
  const fs = size === 'lg' ? 14 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', background: t.bg, color: t.fg,
      padding: pad, borderRadius: 6, fontSize: fs, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

// ---- Stat card ----
const TONE_CIRCLE = {
  neutral: { bg: '#EEF1F4', fg: '#5B6570' },
  green:   { bg: '#E7F4EA', fg: '#1F8A4C' },
  orange:  { bg: '#FDEEE0', fg: '#D9791F' },
  blue:    { bg: '#E8F0FB', fg: '#2563C9' },
  purple:  { bg: '#EEEAFB', fg: '#6D4FCB' },
  gold:    { bg: '#FBF1DC', fg: '#B8860B' },
};
const TONE_VALUE = {
  neutral: '#1F2937', green: '#1F8A4C', orange: '#D9791F',
  blue: '#2563C9', purple: '#6D4FCB', gold: '#B8860B',
};
function StatCard({ stat, active, onClick }) {
  const c = TONE_CIRCLE[stat.tone] || TONE_CIRCLE.neutral;
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 0, textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
      background: '#fff', border: active ? '1.5px solid ' + c.fg : '1px solid #E6E8EB',
      borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: '0 1px 2px rgba(16,24,40,.04)', font: 'inherit',
    }}>
      <span style={{
        width: 44, height: 44, borderRadius: '50%', background: c.bg, color: c.fg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={stat.icon} size={22} color={c.fg} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{stat.label}</span>
        <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: TONE_VALUE[stat.tone] || '#1F2937' }}>{stat.value}</span>
        <span style={{ fontSize: 12, color: '#9AA1A9' }}>{stat.sub}</span>
      </span>
    </button>
  );
}

// ---- Weekly time grid ----
// redSlots: filled red cells (수업시간). checkSlots: red check marks (근무가능). label for red cells.
function TimeGrid({ redSlots = [], checkSlots = [], redLabel = '수업시간', legend = true }) {
  const rows = window.timeRows, days = window.dayCols;
  const cell = (day, time) => {
    const key = day + '-' + time;
    const isRed = redSlots.includes(key);
    const isCheck = checkSlots.includes(key);
    return (
      <td key={key} style={{
        border: '1px solid #E6E8EB', height: 30, textAlign: 'center', verticalAlign: 'middle',
        background: isRed ? '#B01116' : '#fff', color: '#fff', padding: 0,
        fontSize: 11, fontWeight: 600,
      }}>
        {isRed ? redLabel : (isCheck ? <Icon name="check" size={14} color="#B01116" style={{ verticalAlign: 'middle' }} /> : '')}
      </td>
    );
  };
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#5B4B33', width: 68 }}>시간</th>
            {days.map(d => (
              <th key={d} style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 13, fontWeight: 700, color: '#5B4B33' }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t}>
              <td style={{ border: '1px solid #E6E8EB', background: '#FAFAFA', textAlign: 'center', fontSize: 12, color: '#6B7280', height: 30 }}>{t}</td>
              {days.map(d => cell(d, t))}
            </tr>
          ))}
        </tbody>
      </table>
      {legend && (
        <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 12, color: '#6B7280' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, background: '#B01116', borderRadius: 3, display: 'inline-block' }}></span>
            붉은색은 수업시간으로 자동 연동된 선택 불가 슬롯입니다.
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={14} color="#B01116" /> 체크된 칸은 근무 가능 시간입니다.
          </span>
        </div>
      )}
    </div>
  );
}

// ---- Card / Panel ----
function Panel({ title, right, children, style }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 24, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          {title && <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1F2937' }}>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// ---- Shell (SAINT header + STREAM sidebar) ----
function Shell({ active, onNavigate, onOpenPost, onApplyPost, children }) {
  const u = window.currentUser;
  return (
    <div style={{ minHeight: '100vh', background: '#F4F5F7', display: 'flex', flexDirection: 'column' }}>
      {/* SAINT global header */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #E6E8EB', height: 64,
        display: 'flex', alignItems: 'center', padding: '0 28px', gap: 28, position: 'sticky', top: 0, zIndex: 50,
      }}>
        <img src="../../assets/sogang-logo.png" alt="서강대학교" style={{ height: 34 }} />
        <nav style={{ display: 'flex', gap: 30, flex: 1, justifyContent: 'center' }}>
          {window.saintNav.map(n => (
            <span key={n} style={{ fontSize: 15, fontWeight: 600, color: '#3A4048', cursor: 'pointer' }}>{n}</span>
          ))}
          <span style={{ fontSize: 15, fontWeight: 800, color: '#B01116', cursor: 'pointer', position: 'relative', paddingBottom: 4, borderBottom: '3px solid #B01116' }}>STREAM</span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Icon name="bell" size={20} color="#5B6570" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#EEF1F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="user" size={16} color="#5B6570" />
            </span>
            <span style={{ fontSize: 14, color: '#3A4048', fontWeight: 600 }}>{u.name} ({u.role})</span>
            <Icon name="chevron-down" size={16} color="#9AA1A9" />
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
        {/* STREAM sidebar */}
        <aside style={{ width: 248, background: '#fff', borderRight: '1px solid #E6E8EB', padding: '28px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '0 12px 4px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#B01116', letterSpacing: '.04em' }}>STREAM</div>
            <div style={{ fontSize: 11, color: '#9AA1A9', marginTop: 4 }}>서강대학교 교내근로 통합관리 시스템</div>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 22 }}>
            {window.streamMenu.map(m => {
              const on = active === m.id;
              return (
                <button key={m.id} onClick={() => onNavigate && onNavigate(m.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left', width: '100%',
                  background: on ? '#FDECEC' : 'transparent',
                  color: on ? '#B01116' : '#4B5563', fontWeight: on ? 700 : 500, fontSize: 14,
                }}>
                  <Icon name={m.icon} size={18} color={on ? '#B01116' : '#8A929B'} />
                  {m.label}
                </button>
              );
            })}
          </nav>
          <window.ChatWidget onOpenPost={onOpenPost} onApplyPost={onApplyPost} />
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0, padding: '28px 32px 48px' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, StatusBadge, StatCard, TimeGrid, Panel, Shell });
