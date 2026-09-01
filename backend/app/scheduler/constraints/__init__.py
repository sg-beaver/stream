"""Hard/Soft 제약조건 클래스."""

from .base import Constraint, ModelContext
from .hard import (
    BiweeklyDeptGyobiLimitConstraint,
    MonthlyGukgaLimitConstraint,
    StaffingBoundsConstraint,
    WeeklyHourLimitConstraint,
    WorkSlotBlockConstraint,
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
    WorkSlotBlockConstraint,
    StaffingBoundsConstraint,
    WeeklyHourLimitConstraint,
    MonthlyGukgaLimitConstraint,
    BiweeklyDeptGyobiLimitConstraint,
]

# PreferenceMatchConstraint는 당분간 빼 둔다 — 학생 화면이 가능 시간을 낼 때
# slot_preferences를 보내지 않아 모든 슬롯이 2(가능)로 저장되고, '희망'으로 치는
# 3(상)이 하나도 만들어지지 않는다 (service._PREFERRED_THRESHOLD = 3).
# 그 상태로 두면 배정된 모든 슬롯에 '희망 외' 페널티가 붙어, 목적함수가 "적게
# 배정할수록 이득"인 쪽으로 기울고 식사·연속 근무 같은 다른 기준을 밀어낸다.
# 학생 화면에 희망/가능 구분이 들어오면 아래 목록에 되살린다.
DEFAULT_SOFT_CONSTRAINTS = [
    PreferredStaffingConstraint,
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
    # 기본 목록에서는 빠졌지만 클래스는 계속 내보낸다 (되살릴 때·테스트용)
    "PreferenceMatchConstraint",
    *(c.__name__ for c in DEFAULT_HARD_CONSTRAINTS),
    *(c.__name__ for c in DEFAULT_SOFT_CONSTRAINTS),
]
