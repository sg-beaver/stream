"""스케줄링 결과 모델."""

from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class PenaltyEvent:
    """풀이 후 실제로 발생한 Soft Constraint 위반 1건 (설명 기능용)."""

    name: str  # 제약 이름
    cost: int  # weight × 위반량
    amount: int  # 위반량 (부족 인원 수, 미달 슬롯 수 등)
    student_id: str | None = None
    day: date | None = None
    minute: int | None = None


@dataclass(frozen=True)
class SlotShortage:
    """최소 인원 미달 슬롯 (담당자에게 부족 시간대를 알려주기 위한 리포트)."""

    day: date
    slot_min: int
    required: int
    assigned: int


@dataclass
class ScheduleResult:
    """최종 배정 결과."""

    status: str  # OPTIMAL | FEASIBLE | INFEASIBLE
    # assignments[날짜][슬롯 시작 분] = 배정된 학생 ID 목록
    assignments: dict[date, dict[int, list[str]]] = field(default_factory=dict)
    shortages: list[SlotShortage] = field(default_factory=list)
    objective_value: int | None = None
    # Soft Constraint별 페널티 합계 (어떤 제약이 얼마나 희생됐는지 설명용)
    penalty_breakdown: dict[str, int] = field(default_factory=dict)
    # 실제 발생한 위반 이벤트 목록 (누구/언제/무엇 — 근거 표시용)
    penalty_events: list[PenaltyEvent] = field(default_factory=list)
    solve_time_seconds: float = 0.0

    @property
    def is_feasible(self) -> bool:
        return self.status in ("OPTIMAL", "FEASIBLE")

    def slots_of_student(self, student_id: str) -> dict[date, list[int]]:
        """학생별 배정 슬롯 (개인별 시간표 시각화·집계용)."""
        result: dict[date, list[int]] = {}
        for day, by_slot in self.assignments.items():
            slots = [m for m, sids in by_slot.items() if student_id in sids]
            if slots:
                result[day] = sorted(slots)
        return result
