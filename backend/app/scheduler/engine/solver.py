"""근무 시간표 CP-SAT 솔버.

흐름:
1. 학사 캘린더 + 부서 정책으로 날짜별 개관 슬롯 그리드 구성
2. (학생, 날짜, 슬롯) 배정 변수 생성 — Student.can_work()가 True인
   슬롯에만 변수를 만들어 가능/수업/개관 Hard Constraint를 도메인에 인코딩
3. Hard/Soft Constraint 적용 (Soft는 가중 페널티 항 등록)
4. 페널티 합 최소화로 풀고 결과·부족 슬롯·페널티 내역 추출
"""

import logging
import os
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

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 솔버 종료·결정성 파라미터 (#143·#132). 실측 근거는 LOG.md 2026-08-28 항목.
#
# 격차 한계(2%): 프로덕션 규모(9명·2주 학기)에서 최적성 증명은 실질 불가능하다
# — 600초를 줘도 FEASIBLE(격차 0.9%)로 끝나고 bound가 정체된다. 증명을 기다리는
# 대신 "증명된 하한 대비 2% 이내"에서 멈춘다. 이때 CP-SAT status는 OPTIMAL로
# 보고되며, 그 의미는 '이 격차 이내 최적'이다 (best_objective_bound로 검증 가능).
#
# interleave + 고정 워커 수 + 고정 seed: 동일 입력 → 동일 결과. 워커별 탐색을
# 결정적 시간 단위로 인터리브해 병렬 성능을 유지하면서 재현성을 얻는다.
# 워커 수는 코어 수가 아니라 상수로 고정한다 — 머신이 달라도 결과가 같도록.
# ---------------------------------------------------------------------------
SOLVER_RELATIVE_GAP_LIMIT = float(os.getenv("SOLVER_RELATIVE_GAP_LIMIT", "0.02"))
SOLVER_NUM_WORKERS = int(os.getenv("SOLVER_NUM_WORKERS", "8"))
SOLVER_RANDOM_SEED = int(os.getenv("SOLVER_RANDOM_SEED", "42"))
SOLVER_INTERLEAVE = os.getenv("SOLVER_INTERLEAVE", "1") == "1"


def _make_solver(time_limit_seconds: float) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    p = solver.parameters
    p.max_time_in_seconds = time_limit_seconds
    p.relative_gap_limit = SOLVER_RELATIVE_GAP_LIMIT
    p.num_search_workers = SOLVER_NUM_WORKERS
    p.random_seed = SOLVER_RANDOM_SEED
    p.interleave_search = SOLVER_INTERLEAVE
    return solver


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
            grid.set_open_ranges(day, resolver.resolve(day))
        return grid

    def build_context(self) -> ModelContext:
        grid = self.build_grid()
        resolver = OpeningHoursResolver(self.policy, self.calendar)
        day_blocks = {day: resolver.resolve_work_blocks(day) for day in grid.dates}
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
            day_blocks=day_blocks,
        )
        for constraint in self.constraints:
            constraint.apply(ctx)
        return ctx

    def solve(self, time_limit_seconds: float = 30.0) -> tuple[ScheduleResult, ModelContext]:
        ctx = self.build_context()
        if ctx.penalty_terms:
            ctx.model.Minimize(sum(t.weight * t.var for t in ctx.penalty_terms))

        solver = _make_solver(time_limit_seconds)
        status = solver.Solve(ctx.model)
        return self._extract(solver, status, ctx), ctx

    def solve_alternatives(
        self,
        num_solutions: int = 3,
        time_limit_seconds: float = 30.0,
        min_difference_slots: int = 4,
    ) -> tuple[list[ScheduleResult], ModelContext]:
        """동률 해 열거 — 페널티 총합이 같은(또는 더 낮은) 서로 다른 배정안을
        최대 num_solutions개 찾는다.

        방법: 첫 해를 찾은 뒤 '페널티 총합 ≤ 첫 해' 제약을 추가하고, 이미 찾은
        각 해와 최소 min_difference_slots개 슬롯 배정이 달라야 한다는 다양성
        컷을 더해 반복 풀이한다. 더 이상 조건을 만족하는 해가 없으면
        (INFEASIBLE) 그 시점까지 찾은 해들만 반환한다.

        time_limit_seconds는 해 하나당 시간 제한이다.
        """
        ctx = self.build_context()
        objective = sum(t.weight * t.var for t in ctx.penalty_terms)
        ctx.model.Minimize(objective)

        results: list[ScheduleResult] = []
        for _ in range(num_solutions):
            solver = _make_solver(time_limit_seconds)
            status = solver.Solve(ctx.model)
            result = self._extract(solver, status, ctx)
            if not result.is_feasible:
                if not results:
                    results.append(result)  # 첫 풀이 실패 — 상태(INFEASIBLE 등) 보고용
                break  # 이후 실패는 동률 해 소진을 의미
            if not results:
                # 이후 해는 첫 해보다 나쁘지 않아야 함 (동률 또는 개선만 허용).
                # result.objective_value는 보고용으로 공통 분모를 나눈 값이라
                # 모델과 단위가 다르다 — 솔버 목적값을 그대로 써야 한다 (#110).
                ctx.model.Add(objective <= int(solver.ObjectiveValue()))
            results.append(result)
            self._add_diversity_cut(ctx, result, min_difference_slots)
        return results, ctx

    def _add_diversity_cut(
        self, ctx: ModelContext, result: ScheduleResult, min_diff: int
    ) -> None:
        """직전 해와 최소 min_diff개 슬롯 배정이 달라야 한다는 제약 추가."""
        assigned = {
            (sid, day, minute)
            for day, by_slot in result.assignments.items()
            for minute, sids in by_slot.items()
            for sid in sids
        }
        diff_terms = [
            (1 - var) if key in assigned else var for key, var in ctx.variables.items()
        ]
        ctx.model.Add(sum(diff_terms) >= min_diff)

    def _extract(
        self, solver: cp_model.CpSolver, status, ctx: ModelContext
    ) -> ScheduleResult:
        result = ScheduleResult(status=solver.StatusName(status))
        result.solve_time_seconds = solver.WallTime()
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            logger.info(
                "Solver 종료: status=%s solve_time=%.2fs (해 없음)",
                result.status,
                result.solve_time_seconds,
            )
            return result

        # 보고 값은 공통 분모(ctx.weight_precision)를 도로 나눠 정책 파일 가중치
        # 단위로 되돌린다 (#110) — 배율을 쓴 부서만 목적값이 100배로 보이는 일이
        # 없도록. 나눗셈은 표시용이고, 최적화 자체는 정수 계수로 정확히 풀렸다.
        precision = ctx.weight_precision
        result.objective_value = round(solver.ObjectiveValue() / precision)
        result.best_objective_bound = round(solver.BestObjectiveBound() / precision)
        logger.info(
            "Solver 종료: status=%s solve_time=%.2fs objective=%d bound=%d (gap_limit=%.0f%%)",
            result.status,
            result.solve_time_seconds,
            result.objective_value,
            result.best_objective_bound,
            SOLVER_RELATIVE_GAP_LIMIT * 100,
        )
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
                        required=ctx.staffing_bounds(day, minute)[0],
                        assigned=assigned_count,
                    )
                )
        result.shortages.sort(key=lambda s: (s.day, s.slot_min))

        # 카테고리 합계는 모델 단위로 먼저 더한 뒤 한 번만 나눈다 — 이벤트마다
        # 나눠 더하면 반올림 오차가 쌓여 합계가 목적값과 어긋난다 (#110).
        raw_breakdown: dict[str, int] = {}
        for term in ctx.penalty_terms:
            amount = solver.Value(term.var)
            if amount <= 0:
                continue
            raw_cost = term.weight * amount
            raw_breakdown[term.name] = raw_breakdown.get(term.name, 0) + raw_cost
            result.penalty_events.append(
                PenaltyEvent(
                    name=term.name,
                    cost=round(raw_cost / precision),
                    amount=amount,
                    student_id=term.student_id,
                    day=term.day,
                    minute=term.minute,
                )
            )
        breakdown = {name: round(raw / precision) for name, raw in raw_breakdown.items()}
        result.penalty_breakdown = dict(sorted(breakdown.items(), key=lambda kv: -kv[1]))
        return result
