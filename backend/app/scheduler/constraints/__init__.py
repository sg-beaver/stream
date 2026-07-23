"""Hard/Soft 제약조건 클래스."""

from .base import Constraint, ModelContext
from .hard import (
    BiweeklyDeptGyobiLimitConstraint,
    MonthlyGukgaLimitConstraint,
    StaffingBoundsConstraint,
    WeeklyHourLimitConstraint,
)
from .soft import (
    AvoidRangeConstraint,
    ContiguityConstraint,
    ExamProximityConstraint,
    FairHoursConstraint,
    MealBreakConstraint,
    MorningRulesConstraint,
    NonCampusDayConstraint,
    PreferenceMatchConstraint,
    PreferredStaffingConstraint,
)

DEFAULT_HARD_CONSTRAINTS = [
    StaffingBoundsConstraint,
    WeeklyHourLimitConstraint,
    MonthlyGukgaLimitConstraint,
    BiweeklyDeptGyobiLimitConstraint,
]

DEFAULT_SOFT_CONSTRAINTS = [
    PreferredStaffingConstraint,
    PreferenceMatchConstraint,
    ContiguityConstraint,
    MealBreakConstraint,
    MorningRulesConstraint,
    ExamProximityConstraint,
    AvoidRangeConstraint,
    NonCampusDayConstraint,
    FairHoursConstraint,
]

__all__ = [
    "Constraint",
    "ModelContext",
    "DEFAULT_HARD_CONSTRAINTS",
    "DEFAULT_SOFT_CONSTRAINTS",
    *(c.__name__ for c in DEFAULT_HARD_CONSTRAINTS),
    *(c.__name__ for c in DEFAULT_SOFT_CONSTRAINTS),
]
