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

    최대 인원은 항상 Hard. 최소 인원은 정책의
    allow_understaffing_with_penalty가 True면 부족 인원 변수 + 큰 페널티로
    완화해, 학생들의 가능 시간만으로 채울 수 없는 경우에도 '해 없음' 대신
    어떤 슬롯이 몇 명 부족한지 리포트할 수 있게 한다.
    """

    name = "staffing_bounds"

    def apply(self, ctx: ModelContext) -> None:
        staffing = ctx.policy.staffing
        for day in ctx.grid.dates:
            for minute in ctx.grid.slots_of(day):
                candidates = ctx.slot_vars(day, minute)
                total = sum(candidates)
                ctx.model.Add(total <= staffing.max_per_slot)
                if staffing.min_per_slot <= 0:
                    continue
                if staffing.allow_understaffing_with_penalty:
                    shortage = ctx.new_int(
                        0, staffing.min_per_slot, f"shortage_{day}_{minute}"
                    )
                    ctx.model.Add(total + shortage >= staffing.min_per_slot)
                    ctx.shortage_vars[(day, minute)] = shortage
                    ctx.add_penalty("understaffing", ctx.policy.weight("understaffing"), shortage)
                else:
                    ctx.model.Add(total >= staffing.min_per_slot)


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
