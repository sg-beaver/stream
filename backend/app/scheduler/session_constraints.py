"""담당자가 대화 중에 건 임시 제약을 도메인에 얹는다 (#254).

챗봇에서 "김현서 학생은 월요일에 근무하지 않도록 해줘"라고 하면, 그 요청은
개별 배정 편집이 아니라 **제약조건 추가**다. 조건을 여기 담긴 형식으로 세션에
쌓아 두고 `generate_schedule`에 실어 보내면, 솔버가 그 조건을 반영한 문제를
처음부터 다시 푼다 — 빠진 자리는 다른 학생으로 메워지고, 나머지 soft
constraint 균형도 솔버가 다시 잡는다.

제약은 **가용시간을 깎지 않고** `Student.blocked_ranges`로 얹는다. 학생이 낸
값을 그대로 두어야 제약을 걷었을 때(되돌리기) 원래 문제로 정확히 돌아간다.

세션 배율(`session_weight_scales`, #136)과 같은 수명을 갖는다 — 세션 안에만
머물고 부서 정책·학생 제출 데이터는 건드리지 않는다.
"""

import copy
from dataclasses import dataclass
from datetime import date, timedelta

from .domain import BlockedRange, Student

DAY_NAMES = {1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토", 7: "일"}

_DAY_START_MIN = 0
_DAY_END_MIN = 24 * 60


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def to_minutes(value: str) -> int:
    """'09:30' → 570. 형식이 어긋나면 사람이 읽는 사유로 거절한다."""
    try:
        hour, minute = value.strip().split(":")
        total = int(hour) * 60 + int(minute)
    except (ValueError, AttributeError):
        raise ValueError(f"시각 형식이 올바르지 않습니다: {value} (예: 09:00)")
    if not 0 <= total <= _DAY_END_MIN:
        raise ValueError(f"시각이 범위를 벗어났습니다: {value}")
    return total


@dataclass(frozen=True)
class StudentUnavailable:
    """학생 한 명의 근무 불가 조건 하나.

    - `weekday`(ISO 1=월~7=일)를 주면 기간 안의 그 요일 전부에 적용된다
    - `dates`를 주면 그 날짜에만 적용된다
    - 시각을 비우면 종일이다
    """

    student_id: str
    student_name: str
    weekday: int | None = None
    dates: tuple[date, ...] = ()
    start_min: int = _DAY_START_MIN
    end_min: int = _DAY_END_MIN

    def __post_init__(self):
        if (self.weekday is None) == (not self.dates):
            raise ValueError("요일과 날짜 중 정확히 하나를 지정해야 합니다.")
        if self.weekday is not None and self.weekday not in DAY_NAMES:
            raise ValueError(f"요일 값이 올바르지 않습니다: {self.weekday}")
        if self.start_min >= self.end_min:
            raise ValueError("시작 시각은 종료 시각보다 앞서야 합니다.")

    # -- 직렬화 (chat_session.session_constraints JSONB) -------------------
    def to_dict(self) -> dict:
        return {
            "student_id": self.student_id,
            "student_name": self.student_name,
            "weekday": self.weekday,
            "dates": [d.isoformat() for d in self.dates],
            "start_time": _hhmm(self.start_min),
            "end_time": _hhmm(self.end_min),
        }

    @classmethod
    def from_dict(cls, raw: dict) -> "StudentUnavailable":
        return cls(
            student_id=raw["student_id"],
            student_name=raw.get("student_name", raw["student_id"]),
            weekday=raw.get("weekday"),
            dates=tuple(date.fromisoformat(d) for d in raw.get("dates") or ()),
            start_min=to_minutes(raw.get("start_time") or "00:00"),
            end_min=to_minutes(raw.get("end_time") or "24:00"),
        )

    @property
    def key(self) -> tuple:
        """같은 조건인지 비교하는 값 — 중복 추가·제거 대상 판정에 쓴다."""
        return (self.student_id, self.weekday, self.dates, self.start_min, self.end_min)

    @property
    def all_day(self) -> bool:
        return self.start_min <= _DAY_START_MIN and self.end_min >= _DAY_END_MIN

    def describe(self) -> str:
        """담당자·모델이 읽는 한 줄. 컨텍스트와 툴 결과에 같은 문장을 쓴다."""
        if self.weekday is not None:
            when = f"{DAY_NAMES[self.weekday]}요일"
        else:
            when = ", ".join(d.isoformat() for d in self.dates)
        span = "종일" if self.all_day else f"{_hhmm(self.start_min)}~{_hhmm(self.end_min)}"
        return f"{self.student_name} 학생 {when} {span} 근무 불가"

    def days_within(self, period_start: date, period_end: date) -> list[date]:
        if self.weekday is not None:
            days, day = [], period_start
            while day <= period_end:
                if day.isoweekday() == self.weekday:
                    days.append(day)
                day += timedelta(days=1)
            return days
        return [d for d in self.dates if period_start <= d <= period_end]


def parse_constraints(raw: list | None) -> list[StudentUnavailable]:
    """세션에 저장된 JSON 목록 → 도메인 객체."""
    return [StudentUnavailable.from_dict(item) for item in raw or []]


def apply_to_students(
    students: list[Student],
    constraints: list[StudentUnavailable] | None,
    period_start: date,
    period_end: date,
) -> list[Student]:
    """제약을 학생의 `blocked_ranges`로 얹는다. 원본 리스트는 그대로 둔다.

    기간 밖 날짜는 버린다 — 솔버 그리드에 없는 날짜라 의미가 없고, 남겨 두면
    "적용됐다"고 보고한 조건이 실제로는 아무 데도 걸리지 않는다.
    """
    if not constraints:
        return students

    blocks: dict[str, list[BlockedRange]] = {}
    for c in constraints:
        for day in c.days_within(period_start, period_end):
            blocks.setdefault(c.student_id, []).append(
                BlockedRange(day=day, start_min=c.start_min, end_min=c.end_min)
            )
    if not blocks:
        return students

    result = []
    for student in students:
        extra = blocks.get(student.student_id)
        if not extra:
            result.append(student)
            continue
        # dataclasses.replace가 아니라 얕은 복사 — 이 함수가 바꾸는 건
        # blocked_ranges 하나뿐이라 나머지 필드는 원본과 공유해도 안전하다
        clone = copy.copy(student)
        clone.blocked_ranges = list(student.blocked_ranges) + extra
        result.append(clone)
    return result
