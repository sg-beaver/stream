"""스케줄러 도메인 모델."""

from .enums import FundingType, PeriodType, Weekday
from .timegrid import TimeGrid, minutes_to_str, str_to_minutes
from .policy import DepartmentPolicy
from .calendar import AcademicCalendar, OpeningHoursResolver
from .student import Student, StudentPreferences, WeeklyTimeMap
from .result import ScheduleResult, SlotShortage

__all__ = [
    "FundingType",
    "PeriodType",
    "Weekday",
    "TimeGrid",
    "minutes_to_str",
    "str_to_minutes",
    "DepartmentPolicy",
    "AcademicCalendar",
    "OpeningHoursResolver",
    "Student",
    "StudentPreferences",
    "WeeklyTimeMap",
    "ScheduleResult",
    "SlotShortage",
]
