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
// - dayBlocks      : 부서 정의 근무 슬롯(#89) { 요일: [{start, end}] } (분 단위).
//                    주어지면 블록에 걸친 30분 행들을 rowSpan으로 한 칸으로 병합해
//                    배정·가용을 블록 단위로 보여준다. 블록 밖 행은 기존 30분 칸 그대로.
// - daySubLabels   : 요일 머리글 아래에 덧붙일 라벨 { '월': '08.31' } — 특정 주를 보고 있을 때
//                    날짜를 함께 보여준다 (매주 반복 패턴 화면에서는 넘기지 않는다)
// - lectureSlots   : 학생 본인 수업 시간 — 연분홍 배경 + 진한 빨강 '수업'. 근무 칸(classSlots)과
//                    겹치면 근무가 우선하고, 편집 모드에서는 선택할 수 없다
// - disabledSlots  : 선택할 수 없는 칸 (부서가 근무를 두지 않는 시간) — 회색으로 죽이고 클릭을 막는다
// - onBlockToggle  : editable + dayBlocks일 때 블록 칸 클릭 핸들러 (keys, nextChecked).
//                    블록은 전부 배정 or 전부 비움이라 칸 하나가 아니라 블록 전체를 토글한다
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
  matchLegendText = '공고 필요 시간',
  footer,
  dayBlocks,
  daySubLabels,
  lectureSlots = [],
  lectureLegendText = '수업시간',
  disabledSlots = [],
  onBlockToggle,
}) {
  const timeRows = rows ?? defaultTimeRows

  // 블록 병합 준비: 요일별로 "행 시각 → { span, times } | 'covered'"를 만든다.
  // covered[0]이 블록 셀(rowSpan)이 되고 나머지 행은 그 요일 칸을 건너뛴다.
  const toMin = t => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const blockAt = {}
  if (dayBlocks) {
    dayCols.forEach(day => {
      const map = new Map()
      ;(dayBlocks[day] ?? []).forEach(b => {
        const covered = timeRows.filter(t => toMin(t) >= b.start && toMin(t) < b.end)
        if (covered.length === 0) return
        map.set(covered[0], { span: covered.length, times: covered })
        covered.slice(1).forEach(t => map.set(t, 'covered'))
      })
      blockAt[day] = map
    })
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan)', padding: '8px 0', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-bold)', color: 'var(--saint-maroon)', width: 64, textAlign: 'center' }}>시간</th>
              {dayCols.map(d => (
                <th key={d} style={{ border: '1px solid var(--saint-grid)', background: 'var(--saint-tan)', padding: daySubLabels ? '5px 0' : '8px 0', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-bold)', color: 'var(--saint-maroon)', textAlign: 'center' }}>
                  <div>{d}</div>
                  {daySubLabels?.[d] && (
                    <div style={{ fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-medium)', color: 'var(--text-muted)', marginTop: 1 }}>
                      {daySubLabels[d]}
                    </div>
                  )}
                </th>
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

                  // 블록 단위 병합 칸 — 채워진 칸(배정/수업)은 라벨 전체를 쌓아 보여주고,
                  // 가용 표시는 블록 전체 가능(✓) / 일부만 가능(부분: 블록 배정 불가)을 구분한다
                  const blockInfo = dayBlocks ? blockAt[day]?.get(time) : undefined
                  if (blockInfo === 'covered') return null
                  if (blockInfo) {
                    const keys = blockInfo.times.map(t => `${day}-${t}`)
                    const classKeys = keys.filter(k => classSlots.includes(k))
                    const labels = [...new Set(classKeys.map(k => slotLabels?.[k] ?? classLabel))]
                    const availCount = keys.filter(k => availableSlots.includes(k)).length
                    const allAvail = availCount === keys.length
                    const someAvail = availCount > 0
                    // 특수색(미충원 주황·대타 금색 등)이 섞여 있으면 그 색을 우선한다
                    const specialKey = classKeys.find(k => slotColors?.[k] && slotColors[k] !== 'var(--sogang-red)')
                    const fill = slotColors?.[specialKey ?? classKeys[0]] ?? 'var(--sogang-red)'
                    const clickableKey = keys.find(k => clickableSlots.includes(k))
                    // 편집 모드에서는 블록 전체를 한 번에 토글한다. 블록에 수업이 하나라도
                    // 겹치면 그 학생은 블록 전체 배정이 불가하므로(HC-BLOCK-1) 선택도 막는다
                    const blockDisabled = keys.some(k => disabledSlots.includes(k))
                    const blockLecture = keys.some(k => lectureSlots.includes(k))
                    const blockEditable =
                      editable && onBlockToggle && classKeys.length === 0
                      && !blockDisabled && !blockLecture
                    return (
                      <td
                        key={key} rowSpan={blockInfo.span}
                        title={
                          labels.length > 0 ? labels.join(', ')
                            : blockLecture ? '수업이 겹쳐 이 블록은 선택할 수 없습니다 — 블록은 통째로 배정됩니다'
                            : blockEditable ? `${allAvail ? '해제' : '선택'} — 블록 전체가 함께 바뀝니다`
                            : undefined
                        }
                        onClick={
                          clickableKey ? () => onSlotClick?.(clickableKey)
                            : blockEditable ? () => onBlockToggle(keys, !allAvail)
                            : undefined
                        }
                        style={{
                          border: '1px solid var(--saint-grid)',
                          textAlign: 'center', verticalAlign: 'middle', padding: '2px 3px',
                          background: labels.length > 0 ? fill
                            : blockLecture ? 'var(--sogang-red-50)'
                            : blockDisabled ? 'var(--neutral-100)'
                            : allAvail ? 'var(--sogang-red-50)'
                            : someAvail ? 'var(--neutral-50)'
                            : 'var(--neutral-0)',
                          cursor: clickableKey || blockEditable ? 'pointer' : 'default',
                        }}
                      >
                        {labels.length > 0 ? (
                          labels.map(l => (
                            <div key={l} style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-on-brand)', fontWeight: 600, lineHeight: 1.5, whiteSpace: 'normal', wordBreak: 'keep-all' }}>
                              {l}
                            </div>
                          ))
                        ) : blockLecture ? (
                          <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--sogang-red)', fontWeight: 700 }}>{classLabel}</span>
                        ) : allAvail ? (
                          <span style={{ color: 'var(--sogang-red)', fontSize: 'var(--fs-body)', fontWeight: 700, lineHeight: 1 }}>✓</span>
                        ) : someAvail ? (
                          <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-subtle)' }}>부분</span>
                        ) : null}
                      </td>
                    )
                  }

                  const isClass = classSlots.includes(key)
                  const isAvail = availableSlots.includes(key)
                  const isDisabled = disabledSlots.includes(key)
                  // 수업은 근무 칸보다 뒤 — 같은 칸에 근무가 잡혀 있으면 근무를 보여준다
                  const isLecture = !isClass && lectureSlots.includes(key)
                  // 두 정보를 겹쳐서 보여준다 — 체크(✓)는 학생이 가능하다고 한 시간,
                  // 배경색은 공고가 요구하는 시간. 둘 다 해당하면 칠해진 칸 위에 체크가 뜬다
                  // (별도 "일치" 색이나 문장 설명 없이도 겹치는 칸이 저절로 드러난다).
                  const isRequired = matchSlots.includes(key)
                  const label = slotLabels?.[key]
                  const fill = slotColors?.[key] ?? 'var(--sogang-red)'
                  const isClickable = clickableSlots.includes(key)
                  return (
                    <td
                      key={key}
                      onClick={
                        isClickable ? () => onSlotClick?.(key)
                          : editable && !isClass && !isDisabled && !isLecture ? () => onToggle?.(key)
                          : undefined
                      }
                      title={label || (isLecture ? '수업시간 — 선택할 수 없습니다' : undefined)}
                      style={{
                        border: '1px solid var(--saint-grid)',
                        height: rowHeight, textAlign: 'center', verticalAlign: 'middle', padding: '0 2px',
                        // 체크된 칸은 연분홍 배경으로 채워 uiux 킷과 같은 밀도로 보이게 한다
                        background: isClass ? fill
                          : isLecture ? 'var(--sogang-red-50)'
                          : isDisabled ? 'var(--neutral-100)'
                          : isRequired ? 'var(--warning-50)'
                          : isAvail ? 'var(--sogang-red-50)'
                          : 'var(--neutral-0)',
                        cursor: isClickable || (editable && !isClass && !isDisabled && !isLecture) ? 'pointer' : 'default',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}
                    >
                      {isClass && (
                        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-on-brand)', fontWeight: 600 }}>
                          {label ?? classLabel}
                        </span>
                      )}
                      {isLecture && (
                        <span style={{ color: 'var(--sogang-red)', fontSize: rowHeight < 24 ? 10 : 'var(--fs-caption)', fontWeight: 700, lineHeight: 1 }}>
                          {classLabel}
                        </span>
                      )}
                      {!isClass && !isLecture && !isDisabled && isAvail && (
                        <span style={{ color: 'var(--sogang-red)', fontSize: rowHeight < 24 ? 10 : 14, fontWeight: 700, lineHeight: 1 }}>✓</span>
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
              <span style={{ color: 'var(--sogang-red)', fontSize: 'var(--fs-body)', fontWeight: 700 }}>✓</span>
              {availableLegendText}
            </span>
          )}
          {matchSlots.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: 'var(--warning-50)', border: '1px solid var(--saint-grid)', borderRadius: 2, display: 'inline-block' }} />
              {matchLegendText}
            </span>
          )}
          {lectureSlots.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: 'var(--sogang-red-50)', border: '1px solid var(--saint-grid)', borderRadius: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'var(--sogang-red)' }}>수</span>
              {lectureLegendText}
            </span>
          )}
          {disabledSlots.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: 'var(--neutral-100)', border: '1px solid var(--saint-grid)', borderRadius: 2, display: 'inline-block' }} />
              근무 없음 (선택 불가)
            </span>
          )}
          {dayBlocks && availableSlots.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--neutral-50)', border: '1px solid var(--saint-grid)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--text-subtle)' }}>부</span>
              블록 일부만 가능 (블록 단위 배정 불가)
            </span>
          )}
        </div>
      )}
    </div>
  )
}
