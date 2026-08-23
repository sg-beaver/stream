import { timeRows as defaultTimeRows, dayCols } from '../../data/mockData'

// uiux/ui_kits/admin/AdminShell.jsx의 ATimeGrid와 같은 표현력을 갖도록 확장 (#56).
// - classSlots     : 붉은 칸 (수업시간 / 공고 필요 시간대 등 "채워진" 칸)
// - availableSlots : 체크 표시 (근무 가능 시간)
// - matchSlots     : availableSlots 중 강조할 칸 (공고 근무시간과 겹치는 시간 → 초록 체크 + 연초록 배경)
// - slotLabels     : 붉은 칸에 표시할 텍스트 (예: 배정된 학생 이름). 없으면 classLabel
// - slotColors     : 붉은 칸의 배경색 개별 지정 (예: 미충원 칸만 주황)
// - rows           : 시간 행 override (생성 결과가 08:00·30분 단위를 포함할 때)
// - legend         : 범례 표시 여부 및 문구
// - clickableSlots : 클릭을 허용할 채워진 칸 (예: 대타 반영 칸 → 상세 모달), onSlotClick과 함께 사용
// - rowHeight      : 행 높이 (30분 단위 그리드는 낮게 — uiux 킷과 동일한 밀도)
// - footer         : 표 맨 아래 요약 행 { label, values: { 요일: 문자열 } } (예: 요일별 가능 시간 합)
export default function TimeGrid({
  classSlots = [],
  availableSlots = [],
  matchSlots = [],
  slotLabels,
  slotColors,
  rows,
  editable = false,
  onToggle,
  clickableSlots = [],
  onSlotClick,
  rowHeight = 30,
  classLabel = '수업',
  legend = true,
  classLegendText = '수업시간 (선택 불가)',
  availableLegendText = '근무 가능 시간',
  matchLegendText = '공고 근무 시간과 일치',
  footer,
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
                {/* 30분 행이 섞여 있어도 시간 라벨은 정시에만 표시한다 (uiux 킷과 동일) */}
                <td style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan-soft)', textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', height: rowHeight }}>
                  {time.endsWith(':00') ? time : ''}
                </td>
                {dayCols.map(day => {
                  const key = `${day}-${time}`
                  const isClass = classSlots.includes(key)
                  const isAvail = availableSlots.includes(key)
                  const isMatch = isAvail && matchSlots.includes(key)
                  const label = slotLabels?.[key]
                  const fill = slotColors?.[key] ?? 'var(--sogang-red)'
                  const isClickable = clickableSlots.includes(key)
                  return (
                    <td
                      key={key}
                      onClick={
                        isClickable ? () => onSlotClick?.(key)
                          : editable && !isClass ? () => onToggle?.(key)
                          : undefined
                      }
                      title={label || undefined}
                      style={{
                        border: '1px solid var(--saint-grid)',
                        height: rowHeight, textAlign: 'center', verticalAlign: 'middle', padding: '0 2px',
                        // 체크된 칸은 연분홍 배경으로 채워 uiux 킷과 같은 밀도로 보이게 한다
                        background: isClass ? fill
                          : isMatch ? 'var(--success-50)'
                          : isAvail ? 'var(--sogang-red-50)'
                          : 'var(--neutral-0)',
                        cursor: isClickable || (editable && !isClass) ? 'pointer' : 'default',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}
                    >
                      {isClass && (
                        <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>
                          {label ?? classLabel}
                        </span>
                      )}
                      {!isClass && isAvail && (
                        <span style={{ color: isMatch ? 'var(--success)' : 'var(--sogang-red)', fontSize: rowHeight < 24 ? 10 : 14, fontWeight: 700, lineHeight: 1 }}>✓</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {footer && (
              <tr>
                <td style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan)', textAlign: 'center', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-bold)', color: 'var(--saint-maroon)', height: 26 }}>
                  {footer.label}
                </td>
                {dayCols.map(day => {
                  const value = footer.values?.[day]
                  return (
                    <td key={day} style={{
                      border: '1px solid var(--saint-grid)', background: 'var(--saint-tan-soft)',
                      textAlign: 'center', fontSize: 'var(--fs-caption)', fontWeight: 700,
                      color: value && value !== '0' ? 'var(--saint-maroon)' : 'var(--text-subtle)',
                      height: 26,
                    }}>
                      {value ?? ''}
                    </td>
                  )
                })}
              </tr>
            )}
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
