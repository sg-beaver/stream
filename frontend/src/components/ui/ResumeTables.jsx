import { Plus, Trash2 } from 'lucide-react'
import DatePicker from './DatePicker'

const th = { padding: '9px 10px', fontSize: 12, fontWeight: 700, color: 'var(--saint-maroon)', background: 'var(--saint-tan)', textAlign: 'left', whiteSpace: 'nowrap' }
const td = { padding: '6px', borderBottom: '1px solid var(--border-subtle)' }
const cellInput = {
  width: '100%', height: 34, padding: '0 10px', boxSizing: 'border-box',
  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-strong)', outline: 'none',
}

// 경력·활동 / 어학성적 / 자격증 — 공통 지원서 · 지원서 작성 화면 공용 입력 표
export function RowTable({ columns, rows, onChange, onRemove }) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '10px 2px' }}>아직 추가된 항목이 없습니다.</div>
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map(c => <th key={c.key ?? c.keys.join('-')} style={{ ...th, width: c.w }}>{c.label}</th>)}
          <th style={{ ...th, width: 36 }} />
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id}>
            {columns.map(c => (
              <td key={c.key ?? c.keys.join('-')} style={td}>
                {c.type === 'select' ? (
                  <select value={row[c.key]} onChange={e => onChange(row.id, c.key, e.target.value)} style={{ ...cellInput, cursor: 'pointer' }}>
                    <option value="">선택</option>
                    {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : c.type === 'date' ? (
                  <DatePicker value={row[c.key]} onChange={v => onChange(row.id, c.key, v)} placeholder={c.placeholder} />
                ) : c.type === 'daterange' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <DatePicker value={row[c.keys[0]]} onChange={v => onChange(row.id, c.keys[0], v)} placeholder="YYYY.MM.DD" />
                    </div>
                    <span style={{ color: 'var(--text-subtle)', fontSize: 12, flexShrink: 0 }}>~</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <DatePicker value={row[c.keys[1]]} onChange={v => onChange(row.id, c.keys[1], v)} placeholder="YYYY.MM.DD" />
                    </div>
                  </div>
                ) : (
                  <input value={row[c.key]} onChange={e => onChange(row.id, c.key, e.target.value)} placeholder={c.placeholder} style={cellInput} />
                )}
              </td>
            ))}
            <td style={{ ...td, textAlign: 'center' }}>
              <button type="button" onClick={() => onRemove(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
                <Trash2 size={14} color="var(--text-subtle)" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 작성 화면과 같은 컬럼 구조를 유지한 읽기 전용 표 — 제출된 지원서를 요약 텍스트가 아니라
// 작성했던 그대로 보여주기 위해 사용 (지원 상세보기 화면)
const tdReadOnly = { padding: '10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-body)' }

export function ReadOnlyRowTable({ columns, rows }) {
  if (!rows || rows.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '10px 2px' }}>등록된 내역이 없습니다.</div>
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map(c => <th key={c.key ?? c.keys.join('-')} style={{ ...th, width: c.w }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? i}>
            {columns.map(c => (
              <td key={c.key ?? c.keys.join('-')} style={tdReadOnly}>
                {c.type === 'daterange'
                  ? ([row[c.keys[0]], row[c.keys[1]]].filter(Boolean).join(' ~ ') || '—')
                  : (row[c.key] || '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TextField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', height: 38, padding: '0 12px', boxSizing: 'border-box',
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-strong)', outline: 'none',
        }}
      />
    </div>
  )
}

export function AddRowButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
        height: 32, padding: '0 12px', background: 'var(--surface-card)',
        border: '1px dashed var(--sogang-silver)', borderRadius: 'var(--radius-sm)',
        fontSize: 12, fontWeight: 600, color: 'var(--sogang-red)',
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
      }}
    >
      <Plus size={13} /> {label}
    </button>
  )
}
