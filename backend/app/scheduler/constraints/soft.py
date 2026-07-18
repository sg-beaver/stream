"""Soft Constraint.

각 제약은 위반량을 나타내는 보조 변수를 만들고 정책(soft_weights)의
가중치를 곱해 목적함수 페널티로 등록한다. 가중치를 0으로 두면 해당
제약은 사실상 비활성화된다 (부서별 정책 JSON에서 조정).
"""

from datetime import date, timedelta

from ..domain import PeriodType, Weekday
from .base import Constraint, ModelContext


class PreferredStaffingConstraint(Constraint):
    """시간대별 선호 배정 인원 (예: 심부름 잦은 시간대 2명 선호)."""

    name = "preferred_staffing"

    def apply(self, ctx: ModelContext) -> None:
        for day in ctx.grid.dates:
            period = ctx.calendar.period_type(day)
            weekday = Weekday(day.weekday())
            for minute in ctx.grid.slots_of(day):
                band = next(
                    (
                        b
                        for b in ctx.policy.preferred_staffing_bands
                        if b.covers(period, weekday, minute)
                    ),
                    None,
                )
                if band is None or band.preferred_count <= ctx.policy.staffing.min_per_slot:
                    continue
                deficit = ctx.new_int(
                    0, band.preferred_count, f"pref_deficit_{day}_{minute}"
                )
                ctx.model.Add(sum(ctx.slot_vars(day, minute)) + deficit >= band.preferred_count)
                ctx.add_penalty(self.name, band.weight, deficit)


class PreferenceMatchConstraint(Constraint):
    """근무 '희망' 시간 반영 — 희망하지 않은 (가능만 한) 슬롯 배정에 페널티."""

    name = "preference_match"

    def apply(self, ctx: ModelContext) -> None:
        weight = ctx.policy.weight("preferred_slot_miss")
        by_id = {s.student_id: s for s in ctx.students}
        for (sid, day, minute), var in ctx.variables.items():
            if not by_id[sid].is_preferred(day, minute):
                ctx.add_penalty(self.name, weight, var)


class ContiguityConstraint(Constraint):
    """연속 근무 블록 선호 — 조각 근무(블록 수) 최소화.

    학생-날짜별로 근무 블록이 새로 시작될 때마다 페널티를 준다.
    블록 수가 줄수록(한 번에 길게 근무할수록) 페널티가 작아진다.
    """

    name = "contiguity"

    def apply(self, ctx: ModelContext) -> None:
        weight = ctx.policy.weight("block_start")
        for student in ctx.students:
            for day in ctx.grid.dates:
                prev = None
                for minute in ctx.grid.slots_of(day):
                    var = ctx.var(student.student_id, day, minute)
                    if var is None:
                        prev = None  # 배정 불가 슬롯은 블록 경계로 취급
                        continue
                    start = ctx.new_bool(f"blockstart_{student.student_id}_{day}_{minute}")
                    if prev is None:
                        ctx.model.Add(start >= var)
                    else:
                        ctx.model.Add(start >= var - prev)
                    ctx.add_penalty(self.name, weight, start)
                    prev = var


