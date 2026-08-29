"""제약조건 공통 기반.

모든 제약조건은 Constraint를 상속하고 apply(ctx)에서 CP-SAT 모델에
제약(Hard) 또는 페널티 항(Soft)을 추가한다. 새 제약이 필요하면 클래스를
하나 추가하고 기본 목록(constraints/__init__.py)에 등록하면 된다.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date

from ortools.sat.python import cp_model

from ..domain import (
    AcademicCalendar,
    DepartmentPolicy,
    Student,
    TimeGrid,
    WorkSlotBlock,
    resolve_slot_staffing,
)


@dataclass
class PenaltyTerm:
    """목적함수에 더해지는 Soft Constraint 페널티 항 (weight × var).

    student_id/day/minute는 '이 페널티가 어디서 발생했는가'를 설명하기 위한
    위치 메타데이터 (결과 리포트의 설명 기능용, 해당 없으면 None).
    """

    name: str  # 제약 이름 (결과 breakdown 집계 키)
    weight: int
    var: cp_model.IntVar
    student_id: str | None = None
    day: date | None = None
    minute: int | None = None


@dataclass
class ModelContext:
    """모델 구축에 필요한 모든 것을 담는 컨텍스트.

    variables[(student_id, 날짜, 슬롯 분)] = 배정 여부 BoolVar.
    변수는 개관 슬롯 ∧ 학생이 근무 가능한 슬롯에만 생성되므로,
    '가능 시간·수업 시간·개관 시간' Hard Constraint는 변수 도메인에
    이미 인코딩되어 있다.
    """

    model: cp_model.CpModel
    grid: TimeGrid
    policy: DepartmentPolicy
    calendar: AcademicCalendar
    students: list[Student]
    variables: dict[tuple[str, date, int], cp_model.IntVar]
    penalty_terms: list[PenaltyTerm] = field(default_factory=list)
    # 최소 인원 미달 허용 시 슬롯별 부족 인원 변수 (결과 리포트용)
    shortage_vars: dict[tuple[date, int], cp_model.IntVar] = field(default_factory=dict)
    # day_blocks[날짜] = 부서 정의 근무 블록 [WorkSlotBlock, ...] (#89).
    # 특별일 개관 구간으로 클리핑된 결과. 빈 목록이면 그 날짜는 자유 그리드.
    day_blocks: dict[date, list[WorkSlotBlock]] = field(default_factory=dict)

    def staffing_bounds(self, day: date, minute: int) -> tuple[int, int]:
        """그 슬롯에 적용할 (최소, 최대) 배정 인원 (#171)."""
        return resolve_slot_staffing(
            self.day_blocks.get(day, []), self.policy.staffing, minute
        )

    @property
    def slot_minutes(self) -> int:
        return self.grid.slot_minutes

    def var(self, student_id: str, day: date, minute: int) -> cp_model.IntVar | None:
        return self.variables.get((student_id, day, minute))

    def student_day_vars(self, student_id: str, day: date) -> list[cp_model.IntVar]:
        return [
            v
            for m in self.grid.slots_of(day)
            if (v := self.variables.get((student_id, day, m))) is not None
        ]

    def slot_vars(self, day: date, minute: int) -> list[cp_model.IntVar]:
        return [
            v
            for s in self.students
            if (v := self.variables.get((s.student_id, day, minute))) is not None
        ]

    def add_penalty(
        self,
        name: str,
        weight: int,
        var: cp_model.IntVar,
        student_id: str | None = None,
        day: date | None = None,
        minute: int | None = None,
    ) -> None:
        # 부서 담당자가 정한 카테고리별 중요도 배율을 여기서 한 번에 반영한다.
        # 모든 Soft Constraint가 이 메서드를 거치므로 제약마다 따로 손댈 필요가 없다.
        scaled = round(weight * self.policy.penalty_scale(name))
        if scaled > 0:
            self.penalty_terms.append(
                PenaltyTerm(name, scaled, var, student_id, day, minute)
            )

    def new_bool(self, name: str) -> cp_model.IntVar:
        return self.model.NewBoolVar(name)

    def new_int(self, lo: int, hi: int, name: str) -> cp_model.IntVar:
        return self.model.NewIntVar(lo, hi, name)


class Constraint(ABC):
    """제약조건 기반 클래스."""

    name: str = "constraint"

    @abstractmethod
    def apply(self, ctx: ModelContext) -> None: ...
