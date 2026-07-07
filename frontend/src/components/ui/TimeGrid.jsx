import { timeRows, dayCols } from '../../data/mockData'

export default function TimeGrid({ classSlots = [], availableSlots = [], editable = false, onToggle }) {
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan)', padding: '8px 0', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-bold)', color: 'var(--saint-maroon)', width: 64, textAlign: 'center' }}>시간</th>
              {dayCols.map(d => (
                <th key={d} style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan)', padding: '8px 0', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-bold)', color: 'var(--saint-maroon)', textAlign: 'center' }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeRows.map(time => (
              <tr key={time}>
                <td style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan-soft)', textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', height: 30 }}>{time}</td>
                {dayCols.map(day => {
                  const key = `${day}-${time}`
                  const isClass = classSlots.includes(key)
                  const isAvail = availableSlots.includes(key)
                  return (
                    <td
                      key={key}
                      onClick={editable && !isClass ? () => onToggle?.(key) : undefined}
                      style={{
                        border: '1px solid var(--saint-grid)',
                        height: 30, textAlign: 'center', verticalAlign: 'middle', padding: 0,
                        background: isClass ? 'var(--sogang-red)' : 'var(--neutral-0)',
                        cursor: editable && !isClass ? 'pointer' : 'default',
                      }}
                    >
                      {isClass && (
                        <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>수업</span>
                      )}
                      {!isClass && isAvail && (
                        <span style={{ color: 'var(--sogang-red)', fontSize: 14, fontWeight: 700 }}>✓</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: 'var(--sogang-red)', borderRadius: 2, display: 'inline-block' }} />
          수업시간 (선택 불가)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--sogang-red)', fontSize: 14, fontWeight: 700 }}>✓</span>
          근무 가능 시간
        </span>
      </div>
    </div>
  )
}