class MealBreakConstraint(Constraint):
    """식사 시간 보장.

    - 학기 중: 식사 시간대(점심/저녁) 전체가 수업+근무로 채워지면 페널티.
      시험 기간의 기존 수업 시간(수업X 시험X)은 휴강이므로 식사 가능한
      시간으로 간주한다 (Student.has_class에서 처리).
    - 방학 중: 하루 배정이 기준 시간 이상인 날에 점심 시간대가 모두
      근무로 채워지면 페널티 (학생별 wants_meal_break 선택제).
    """

    name = "meal_break"

    def apply(self, ctx: ModelContext) -> None:
        weight = ctx.policy.weight("meal_missed")
        long_day_slots = ctx.grid.hours_to_slots(ctx.policy.vacation_long_shift_meal_hours)

        for student in ctx.students:
            if not student.preferences.wants_meal_break:
                continue
            for day in ctx.grid.dates:
                period = ctx.calendar.period_type(day)
                day_vars = ctx.student_day_vars(student.student_id, day)
                if not day_vars:
                    continue
                for window in ctx.policy.meal_windows:
                    if window.period != period:
                        continue
                    missed = self._missed_meal_var(ctx, student, day, window)
                    if missed is None:
                        continue
                    if period == PeriodType.SEMESTER:
                        ctx.add_penalty(self.name, weight, missed)
                    else:
                        # 방학: 장시간 근무일에만 페널티 적용
                        long_day = ctx.new_bool(f"longday_{student.student_id}_{day}")
                        total = sum(day_vars)
                        ctx.model.Add(total >= long_day_slots).OnlyEnforceIf(long_day)
                        ctx.model.Add(total < long_day_slots).OnlyEnforceIf(long_day.Not())
                        both = ctx.new_bool(f"longday_nomeal_{student.student_id}_{day}")
                        ctx.model.Add(both >= missed + long_day - 1)
                        ctx.add_penalty(self.name, weight, both)

    @staticmethod
    def _missed_meal_var(ctx: ModelContext, student, day: date, window):
        """식사 시간대 전 슬롯이 바쁘면(수업∪근무) 1이 되는 변수. 항상 빈
        슬롯이 있으면(식사 가능 확정) None."""
        slots = [
            m for m in ctx.grid.slots_of(day) if window.start_min <= m < window.end_min
        ]
        if not slots:
            return None
        work_vars, busy_const = [], 0
        for m in slots:
            var = ctx.var(student.student_id, day, m)
            if var is not None:
                work_vars.append(var)
            elif student.has_class(day, m, ctx.calendar):
                busy_const += 1
            else:
                return None  # 이 슬롯은 항상 비어 있음 → 식사 가능
        missed = ctx.new_bool(f"meal_missed_{student.student_id}_{day}_{window.start_min}")
        ctx.model.Add(missed >= sum(work_vars) + busy_const - (len(slots) - 1))
        return missed


class MorningRulesConstraint(Constraint):
    """아침 근무 개인 편의 규칙 (학생별 선택제).

    - 아침 근무 불가능(최대 0일) 선택 시: 아침 슬롯 배정 금지 (Hard로 처리)
    - 전날 마감(폐관 직전 슬롯) 근무 시 다음 날 아침 근무 페널티
    - 주당 아침 근무 일수 초과분 페널티
    - 아침 근무 연속 일수 초과 페널티
    """

    name = "morning_rules"

    def apply(self, ctx: ModelContext) -> None:
        morning_end = ctx.policy.morning_end_min
        for student in ctx.students:
            prefs = student.preferences
            sid = student.student_id

            morning_vars_by_day: dict[date, list] = {}
            for day in ctx.grid.dates:
                mvars = [
                    v
                    for m in ctx.grid.slots_of(day)
                    if m < morning_end and (v := ctx.var(sid, day, m)) is not None
                ]
                if mvars:
                    morning_vars_by_day[day] = mvars

            if prefs.morning_forbidden:
                for mvars in morning_vars_by_day.values():
                    for v in mvars:
                        ctx.model.Add(v == 0)
                continue

            # 날짜별 '아침 근무일' 지표 변수
            morning_day: dict[date, object] = {}
            for day, mvars in morning_vars_by_day.items():
                indicator = ctx.new_bool(f"morningday_{sid}_{day}")
                for v in mvars:
                    ctx.model.Add(indicator >= v)
                morning_day[day] = indicator

            self._weekly_cap(ctx, sid, prefs, morning_day)
            self._consecutive_cap(ctx, sid, prefs, morning_day)
            if prefs.no_morning_after_close:
                self._close_then_morning(ctx, sid, morning_day)

    @staticmethod
    def _weekly_cap(ctx, sid, prefs, morning_day):
        weight = ctx.policy.weight("morning_days_excess")
        weeks: dict[tuple[int, int], list] = {}
        for day, ind in morning_day.items():
            iso = day.isocalendar()
            weeks.setdefault((iso.year, iso.week), []).append(ind)
        for key, indicators in weeks.items():
            cap = prefs.max_morning_days_per_week
            if len(indicators) <= cap:
                continue
            excess = ctx.new_int(0, len(indicators), f"morning_excess_{sid}_{key}")
            ctx.model.Add(excess >= sum(indicators) - cap)
            ctx.add_penalty(MorningRulesConstraint.name, weight, excess)

    @staticmethod
    def _consecutive_cap(ctx, sid, prefs, morning_day):
        weight = ctx.policy.weight("consecutive_morning_excess")
        cap = prefs.max_consecutive_morning_days
        dates = sorted(morning_day)
        window = cap + 1
        for i in range(len(dates)):
            span = [
                morning_day[dates[i] + timedelta(days=k)]
                for k in range(window)
                if dates[i] + timedelta(days=k) in morning_day
            ]
            # 달력상 연속된 window일이 모두 아침 근무일이면 위반
            if len(span) < window:
                continue
            viol = ctx.new_bool(f"morning_consec_{sid}_{dates[i]}")
            ctx.model.Add(viol >= sum(span) - cap)
            ctx.add_penalty(MorningRulesConstraint.name, weight, viol)

    @staticmethod
    def _close_then_morning(ctx, sid, morning_day):
        weight = ctx.policy.weight("morning_after_close")
        for day in ctx.grid.dates:
            slots = ctx.grid.slots_of(day)
            if not slots:
                continue
            close_var = ctx.var(sid, day, slots[-1])
            next_day = day + timedelta(days=1)
            if close_var is None or next_day not in morning_day:
                continue
            pen = ctx.new_bool(f"close_morning_{sid}_{day}")
            ctx.model.Add(pen >= close_var + morning_day[next_day] - 1)
            ctx.add_penalty(MorningRulesConstraint.name, weight, pen)


