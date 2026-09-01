import TimeGrid from '../ui/TimeGrid'
import { dayHourTotals, fmtHours } from '../../utils/scheduleGrid'

// 학생 한 명의 한 주 근무 시간표 — 확정 근무·가능 시간·수업 시간을 한 격자에 겹쳐 그린다.
// 표를 두 개로 나누면 같은 격자를 두 번 그리면서 위아래로 눈을 옮겨야 겹침을 알 수 있다.
//
// 학생 관리 화면과 근무표 편성의 '확정 근무 시간표' 탭이 같은 표를 쓴다 — 두 화면의
// 색·라벨이 갈리면 같은 값을 보고도 다르게 읽는다. 데이터는 부르는 쪽이 준비하고(화면마다
// 이미 받아 둔 응답이 다르다), 이 컴포넌트는 그리기만 한다.

// 확정 근무 칸 — 가능 시간(연초록 --success-50)과 같은 계열의 진한 초록이라,
// '가능하다고 낸 시간 중 실제로 잡힌 시간'이라는 관계가 색으로 읽힌다
export const WORK_FILL = 'var(--success)'

// 초안 화면에서도 같은 표를 쓰지만 색과 말은 그 화면 것을 따른다 — 초록은 이 앱에서
// '확정된 근무'라, 아직 확정 전인 초안을 초록으로 칠하면 확정된 것처럼 읽힌다.
export default function StudentWorkTimetable({
  rows, workSlotKeys, availSlotKeys = [], lectureSlotKeys = [], closedSlots = [], availHours,
  workFill = WORK_FILL, workLabel = '근무', workLegendLabel = '확정 근무', daySubLabels,
}) {
  const workHours = workSlotKeys.length * 0.5
  return (
    <TimeGrid
      rows={rows} rowHeight={17}
      daySubLabels={daySubLabels}
      // 확정 근무를 '채워진 칸'으로 올린다 — 진초록 배경 + 흰 글씨 '근무'.
      // 같은 칸에 수업이 있어도 근무가 우선한다 (TimeGrid 규칙)
      classSlots={workSlotKeys}
      slotLabels={Object.fromEntries(workSlotKeys.map(k => [k, workLabel]))}
      slotColors={Object.fromEntries(workSlotKeys.map(k => [k, workFill]))}
      classLegendText={`${workLegendLabel}: 총 ${fmtHours(workHours)}시간`}
      classLegendColor={workFill}
      lectureSlots={lectureSlotKeys}
      lectureLegendText="수업 시간"
      classLabel="수업"
      // 개관 밖이라 근무 자체가 없는 칸 — 비어 있는 것과 구분해야 '왜 여기는 안 잡혔나'를 묻지 않는다
      disabledSlots={closedSlots}
      disabledLegendText="근무 없음"
      availableSlots={availSlotKeys}
      availableLegendText={`근무 가능 시간: 총 ${fmtHours(availHours ?? availSlotKeys.length * 0.5)}시간`}
      footer={{ label: '가능 시간', values: dayHourTotals(availSlotKeys) }}
    />
  )
}
