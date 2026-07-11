// STREAM 관리자 콘솔 shell + shared helpers (plain script, window exports)

function AdminIcon({ name, size = 18, color = 'currentColor', strokeWidth = 1.75, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({ attrs: { width: size, height: size, stroke: color, 'stroke-width': strokeWidth }, nameAttr: 'data-lucide' });
    }
  }, [name, size, color, strokeWidth]);
  return React.createElement('span', { ref, style: { display: 'inline-flex', width: size, height: size, ...style } });
}

const A_TONES = {
  '모집중': { bg: '#E7F4EA', fg: '#1F8A4C' }, '모집완료': { bg: '#E8F0FB', fg: '#2563C9' },
  '마감임박': { bg: '#FDEEE0', fg: '#D9791F' }, '검토중': { bg: '#FDEEE0', fg: '#D9791F' },
  '선발': { bg: '#E7F4EA', fg: '#1F8A4C' }, '보류': { bg: '#FBF1DC', fg: '#B8860B' },
  '탈락': { bg: '#EEF0F2', fg: '#6B7280' }, '미처리': { bg: '#FDEEE0', fg: '#D9791F' },
  '승인': { bg: '#E7F4EA', fg: '#1F8A4C' }, '반려': { bg: '#EEF0F2', fg: '#6B7280' },
  '정상': { bg: '#E7F4EA', fg: '#1F8A4C' },
};
function ABadge({ status }) {
  const t = A_TONES[status] || { bg: '#EEF0F2', fg: '#6B7280' };
  return <span style={{ display: 'inline-flex', alignItems: 'center', background: t.bg, color: t.fg, padding: '4px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{status}</span>;
}

const A_CIRCLE = {
  neutral: { bg: '#EEF1F4', fg: '#5B6570' }, green: { bg: '#E7F4EA', fg: '#1F8A4C' },
  orange: { bg: '#FDEEE0', fg: '#D9791F' }, blue: { bg: '#E8F0FB', fg: '#2563C9' },
  purple: { bg: '#EEEAFB', fg: '#6D4FCB' }, gold: { bg: '#FBF1DC', fg: '#B8860B' },
  red: { bg: '#FCEAEA', fg: '#C0322B' },
};
const A_VAL = { neutral: '#1F2937', green: '#1F8A4C', orange: '#D9791F', blue: '#2563C9', purple: '#6D4FCB', gold: '#B8860B', red: '#C0322B' };
function AStatCard({ stat }) {
  const c = A_CIRCLE[stat.tone] || A_CIRCLE.neutral;
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <span style={{ width: 42, height: 42, borderRadius: '50%', background: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AdminIcon name={stat.icon} size={21} color={c.fg} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{stat.label}</span>
        <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: A_VAL[stat.tone] || '#1F2937' }}>{stat.value}</span>
        <span style={{ fontSize: 12, color: '#9AA1A9' }}>{stat.sub}</span>
      </span>
    </div>
  );
}

function APanel({ title, right, children, style }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #E6E8EB', borderRadius: 12, padding: 22, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          {title && <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1F2937' }}>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function ATimeGrid({ redSlots = [], checkSlots = [], redLabel = '수업시간', legend = true }) {
  const rows = window.adminTimeRows, days = window.adminDayCols;
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead><tr>
          <th style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#5B4B33', width: 64 }}>시간</th>
          {days.map(d => <th key={d} style={{ border: '1px solid #E6E8EB', background: '#F6F0E6', padding: '8px 0', fontSize: 13, fontWeight: 700, color: '#5B4B33' }}>{d}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(t => (
            <tr key={t}>
              <td style={{ border: '1px solid #E6E8EB', background: '#FAFAFA', textAlign: 'center', fontSize: 12, color: '#6B7280', height: 28 }}>{t}</td>
              {days.map(d => {
                const key = d + '-' + t, isRed = redSlots.includes(key), isCk = checkSlots.includes(key);
                return <td key={key} style={{ border: '1px solid #E6E8EB', height: 28, textAlign: 'center', background: isRed ? '#B01116' : '#fff', color: '#fff', fontSize: 11, fontWeight: 600 }}>{isRed ? redLabel : (isCk ? <AdminIcon name="check" size={13} color="#B01116" /> : '')}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {legend && (
        <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: '#6B7280' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 13, height: 13, background: '#B01116', borderRadius: 3 }}></span> 배정된 근무 시간</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AdminIcon name="check" size={13} color="#B01116" /> 근무 가능 시간</span>
        </div>
      )}
    </div>
  );
}

function AButton({ children, variant = 'primary', size = 'md', onClick, icon }) {
  const h = size === 'sm' ? 34 : (size === 'lg' ? 48 : 42);
  const pad = size === 'sm' ? '0 14px' : (size === 'lg' ? '0 32px' : '0 18px');
  const fs = size === 'sm' ? 13 : 14;
  const styles = {
    primary: { background: '#B01116', color: '#fff', border: 'none' },
    outline: { background: '#fff', color: '#3A4048', border: '1px solid #DADEE3' },
    danger: { background: '#fff', color: '#C0322B', border: '1px solid #E7B7B4' },
    ghost: { background: 'transparent', color: '#B01116', border: '1px solid #EBB9B8' },
    dark: { background: '#26292E', color: '#fff', border: 'none' },
  }[variant];
  return (
    <button onClick={onClick} style={{ height: h, padding: pad, borderRadius: 8, fontSize: fs, fontWeight: 700, cursor: 'pointer', font: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, ...styles }}>
      {icon && <AdminIcon name={icon} size={fs + 2} color={styles.color} />} {children}
    </button>
  );
}

function PageTitle({ title, desc, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#1F2937' }}>{title}</h1>
        {desc && <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>{desc}</p>}
      </div>
      {right}
    </div>
  );
}

function AdminShell({ active, onNavigate, children }) {
  const u = window.adminUser;
  return (
    <div style={{ minHeight: '100vh', background: '#F4F5F7', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #E6E8EB', height: 64, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 28, position: 'sticky', top: 0, zIndex: 50 }}>
        <img src="../../assets/sogang-logo.png" alt="서강대학교" style={{ height: 34 }} />
        <nav style={{ display: 'flex', gap: 30, flex: 1, justifyContent: 'center' }}>
          {window.adminSaintNav.map(n => <span key={n} style={{ fontSize: 15, fontWeight: 600, color: '#3A4048', cursor: 'pointer' }}>{n}</span>)}
          <span style={{ fontSize: 15, fontWeight: 800, color: '#B01116', cursor: 'pointer', paddingBottom: 4, borderBottom: '3px solid #B01116' }}>STREAM</span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <AdminIcon name="bell" size={20} color="#5B6570" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#EEF1F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><AdminIcon name="user" size={16} color="#5B6570" /></span>
            <span style={{ fontSize: 14, color: '#3A4048', fontWeight: 600 }}>{u.name} ({u.role})</span>
            <AdminIcon name="chevron-down" size={16} color="#9AA1A9" />
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
        <aside style={{ width: 240, background: '#fff', borderRight: '1px solid #E6E8EB', padding: '28px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '0 12px 4px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#B01116', letterSpacing: '.04em', fontFamily: 'var(--font-brand)' }}>STREAM</div>
            <div style={{ fontSize: 11, color: '#9AA1A9', marginTop: 4 }}>교내 근로 운영 관리 (관리자)</div>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 22 }}>
            {window.adminMenu.map(m => {
              const on = active === m.id;
              return (
                <button key={m.id} onClick={() => onNavigate && onNavigate(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left', width: '100%', background: on ? '#FDECEC' : 'transparent', color: on ? '#B01116' : '#4B5563', fontWeight: on ? 700 : 500, fontSize: 14 }}>
                  <AdminIcon name={m.icon} size={18} color={on ? '#B01116' : '#8A929B'} /> {m.label}
                </button>
              );
            })}
          </nav>
          <div style={{ marginTop: 'auto', paddingTop: 24 }}>
            <div style={{ background: '#F8F9FB', border: '1px solid #E6E8EB', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#9AA1A9', marginBottom: 6 }}>담당 부서</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#3A4048' }}>{u.dept}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{u.name} · {u.role}</div>
            </div>
          </div>
        </aside>
        <main style={{ flex: 1, minWidth: 0, padding: '28px 32px 48px' }}>{children}</main>
      </div>
    </div>
  );
}

Object.assign(window, { AdminIcon, ABadge, AStatCard, APanel, ATimeGrid, AButton, PageTitle, AdminShell });