class ExamProximityConstraint(Constraint):
    """시험 시작 직전(버퍼 시간 내) 배정 회피."""

    name = "exam_proximity"

    def apply(self, ctx: ModelContext) -> None:
        weight = ctx.policy.weight("exam_proximity")
        buffer_min = ctx.policy.exam_buffer_minutes
        for student in ctx.students:
            for exam in student.exams:
                window_start = exam.start_min - buffer_min
                for minute in ctx.grid.slots_of(exam.day):
                    if window_start <= minute < exam.start_min:
                        var = ctx.var(student.student_id, exam.day, minute)
                        if var is not None:
                            ctx.add_penalty(self.name, weight, var)


class AvoidRangeConstraint(Constraint):
    """특정 날짜·시간대 근무 회피 요청 (축제 당일 저녁 등)."""

    name = "avoid_range"

    def apply(self, ctx: ModelContext) -> None:
        weight = ctx.policy.weight("avoid_range_slot")
        for student in ctx.students:
            for rng in student.avoid_ranges:
                for minute in ctx.grid.slots_of(rng.day):
                    if rng.start_min <= minute < rng.end_min:
                        var = ctx.var(student.student_id, rng.day, minute)
                        if var is not None:
                            ctx.add_penalty(self.name, weight, var)


class NonCampusDayConstraint(Constraint):
    """통학 부담 고려 — 학기 중 원래 학교에 오지 않는 요일 배정 페널티.

    campus_days를 입력한 학생에게만 적용. 페널티는 '그 날 근무 여부'
    단위라서, 배정된다면 이왕이면 원래 등교하는 날에 몰아 배정된다.
    """

    name = "non_campus_day"

    def apply(self, ctx: ModelContext) -> None:
        weight = ctx.policy.weight("non_campus_day")
        for student in ctx.students:
            campus = set(student.preferences.campus_days)
            if not campus:
                continue
            for day in ctx.grid.dates:
                if ctx.calendar.period_type(day) != PeriodType.SEMESTER:
                    continue
                if Weekday(day.weekday()) in campus:
                    continue
                day_vars = ctx.student_day_vars(student.student_id, day)
                if not day_vars:
                    continue
                works = ctx.new_bool(f"noncampus_{student.student_id}_{day}")
                for v in day_vars:
                    ctx.model.Add(works >= v)
                ctx.add_penalty(self.name, weight, works)
