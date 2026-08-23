"""스케줄러 도메인 모델."""

from .enums import FundingType, PeriodType, Weekday
from .timegrid import TimeGrid, minutes_to_str, str_to_minutes
from .policy import DepartmentPolicy, validate_work_slots_tiling
from .calendar import AcademicCalendar, OpeningHoursResolver
from .student import DaySchedule, Student, StudentPreferences, WeeklyTimeMap
from .result import ScheduleResult, SlotShortage

__all__ = [
    "FundingType",
    "PeriodType",
    "Weekday",
    "TimeGrid",
    "minutes_to_str",
    "str_to_minutes",
    "DepartmentPolicy",
    "validate_work_slots_tiling",
    "AcademicCalendar",
    "OpeningHoursResolver",
    "DaySchedule",
    "Student",
    "StudentPreferences",
    "WeeklyTimeMap",
    "ScheduleResult",
    "SlotShortage",
]
