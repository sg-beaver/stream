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


@dataclass
class DaySchedule:
    """특정 날짜의 가용시간 (엑셀 임포트 등 날짜 단위 수합용).

    주간 반복(WeeklyTimeMap) 대신 실제 날짜별로 수합된 데이터를 담는다.
    available은 preferred를 포함해야 한다 (임포터에서 보장).
    """

    available: list[tuple[int, int]] = field(default_factory=list)
    preferred: list[tuple[int, int]] = field(default_factory=list)
    classes: list[tuple[int, int]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict) -> "DaySchedule":
        def ranges(key):
            return [(str_to_minutes(s), str_to_minutes(e)) for s, e in raw.get(key, [])]

        return cls(
            available=ranges("available"),
            preferred=ranges("preferred"),
            classes=ranges("classes"),
        )


def _contains(ranges: list[tuple[int, int]], minute: int) -> bool:
    return any(s <= minute < e for s, e in ranges)


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


@dataclass(frozen=True)
class BlockedRange:
    """담당자가 건 근무 불가 구간 — Hard (#254).

    학생이 낸 `unavailable_dates`와 분리한다. 출처가 다르고(학생 제출 vs 담당자
    지시), 챗봇 세션에서 얹히는 임시 값이라 학생 데이터에 섞이면 다음 생성 때
    누가 넣은 값인지 알 수 없게 된다.
    """

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
    # 담당자가 건 근무 불가 구간 (Hard, #254) — 챗봇 세션 제약이 여기로 들어온다.
    # 가용시간을 깎지 않고 별도 필드로 두는 이유: 학생이 낸 값을 보존해야
    # 제약을 걷었을 때 원래 상태로 되돌아온다
    blocked_ranges: list[BlockedRange] = field(default_factory=list)
    avoid_ranges: list[AvoidRange] = field(default_factory=list)  # 회피 희망 (Soft)
    preferences: StudentPreferences = field(default_factory=StudentPreferences)
    # 날짜 단위 수합 데이터 — 있으면 주간 반복(available/preferred/class_times) 대신 사용
    date_schedule: dict[date, DaySchedule] | None = None
    active_from: date | None = None  # 근무 시작일 (이전 날짜 배정 불가)
    active_until: date | None = None  # 근무 종료일 (이후 날짜 배정 불가)
    # (연, 월) → 스케줄링 기간 **밖**에서 이미 잡혀 있는 근로 시간 (#159 후속).
    # 월 상한(HC-TIME-3)은 한 달 전체가 기준인데 생성은 보통 2주씩 끊어서 한다.
    # 이 값이 없으면 같은 달을 두 번 생성할 때 각 회차가 상한 안이라도 월 합계는
    # 넘어간다 — 실제로 9월을 2주씩 두 번 생성하니 58h·63h가 나왔다.
    prior_monthly_hours: dict[tuple[int, int], float] = field(default_factory=dict)
    # (ISO 연, ISO 주) → 스케줄링 기간 **밖**에서 이미 잡혀 있는 근로 시간.
    # 위 월 상한과 같은 이유다. 주 상한(HC-TIME-2)도 ISO 주(월~일) 전체가 기준인데
    # 생성 그리드 안의 슬롯만 세면 한 ISO 주가 회차마다 상한을 새로 받는다 — 09-01~09-07,
    # 09-08~09-14를 잇달아 생성하니 경계 주(ISO 37)에 19.5h가 잡혔다 (상한 14h).
    # 부서·수동 등록·대타로 이미 잡힌 시간도 여기 들어온다. 확정 검증(work_hours.py)이
    # 부서를 가리지 않고 합산하므로, 이걸 빼지 않으면 솔버는 통과하고 확정이 400으로 막는다.
    prior_weekly_hours: dict[tuple[int, int], float] = field(default_factory=dict)

    def can_work(self, day: date, minute: int, calendar: AcademicCalendar) -> bool:
        """해당 슬롯 근무 가능 여부 (Hard Constraint를 변수 생성 단계에서 반영).

        규칙:
        - 활동 기간(근무 시작/종료일) 밖이거나 특정일 근무 불가 날짜는 배정 불가
        - 담당자가 건 근무 불가 구간(blocked_ranges)은 휴강일 예외보다 앞선다 —
          "월요일엔 근무하지 않도록"이 공휴일에만 되살아나면 지시가 무너진다
        - 교내 휴강일(부활절 등): 교비는 수업 시간표와 무관하게 근무 가능,
          국가는 해당일 근로 자체가 불가능
        - 공휴일: 수업이 없으므로 수업 시간표와 무관하게 근무 가능
        - 그 외(정규/계절학기, 시험 기간 포함): 수업 시간에는 절대 근무 불가
        """
        if day in self.unavailable_dates:
            return False
        if any(
            b.day == day and b.start_min <= minute < b.end_min for b in self.blocked_ranges
        ):
            return False
        if self.active_from and day < self.active_from:
            return False
        if self.active_until and day > self.active_until:
            return False

        school_only = calendar.is_school_only_holiday(day)
        if school_only and self.funding_type == FundingType.GUKGA:
            return False
        class_free = school_only or calendar.is_public_holiday(day)  # 수업이 없는 날

        if self.date_schedule is not None:
            sched = self.date_schedule.get(day)
            if sched is None:
                return False
            if class_free:
                return _contains(sched.available, minute) or _contains(sched.classes, minute)
            return _contains(sched.available, minute) and not _contains(sched.classes, minute)

        weekday = Weekday(day.weekday())
        if class_free:
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
        if self.date_schedule is not None:
            sched = self.date_schedule.get(day)
            return sched is not None and _contains(sched.preferred, minute)
        return self.preferred.contains(Weekday(day.weekday()), minute)

    def has_class(self, day: date, minute: int, calendar: AcademicCalendar) -> bool:
        """식사 시간 판단용: 수업으로 실제로 바쁜 슬롯인지.

        시험 기간에는 시험 없는 기존 수업 시간이 휴강이므로 식사 가능한
        시간으로 간주한다.
        """
        if not calendar.classes_run(day) or calendar.is_exam_period(day):
            return False
        if self.date_schedule is not None:
            sched = self.date_schedule.get(day)
            return sched is not None and _contains(sched.classes, minute)
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
            blocked_ranges=[
                BlockedRange(
                    day=date.fromisoformat(b["date"]),
                    start_min=str_to_minutes(b["start"]),
                    end_min=str_to_minutes(b["end"]),
                )
                for b in raw.get("blocked_ranges", [])
            ],
            avoid_ranges=[
                AvoidRange(
                    day=date.fromisoformat(a["date"]),
                    start_min=str_to_minutes(a["start"]),
                    end_min=str_to_minutes(a["end"]),
                )
                for a in raw.get("avoid_ranges", [])
            ],
            preferences=StudentPreferences.from_dict(raw.get("preferences", {})),
            date_schedule=(
                {
                    date.fromisoformat(d): DaySchedule.from_dict(s)
                    for d, s in raw["date_schedule"].items()
                }
                if "date_schedule" in raw
                else None
            ),
            active_from=(
                date.fromisoformat(raw["active_from"]) if raw.get("active_from") else None
            ),
            active_until=(
                date.fromisoformat(raw["active_until"]) if raw.get("active_until") else None
            ),
        )
