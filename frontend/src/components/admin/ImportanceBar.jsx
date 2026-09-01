// 배정 기준을 '얼마나 세게 반영할지' 고르는 바.
//
// 원래는 '덜 중요 / 기본 / 더 중요' 버튼 네 개였는데, 담당자가 무엇을 고르는 건지
// 읽어내기 어렵다는 피드백이 있었다(#110). '중요도'는 두 기준을 견주는 말이라
// 한 줄만 보고는 기준이 없고, 버튼은 네 값이 한 축 위에 있다는 것도 보여주지 못한다.
// 그래서 왼쪽(안 봄)에서 오른쪽(세게 반영)으로 이어지는 한 축의 바로 바꿨다 —
// 채워진 길이가 곧 반영 강도이고, 기본값 위치를 눈금으로 찍어 어디서 움직였는지 보인다.

// 배율은 정책 파일의 기본 가중치에 곱해진다 — 항목마다 절대값이 달라 배율로 다룬다
export const SCALE_LEVELS = [
  { value: 0, label: '반영 안 함' },
  { value: 0.5, label: '약하게' },
  { value: 1, label: '기본' },
  { value: 2, label: '세게' },
]

// 부서 정책의 기본값(1배) 눈금 위치
const DEFAULT_INDEX = SCALE_LEVELS.findIndex(l => l.value === 1)
const MAX_INDEX = SCALE_LEVELS.length - 1

// 프리셋 밖의 배율(챗봇·API로 저장된 ×3 등)도 바 위에 얹어야 해서 가장 가까운 눈금을 쓴다
function nearestIndex(value) {
  let best = DEFAULT_INDEX
  SCALE_LEVELS.forEach((level, i) => {
    if (Math.abs(level.value - value) < Math.abs(SCALE_LEVELS[best].value - value)) best = i
  })
  return best
}

export function scaleLabel(value) {
  const preset = SCALE_LEVELS.find(l => l.value === value)
  return preset ? preset.label : `직접 설정 ×${value}`
}

const TRACK_HEIGHT = 6

/**
 * value    현재 배율 (0 / 0.5 / 1 / 2, 또는 프리셋 밖의 값)
 * onChange 배율을 받는 콜백. 없으면 읽기 전용으로 그린다.
 * label    스크린리더에 읽힐 기준 이름
 */
export default function ImportanceBar({ value, onChange, label }) {
  const index = nearestIndex(value)
  const exact = SCALE_LEVELS.some(l => l.value === value)
  const pct = (index / MAX_INDEX) * 100
  const readOnly = !onChange

  const track = {
    height: TRACK_HEIGHT, borderRadius: 999,
    background: `linear-gradient(to right, var(--sogang-red) 0 ${pct}%, var(--neutral-200) ${pct}% 100%)`,
  }

  return (
    <div style={{ width: 168, flexShrink: 0 }}>
      <div style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
        {readOnly ? (
          <>
            <div style={{ ...track, width: '100%' }} />
            <span style={{
              position: 'absolute', left: `calc(${pct}% - 6px)`,
              width: 12, height: 12, borderRadius: '50%',
              background: 'var(--surface-card)', border: '2px solid var(--sogang-red)',
            }} />
          </>
        ) : (
          <input
            className="stream-range"
            type="range"
            min={0} max={MAX_INDEX} step={1}
            value={index}
            aria-label={`${label} 반영 강도`}
            aria-valuetext={scaleLabel(value)}
            onChange={e => onChange(SCALE_LEVELS[Number(e.target.value)].value)}
            style={{ width: '100%', background: track.background }}
          />
        )}
        {/* 기본값 눈금 — 손대지 않은 항목이 어디에 서 있는지, 어디로 되돌리면 되는지 알려 준다 */}
        <span
          aria-hidden
          title="부서 기본값"
          style={{
            position: 'absolute', left: `calc(${(DEFAULT_INDEX / MAX_INDEX) * 100}% - 1px)`,
            bottom: 0, width: 2, height: 5, borderRadius: 1, background: 'var(--border-strong)',
          }}
        />
      </div>
      {/* 눈금마다 이름을 붙이면 바가 다시 버튼 네 개처럼 읽혀서, 지금 값 하나만 적는다 */}
      <div style={{
        marginTop: 3, textAlign: 'center',
        fontSize: 'var(--fs-caption)', fontWeight: 700,
        color: value === 0 ? 'var(--warning)' : value === 1 && exact ? 'var(--text-muted)' : 'var(--sogang-red)',
      }}>
        {scaleLabel(value)}
      </div>
    </div>
  )
}
