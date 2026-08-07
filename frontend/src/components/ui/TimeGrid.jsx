import { timeRows as defaultTimeRows, dayCols } from '../../data/mockData'

// uiux/ui_kits/admin/AdminShell.jsx의 ATimeGrid와 같은 표현력을 갖도록 확장 (#56).
// - classSlots     : 붉은 칸 (수업시간 / 공고 필요 시간대 등 "채워진" 칸)
// - availableSlots : 체크 표시 (근무 가능 시간)
// - matchSlots     : availableSlots 중 강조할 칸 (공고 근무시간과 겹치는 시간 → 초록 체크 + 연초록 배경)
// - slotLabels     : 붉은 칸에 표시할 텍스트 (예: 배정된 학생 이름). 없으면 classLabel
// - slotColors     : 붉은 칸의 배경색 개별 지정 (예: 미충원 칸만 주황)
// - rows           : 시간 행 override (생성 결과가 08:00·30분 단위를 포함할 때)
// - legend         : 범례 표시 여부 및 문구
export default function TimeGrid({
  classSlots = [],
  availableSlots = [],
  matchSlots = [],
  slotLabels,
  slotColors,
  rows,
  editable = false,
  onToggle,
  classLabel = '수업',
  legend = true,
  classLegendText = '수업시간 (선택 불가)',
  availableLegendText = '근무 가능 시간',
  matchLegendText = '공고 근무 시간과 일치',
}) {
  const timeRows = rows ?? defaultTimeRows
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
                  const isMatch = isAvail && matchSlots.includes(key)
                  const label = slotLabels?.[key]
                  const fill = slotColors?.[key] ?? 'var(--sogang-red)'
                  return (
                    <td
                      key={key}
                      onClick={editable && !isClass ? () => onToggle?.(key) : undefined}
                      title={label || undefined}
                      style={{
                        border: '1px solid var(--saint-grid)',
                        height: 30, textAlign: 'center', verticalAlign: 'middle', padding: '0 2px',
                        background: isClass ? fill : (isMatch ? 'var(--success-50)' : 'var(--neutral-0)'),
                        cursor: editable && !isClass ? 'pointer' : 'default',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}
                    >
                      {isClass && (
                        <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>
                          {label ?? classLabel}
                        </span>
                      )}
                      {!isClass && isAvail && (
                        <span style={{ color: isMatch ? 'var(--success)' : 'var(--sogang-red)', fontSize: 14, fontWeight: 700 }}>✓</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legend && (
        // 실제로 그려진 종류만 범례에 넣는다 (수업시간 데이터가 없는 화면에서 빈 항목이 뜨지 않도록)
        <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          {classSlots.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: 'var(--sogang-red)', borderRadius: 2, display: 'inline-block' }} />
              {classLegendText}
            </span>
          )}
          {availableSlots.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--sogang-red)', fontSize: 14, fontWeight: 700 }}>✓</span>
              {availableLegendText}
            </span>
          )}
          {availableSlots.some(key => matchSlots.includes(key)) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--success)', fontSize: 14, fontWeight: 700 }}>✓</span>
              {matchLegendText}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
