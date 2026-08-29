"""Hard Constraint.

주의: '근무 가능 시간', '수업 시간 근로 불가', '개관 시간', '특정일 근무 불가',
공휴일·교내 휴강일 예외 규칙은 변수 생성 단계(engine/solver.py)에서
Student.can_work() + TimeGrid로 이미 인코딩된다. 이 모듈에는 배정 인원과
근로 시간 상한처럼 변수 간 관계로 표현되는 제약만 둔다.
"""

from datetime import date

from ..domain import FundingType
from .base import Constraint, ModelContext


class StaffingBoundsConstraint(Constraint):
    """시간대별 최소/최대 배정 인원.

    인원 기준은 슬롯마다 다를 수 있다 (#171) — 근무 블록에 인원이 설정돼 있으면
    그 값이, 없으면 부서 기본값이 적용된다(ModelContext.staffing_bounds).
    수업 시간대별로 필요한 조교 수가 다른 부서를 이 한 제약으로 함께 표현한다.

    최대 인원은 항상 Hard. 최소 인원은 정책의
    allow_understaffing_with_penalty가 True면 부족 인원 변수 + 큰 페널티로
    완화해, 학생들의 가능 시간만으로 채울 수 없는 경우에도 '해 없음' 대신
    어떤 슬롯이 몇 명 부족한지 리포트할 수 있게 한다.
    """

    name = "staffing_bounds"

    def apply(self, ctx: ModelContext) -> None:
        allow_understaffing = ctx.policy.staffing.allow_understaffing_with_penalty
        for day in ctx.grid.dates:
            for minute in ctx.grid.slots_of(day):
                min_per_slot, max_per_slot = ctx.staffing_bounds(day, minute)
                candidates = ctx.slot_vars(day, minute)
                total = sum(candidates)
                ctx.model.Add(total <= max_per_slot)
                if min_per_slot <= 0:
                    continue
                if allow_understaffing:
                    shortage = ctx.new_int(
                        0, min_per_slot, f"shortage_{day}_{minute}"
                    )
                    ctx.model.Add(total + shortage >= min_per_slot)
                    ctx.shortage_vars[(day, minute)] = shortage
                    ctx.add_penalty(
                        "understaffing",
                        ctx.policy.weight("understaffing"),
                        shortage,
                        day=day,
                        minute=minute,
                    )
                else:
                    ctx.model.Add(total >= min_per_slot)


class WorkSlotBlockConstraint(Constraint):
    """부서 정의 근무 블록 all-or-none (#89).

    ctx.day_blocks의 각 블록에 대해, 학생별로 블록 안 30분 슬롯을 전부
    배정하거나 전부 비운다. 블록 안에 변수가 없는 슬롯(수업·가용 밖 등)이
    하나라도 있으면 그 학생은 블록 전체 배정 불가 — 부분 겹침 손실은
    '블록 단위 근무'라는 운영 방침에 따른 의도된 동작이다.
    """

    name = "work_slot_block"

    def apply(self, ctx: ModelContext) -> None:
        for day, blocks in ctx.day_blocks.items():
            for block in blocks:
                slots = range(block.start_min, block.end_min, ctx.slot_minutes)
                if len(slots) <= 1:
                    continue
                for student in ctx.students:
                    slot_vars = [ctx.var(student.student_id, day, m) for m in slots]
                    if all(v is not None for v in slot_vars):
                        # 체인 등식이면 블록 bool 없이도 CP-SAT가 변수를 묶어 전파한다
                        for prev_var, next_var in zip(slot_vars, slot_vars[1:]):
                            ctx.model.Add(prev_var == next_var)
                    else:
                        for v in slot_vars:
                            if v is not None:
                                ctx.model.Add(v == 0)


class WeeklyHourLimitConstraint(Constraint):
    """주당 근로 시간 상한.

    - 교비: 주 14시간 (학기/방학 동일)
    - 국가: 학기 중 주 20시간 / 방학 중 주 40시간

    주는 ISO 주(월~일) 기준. 한 주에 학기·방학이 섞이면 보수적으로
    더 낮은 상한을 적용한다.
    """

    name = "weekly_hour_limit"

    def apply(self, ctx: ModelContext) -> None:
        limits = ctx.policy.hour_limits
        weeks = _group_by_week(ctx.grid.dates)
        for student in ctx.students:
            for week_dates in weeks.values():
                if student.funding_type == FundingType.GYOBI:
                    cap_hours = limits.gyobi_weekly_max_hours
                else:
                    cap_hours = min(
                        limits.gukga_weekly(ctx.calendar.period_type(d)) for d in week_dates
                    )
                cap_slots = ctx.grid.hours_to_slots(cap_hours)
                week_vars = [
                    v for d in week_dates for v in ctx.student_day_vars(student.student_id, d)
                ]
                if week_vars:
                    ctx.model.Add(sum(week_vars) <= cap_slots)


class MonthlyGukgaLimitConstraint(Constraint):
    """국가 근로 월별 시간 상한 (MVP: 월 46시간).

    스케줄링 대상 기간에 포함된 날짜만 집계한다. 같은 달의 기간 외
    기근무 시간은 추후 DB 연동 시 이월분으로 차감하도록 확장 예정.
    """

    name = "monthly_gukga_limit"

    def apply(self, ctx: ModelContext) -> None:
        cap_slots = ctx.grid.hours_to_slots(ctx.policy.hour_limits.gukga_monthly_max_hours)
        months: dict[tuple[int, int], list[date]] = {}
        for d in ctx.grid.dates:
            months.setdefault((d.year, d.month), []).append(d)
        for student in ctx.students:
            if student.funding_type != FundingType.GUKGA:
                continue
            for month_dates in months.values():
                month_vars = [
                    v for d in month_dates for v in ctx.student_day_vars(student.student_id, d)
                ]
                if month_vars:
                    ctx.model.Add(sum(month_vars) <= cap_slots)


class BiweeklyDeptGyobiLimitConstraint(Constraint):
    """부서 전체 2주 교비 근로 시간 총합 상한 (MVP: 190시간).

    스케줄링 시작일부터 14일 단위 창(window)으로 나눠 적용한다.
    """

    name = "biweekly_dept_gyobi_limit"

    def apply(self, ctx: ModelContext) -> None:
        cap_slots = ctx.grid.hours_to_slots(
            ctx.policy.hour_limits.gyobi_biweekly_dept_total_max_hours
        )
        gyobi_ids = [
            s.student_id for s in ctx.students if s.funding_type == FundingType.GYOBI
        ]
        dates = ctx.grid.dates
        for start in range(0, len(dates), 14):
            window = dates[start : start + 14]
            window_vars = [
                v for sid in gyobi_ids for d in window for v in ctx.student_day_vars(sid, d)
            ]
            if window_vars:
                ctx.model.Add(sum(window_vars) <= cap_slots)


def _group_by_week(dates: list[date]) -> dict[tuple[int, int], list[date]]:
    weeks: dict[tuple[int, int], list[date]] = {}
    for d in dates:
        iso = d.isocalendar()
        weeks.setdefault((iso.year, iso.week), []).append(d)
    return weeks
