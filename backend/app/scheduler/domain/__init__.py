"""스케줄러 도메인 모델."""

from .enums import FundingType, PeriodType, Weekday
from .timegrid import TimeGrid, minutes_to_str, str_to_minutes
from .policy import (
    DepartmentPolicy,
    StaffingPolicy,
    WorkSlotBlock,
    parse_work_slot_block,
    resolve_slot_staffing,
    validate_work_slots_tiling,
)
from .calendar import AcademicCalendar, OpeningHoursResolver, Term
from .student import (
    AvoidRange,
    BlockedRange,
    DaySchedule,
    Student,
    StudentPreferences,
    WeeklyTimeMap,
)
from .result import ScheduleResult, SlotShortage

__all__ = [
    "FundingType",
    "PeriodType",
    "Weekday",
    "TimeGrid",
    "minutes_to_str",
    "str_to_minutes",
    "DepartmentPolicy",
    "StaffingPolicy",
    "WorkSlotBlock",
    "parse_work_slot_block",
    "resolve_slot_staffing",
    "validate_work_slots_tiling",
    "AcademicCalendar",
    "OpeningHoursResolver",
    "Term",
    "AvoidRange",
    "BlockedRange",
    "DaySchedule",
    "Student",
    "StudentPreferences",
    "WeeklyTimeMap",
    "ScheduleResult",
    "SlotShortage",
]
