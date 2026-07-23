"""근무 시간표 CP-SAT 솔버.

흐름:
1. 학사 캘린더 + 부서 정책으로 날짜별 개관 슬롯 그리드 구성
2. (학생, 날짜, 슬롯) 배정 변수 생성 — Student.can_work()가 True인
   슬롯에만 변수를 만들어 가능/수업/개관 Hard Constraint를 도메인에 인코딩
3. Hard/Soft Constraint 적용 (Soft는 가중 페널티 항 등록)
4. 페널티 합 최소화로 풀고 결과·부족 슬롯·페널티 내역 추출
"""

from datetime import date

from ortools.sat.python import cp_model

from ..constraints import DEFAULT_HARD_CONSTRAINTS, DEFAULT_SOFT_CONSTRAINTS
from ..constraints.base import Constraint, ModelContext
from ..domain import (
    AcademicCalendar,
    DepartmentPolicy,
    OpeningHoursResolver,
    ScheduleResult,
    SlotShortage,
    Student,
    TimeGrid,
)
from ..domain.result import PenaltyEvent


class ScheduleSolver:
    """부서 하나의 스케줄링 요청을 풀어내는 솔버."""

    def __init__(
        self,
        policy: DepartmentPolicy,
        calendar: AcademicCalendar,
        students: list[Student],
        start_date: date,
        num_days: int,
        constraints: list[Constraint] | None = None,
    ):
        self.policy = policy
        self.calendar = calendar
        self.students = students
        self.start_date = start_date
        self.num_days = num_days
        self.constraints = (
            constraints
            if constraints is not None
            else [c() for c in DEFAULT_HARD_CONSTRAINTS + DEFAULT_SOFT_CONSTRAINTS]
        )

    def build_grid(self) -> TimeGrid:
        grid = TimeGrid(self.start_date, self.num_days, self.policy.slot_minutes)
        resolver = OpeningHoursResolver(self.policy, self.calendar)
        for day in grid.dates:
            rng = resolver.resolve(day)
            grid.set_open_range(day, *(rng if rng else (None, None)))
        return grid

    def build_context(self) -> ModelContext:
        grid = self.build_grid()
        model = cp_model.CpModel()
        variables: dict[tuple[str, date, int], cp_model.IntVar] = {}
        for student in self.students:
            for day in grid.dates:
                for minute in grid.slots_of(day):
                    if student.can_work(day, minute, self.calendar):
                        variables[(student.student_id, day, minute)] = model.NewBoolVar(
                            f"x_{student.student_id}_{day}_{minute}"
                        )
        ctx = ModelContext(
            model=model,
            grid=grid,
            policy=self.policy,
            calendar=self.calendar,
            students=self.students,
            variables=variables,
        )
        for constraint in self.constraints:
            constraint.apply(ctx)
        return ctx

    def solve(self, time_limit_seconds: float = 30.0) -> tuple[ScheduleResult, ModelContext]:
        ctx = self.build_context()
        if ctx.penalty_terms:
            ctx.model.Minimize(sum(t.weight * t.var for t in ctx.penalty_terms))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit_seconds
        status = solver.Solve(ctx.model)
        status_name = solver.StatusName(status)

        result = ScheduleResult(status=status_name)
        result.solve_time_seconds = solver.WallTime()
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return result, ctx

        result.objective_value = int(solver.ObjectiveValue())
        for day in ctx.grid.dates:
            by_slot: dict[int, list[str]] = {}
            for minute in ctx.grid.slots_of(day):
                assigned = [
                    s.student_id
                    for s in self.students
                    if (v := ctx.var(s.student_id, day, minute)) is not None
                    and solver.Value(v) == 1
                ]
                if assigned:
                    by_slot[minute] = assigned
            if by_slot:
                result.assignments[day] = by_slot

        for (day, minute), var in ctx.shortage_vars.items():
            missing = solver.Value(var)
            if missing > 0:
                assigned_count = len(result.assignments.get(day, {}).get(minute, []))
                result.shortages.append(
                    SlotShortage(
                        day=day,
                        slot_min=minute,
                        required=self.policy.staffing.min_per_slot,
                        assigned=assigned_count,
                    )
                )
        result.shortages.sort(key=lambda s: (s.day, s.slot_min))

        breakdown: dict[str, int] = {}
        for term in ctx.penalty_terms:
            amount = solver.Value(term.var)
            if amount <= 0:
                continue
            cost = term.weight * amount
            breakdown[term.name] = breakdown.get(term.name, 0) + cost
            result.penalty_events.append(
                PenaltyEvent(
                    name=term.name,
                    cost=cost,
                    amount=amount,
                    student_id=term.student_id,
                    day=term.day,
                    minute=term.minute,
                )
            )
        result.penalty_breakdown = dict(sorted(breakdown.items(), key=lambda kv: -kv[1]))
        return result, ctx
