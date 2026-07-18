"""근로학생 도메인 모델.

시간표 수합 시 '근무 가능 시간'과 '근무 희망 시간'을 분리해서 받는다.
수업 시간표(SAINT 연동 전제)는 별도로 보관하며, 어떤 예외 규칙에서도
안전하도록 가능 시간에서 항상 수업 시간을 방어적으로 제외한다.
"""

from dataclasses import dataclass, field
from datetime import date

from .calendar import AcademicCalendar
from .enums import FundingType, Weekday
from .timegrid import str_to_minutes


@dataclass
class WeeklyTimeMap:
    """요일별 반복 시간 구간 (수합된 가능/희망 시간, 수업 시간표 공용)."""

    ranges: dict[Weekday, list[tuple[int, int]]] = field(default_factory=dict)

    def contains(self, weekday: Weekday, minute: int) -> bool:
        return any(s <= minute < e for s, e in self.ranges.get(weekday, []))

    @classmethod
    def from_dict(cls, raw: dict[str, list[list[str]]]) -> "WeeklyTimeMap":
        return cls(
            ranges={
                Weekday.from_key(day): [
                    (str_to_minutes(s), str_to_minutes(e)) for s, e in slots
                ]
                for day, slots in raw.items()
            }
        )


@dataclass(frozen=True)
class ExamSlot:
    """시험 일시 (시험 직전 배정 회피용)."""

    day: date
    start_min: int
    end_min: int


@dataclass(frozen=True)
class AvoidRange:
    """특정 날짜의 근무 회피 요청 (축제 당일 저녁 등) — Soft."""

    day: date
    start_min: int
    end_min: int


@dataclass
class StudentPreferences:
    """근무학생 개인 편의 옵션 (적용 유무는 학생별 선택)."""

    # 마감(폐관 슬롯) 근무 다음 날 아침 근무 제외 희망 여부
    no_morning_after_close: bool = True
    # 아침 근무 최대 연속 일수 (0 = 아침 근무 불가능)
    max_consecutive_morning_days: int = 6
    # 주당 아침 근무 최대 일수 (0 = 아침 근무 불가능)
    max_morning_days_per_week: int = 6
    # 식사 시간 보장 희망 여부
    wants_meal_break: bool = True
    # (학기 중) 원래 학교에 오는 요일 — 통학 부담 고려. 빈 리스트면 미적용.
    campus_days: list[Weekday] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict) -> "StudentPreferences":
        return cls(
            no_morning_after_close=raw.get("no_morning_after_close", True),
            max_consecutive_morning_days=raw.get("max_consecutive_morning_days", 6),
            max_morning_days_per_week=raw.get("max_morning_days_per_week", 6),
            wants_meal_break=raw.get("wants_meal_break", True),
            campus_days=[Weekday.from_key(d) for d in raw.get("campus_days", [])],
        )

    @property
    def morning_forbidden(self) -> bool:
        return (
            self.max_morning_days_per_week == 0 or self.max_consecutive_morning_days == 0
        )


@dataclass
class Student:
    """근로학생."""

    student_id: str
    name: str
    funding_type: FundingType
    available: WeeklyTimeMap  # 근무 가능 시간 (수합)
    preferred: WeeklyTimeMap  # 근무 희망 시간 (수합, available의 부분집합 권장)
    class_times: WeeklyTimeMap  # 수업 시간표 (SAINT 연동)
    exams: list[ExamSlot] = field(default_factory=list)
    unavailable_dates: set[date] = field(default_factory=set)  # 특정일 근무 불가 (Hard)
    avoid_ranges: list[AvoidRange] = field(default_factory=list)  # 회피 희망 (Soft)
    preferences: StudentPreferences = field(default_factory=StudentPreferences)

    def can_work(self, day: date, minute: int, calendar: AcademicCalendar) -> bool:
        """해당 슬롯 근무 가능 여부 (Hard Constraint를 변수 생성 단계에서 반영).

        규칙:
        - 특정일 근무 불가 날짜는 배정 불가
        - 교내 휴강일(부활절 등): 교비는 수업 시간표와 무관하게 근무 가능,
          국가는 해당일 근로 자체가 불가능
        - 공휴일: 수업이 없으므로 수업 시간표와 무관하게 근무 가능
        - 그 외(정규/계절학기, 시험 기간 포함): 수업 시간에는 절대 근무 불가
        """
        if day in self.unavailable_dates:
            return False

        weekday = Weekday(day.weekday())
        if calendar.is_school_only_holiday(day):
            if self.funding_type == FundingType.GUKGA:
                return False
            return self._declared_or_class(weekday, minute)
        if calendar.is_public_holiday(day):
            return self._declared_or_class(weekday, minute)

        # 수업이 진행되는 날: 시험 기간이어도 기존 수업 시간은 근로 불가
        return self.available.contains(weekday, minute) and not self.class_times.contains(
            weekday, minute
        )

    def _declared_or_class(self, weekday: Weekday, minute: int) -> bool:
        """휴강일: 수합된 가능 시간 + 원래 수업이라 못 냈던 시간 모두 가능."""
        return self.available.contains(weekday, minute) or self.class_times.contains(
            weekday, minute
        )

    def is_preferred(self, day: date, minute: int) -> bool:
        return self.preferred.contains(Weekday(day.weekday()), minute)

    def has_class(self, day: date, minute: int, calendar: AcademicCalendar) -> bool:
        """식사 시간 판단용: 수업으로 실제로 바쁜 슬롯인지.

        시험 기간에는 시험 없는 기존 수업 시간이 휴강이므로 식사 가능한
        시간으로 간주한다.
        """
        if not calendar.classes_run(day) or calendar.is_exam_period(day):
            return False
        return self.class_times.contains(Weekday(day.weekday()), minute)

    @classmethod
    def from_dict(cls, raw: dict) -> "Student":
        return cls(
            student_id=raw["student_id"],
            name=raw["name"],
            funding_type=FundingType(raw["funding_type"]),
            available=WeeklyTimeMap.from_dict(raw.get("available", {})),
            preferred=WeeklyTimeMap.from_dict(raw.get("preferred", {})),
            class_times=WeeklyTimeMap.from_dict(raw.get("class_times", {})),
            exams=[
                ExamSlot(
                    day=date.fromisoformat(e["date"]),
                    start_min=str_to_minutes(e["start"]),
                    end_min=str_to_minutes(e["end"]),
                )
                for e in raw.get("exams", [])
            ],
            unavailable_dates={
                date.fromisoformat(d) for d in raw.get("unavailable_dates", [])
            },
            avoid_ranges=[
                AvoidRange(
                    day=date.fromisoformat(a["date"]),
                    start_min=str_to_minutes(a["start"]),
                    end_min=str_to_minutes(a["end"]),
                )
                for a in raw.get("avoid_ranges", [])
            ],
            preferences=StudentPreferences.from_dict(raw.get("preferences", {})),
        )
