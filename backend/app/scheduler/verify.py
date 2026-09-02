"""확정 근무표 제약 검증 — LLM 없이 결정적으로 (#156).

`review.py`의 AI 검토는 **draft 배치**의 자연어 운영 규칙만 본다. 확정된 배치가
SCHEDULER_SPEC 3장의 Hard Constraint를 실제로 지키는지 확인할 경로가 없어,
솔버를 거치지 않고 손으로 넣은 배치가 `confirmed`로 남아도 어디서도 걸리지
않았다 (실제로 시드 데모 배치가 그 상태였다).

이 모듈은 솔버와 **같은** 정책·캘린더·가용시간 로더를 태워 확정 배치를
다시 채점한다. 즉 여기서 나온 위반은 "AI가 그렇게 볼 수도 있다"가 아니라
실제로 규정을 어긴 배정이다.

검증하지 않는 것:

- **HC-BLOCK-1 (블록 all-or-none)** — SPEC 3.5(#123)에 따라 확정 근무표를
  운영 중에 고치는 일(부분 대타 승인)은 블록을 쪼개는 **허용된 운영 예외**다.
  생성 시점 제약을 확정본에 들이대면 정상 대타가 전부 위반으로 잡힌다.
- **수업 시간 겹침(HC-CLASS-2)** — DB에 학생 수업 시간 소스가 없어
  "가용 시간에 없으면 수업 중"으로 간접 처리한다 (SPEC 2.1). HC-CLASS-1
  검사가 이를 함께 덮는다.
"""

from dataclasses import dataclass, field
from datetime import date, time, timedelta

from app import models
from app.scheduler.config import load_academic_calendar, load_department_policy
from app.scheduler.domain import (
    AcademicCalendar,
    DepartmentPolicy,
    FundingType,
    Student,
    WorkSlotBlock,
    resolve_slot_staffing,
)
from app.scheduler.domain.calendar import OpeningHoursResolver
from app.scheduler.domain.timegrid import TimeGrid, minutes_to_str
from app.scheduler.service import (
    _load_students,
    apply_department_overrides,
    resolve_policy_file_key,
)

CRITICAL = "critical"
WARNING = "warning"


class BatchNotFound(Exception):
    pass


@dataclass
class Violation:
    rule: str  # SPEC의 제약 ID (HC-TIME-1 등) 또는 배치 자체의 문제(PROVENANCE 등)
    severity: str
    message: str
    student_id: str | None = None
    work_date: date | None = None
    start_time: int | None = None  # 자정으로부터의 분
    end_time: int | None = None

    def to_dict(self) -> dict:
        return {
            "rule": self.rule,
            "severity": self.severity,
            "message": self.message,
            "student_id": self.student_id,
            "date": self.work_date.isoformat() if self.work_date else None,
            "start_time": minutes_to_str(self.start_time)
            if self.start_time is not None
            else None,
            "end_time": minutes_to_str(self.end_time) if self.end_time is not None else None,
        }


@dataclass
class _Context:
    policy: DepartmentPolicy
    calendar: AcademicCalendar
    grid: TimeGrid
    students: dict[str, Student]
    # (날짜, 슬롯 시작 분) → 배정된 student_id 목록 (같은 학생이 겹쳐 들어오면 중복)
    occupancy: dict[tuple[date, int], list[str]] = field(default_factory=dict)
    # 날짜별 근무 블록 (#89) — 블록별 배정 인원(#171)을 판정하는 데 쓴다
    day_blocks: dict[date, list[WorkSlotBlock]] = field(default_factory=dict)

    def staffing_bounds(self, day: date, minute: int) -> tuple[int, int]:
        """그 슬롯에 적용할 (최소, 최대) 배정 인원 — 솔버와 같은 규칙 (#171)."""
        return resolve_slot_staffing(
            self.day_blocks.get(day, []), self.policy.staffing, minute
        )


def verify_batch(db, batch_id: int) -> dict:
    """배치 하나를 SPEC 3장 Hard Constraint로 다시 채점한다.

    status와 무관하게 동작한다 — draft·confirmed·manual 어느 쪽이든
    "이 배정이 규정을 지키는가"는 같은 질문이기 때문이다.
    """
    batch = (
        db.query(models.ScheduleBatch)
        .filter(models.ScheduleBatch.batch_id == batch_id)
        .first()
    )
    if batch is None:
        raise BatchNotFound()

    rows = (
        db.query(models.WorkSchedule)
        .filter(models.WorkSchedule.batch_id == batch_id)
        .order_by(models.WorkSchedule.work_date, models.WorkSchedule.start_time)
        .all()
    )
    ctx = _build_context(db, batch)
    violations: list[Violation] = []

    if batch.solver_summary is None:
        violations.append(
            Violation(
                rule="PROVENANCE",
                severity=WARNING,
                message=(
                    "이 배치에는 solver_summary가 없습니다 — 제약 검증을 거친 "
                    "솔버 산출물이 아니라 직접 넣은 배정입니다."
                ),
            )
        )

    violations += _check_rows(ctx, batch, rows)
    violations += _check_staffing(ctx)
    violations += _check_hour_limits(ctx, batch)

    return {
        "batch_id": batch.batch_id,
        "department_id": batch.department_id,
        "period_start": batch.period_start.isoformat() if batch.period_start else None,
        "period_end": batch.period_end.isoformat() if batch.period_end else None,
        "status": batch.status,
        "solver_generated": batch.solver_summary is not None,
        # critical이 하나도 없으면 통과 — warning(최소 인원 미달 등)은 담당자 판단 몫
        "ok": not any(v.severity == CRITICAL for v in violations),
        "violations": [v.to_dict() for v in violations],
        "coverage": _coverage(ctx),
        "student_capacity": _student_capacity(ctx),
    }


# ---- 컨텍스트 ----


def _build_context(db, batch: models.ScheduleBatch) -> _Context:
    period_start = batch.period_start
    period_end = batch.period_end
    num_days = (period_end - period_start).days + 1

    policy = apply_department_overrides(
        db,
        batch.department_id,
        load_department_policy(resolve_policy_file_key(db, batch.department_id)),
    )
    calendar = load_academic_calendar(period_start.year)

    grid = TimeGrid(period_start, num_days, policy.slot_minutes)
    resolver = OpeningHoursResolver(policy, calendar)
    for day in grid.dates:
        grid.set_open_ranges(day, resolver.resolve(day))

    students = {
        s.student_id: s
        for s in _load_students(db, batch.department_id, period_start, period_end)
    }
    return _Context(
        policy=policy,
        calendar=calendar,
        grid=grid,
        students=students,
        day_blocks={day: resolver.resolve_work_blocks(day) for day in grid.dates},
    )


def _slots_of_row(row: models.WorkSchedule, slot_minutes: int) -> list[int]:
    return list(range(_minutes(row.start_time), _minutes(row.end_time), slot_minutes))


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


# ---- 행 단위 검사 (HC-OPEN / HC-CLASS) ----


def _check_rows(
    ctx: _Context, batch: models.ScheduleBatch, rows: list[models.WorkSchedule]
) -> list[Violation]:
    """배정 행 하나하나가 개관 시간·가용 시간·활동 기간 안에 있는지 본다.

    슬롯마다 위반을 쏟아내면 리포트가 못 읽을 정도가 되므로, 같은 행·같은
    규칙의 연속 슬롯은 하나의 시간 구간으로 합쳐 보고한다.
    """
    violations: list[Violation] = []
    slot_minutes = ctx.policy.slot_minutes
    known_dates = set(ctx.grid.dates)

    for row in rows:
        if row.work_date not in known_dates:
            violations.append(
                Violation(
                    rule="BATCH-RANGE",
                    severity=CRITICAL,
                    message=(
                        f"배치 기간({batch.period_start}~{batch.period_end}) 밖 날짜에 "
                        "배정된 근무입니다."
                    ),
                    student_id=row.student_id,
                    work_date=row.work_date,
                    start_time=_minutes(row.start_time),
                    end_time=_minutes(row.end_time),
                )
            )
            continue

        student = ctx.students.get(row.student_id)
        offenders: dict[str, list[int]] = {}
        for minute in _slots_of_row(row, slot_minutes):
            ctx.occupancy.setdefault((row.work_date, minute), []).append(row.student_id)

            if not ctx.grid.is_open(row.work_date, minute):
                offenders.setdefault("HC-OPEN", []).append(minute)
                continue  # 개관 밖이면 가용 시간을 따질 의미가 없다
            if student is None:
                continue
            if not _within_active_period(student, row.work_date):
                offenders.setdefault("HC-CLASS-6", []).append(minute)
            elif not student.can_work(row.work_date, minute, ctx.calendar):
                offenders.setdefault("HC-CLASS-1", []).append(minute)

        if student is None:
            violations.append(
                Violation(
                    rule="MEMBERSHIP",
                    severity=WARNING,
                    message=(
                        "이 부서의 합격 학생 목록에 없는 학생이 배정돼 있어 "
                        "가용 시간·활동 기간을 검증하지 못했습니다."
                    ),
                    student_id=row.student_id,
                    work_date=row.work_date,
                    start_time=_minutes(row.start_time),
                    end_time=_minutes(row.end_time),
                )
            )

        for rule, minutes in offenders.items():
            for start, end in _merge_slots(minutes, slot_minutes):
                violations.append(
                    Violation(
                        rule=rule,
                        severity=CRITICAL,
                        message=_ROW_RULE_MESSAGES[rule],
                        student_id=row.student_id,
                        work_date=row.work_date,
                        start_time=start,
                        end_time=end,
                    )
                )

    return violations


_ROW_RULE_MESSAGES = {
    "HC-OPEN": "개관 시간 밖에 배정된 근무입니다.",
    "HC-CLASS-1": "학생이 제출한 근무 가능 시간 밖에 배정된 근무입니다.",
    "HC-CLASS-6": "학생의 근로 활동 기간 밖에 배정된 근무입니다.",
}


def _within_active_period(student: Student, day: date) -> bool:
    if student.active_from is not None and day < student.active_from:
        return False
    if student.active_until is not None and day > student.active_until:
        return False
    return True


# ---- 슬롯 인원 검사 (HC-STAFF) ----


def _check_staffing(ctx: _Context) -> list[Violation]:
    staffing = ctx.policy.staffing
    slot_minutes = ctx.policy.slot_minutes
    violations: list[Violation] = []

    for day in ctx.grid.dates:
        # 근무 블록마다 기준 인원이 다를 수 있어(#171) 기준값별로 모은다 —
        # 같은 기준을 어긴 슬롯끼리만 한 구간으로 합쳐야 메시지의 인원이 맞다
        over: dict[int, list[int]] = {}
        under: dict[int, list[int]] = {}
        duplicated: dict[str, list[int]] = {}

        for minute in ctx.grid.slots_of(day):
            min_per_slot, max_per_slot = ctx.staffing_bounds(day, minute)
            assigned = ctx.occupancy.get((day, minute), [])
            distinct = set(assigned)
            if len(assigned) > len(distinct):
                for student_id in distinct:
                    if assigned.count(student_id) > 1:
                        duplicated.setdefault(student_id, []).append(minute)
            if len(distinct) > max_per_slot:
                over.setdefault(max_per_slot, []).append(minute)
            if min_per_slot > 0 and len(distinct) < min_per_slot:
                under.setdefault(min_per_slot, []).append(minute)

        for student_id, minutes in duplicated.items():
            for start, end in _merge_slots(minutes, slot_minutes):
                violations.append(
                    Violation(
                        rule="OVERLAP",
                        severity=CRITICAL,
                        message="같은 학생이 같은 시간대에 두 번 배정돼 있습니다.",
                        student_id=student_id,
                        work_date=day,
                        start_time=start,
                        end_time=end,
                    )
                )
        for max_per_slot, minutes in sorted(over.items()):
            for start, end in _merge_slots(minutes, slot_minutes):
                violations.append(
                    Violation(
                        rule="HC-STAFF-1",
                        severity=CRITICAL,
                        message=f"동시 배정 인원이 최대 {max_per_slot}명을 넘습니다.",
                        work_date=day,
                        start_time=start,
                        end_time=end,
                    )
                )
        for min_per_slot, minutes in sorted(under.items()):
            for start, end in _merge_slots(minutes, slot_minutes):
                # 완화 정책(allow_understaffing_with_penalty)이 켜져 있으면 미달은
                # 규정 위반이 아니라 "가능 시간이 모자라다"는 리포트다 (SPEC 4장).
                violations.append(
                    Violation(
                        rule="SC-UNDER-1"
                        if staffing.allow_understaffing_with_penalty
                        else "HC-STAFF-2",
                        severity=WARNING
                        if staffing.allow_understaffing_with_penalty
                        else CRITICAL,
                        message=(
                            f"개관 중인데 배정 인원이 최소 {min_per_slot}명에 못 미칩니다."
                        ),
                        work_date=day,
                        start_time=start,
                        end_time=end,
                    )
                )

    return violations


# ---- 근로 시간 상한 검사 (HC-TIME) ----


def _check_hour_limits(ctx: _Context, batch: models.ScheduleBatch) -> list[Violation]:
    """HC-TIME-1~4. 상한 판정 규칙은 constraints/hard.py와 같은 기준을 쓴다."""
    limits = ctx.policy.hour_limits
    slot_minutes = ctx.policy.slot_minutes
    violations: list[Violation] = []

    # (학생, 날짜) → 배정 슬롯 수. 개관 밖 배정도 근로 시간에는 포함한다.
    slots: dict[tuple[str, date], int] = {}
    for (day, _minute), assigned in ctx.occupancy.items():
        for student_id in set(assigned):
            slots[(student_id, day)] = slots.get((student_id, day), 0) + 1

    def hours(pairs) -> float:
        return sum(slots.get(p, 0) for p in pairs) * slot_minutes / 60

    for student_id, student in ctx.students.items():
        for week_dates in _group_by_week(ctx.grid.dates).values():
            if student.funding_type == FundingType.GYOBI:
                cap = limits.gyobi_weekly_max_hours
                rule = "HC-TIME-1"
            else:
                cap = min(limits.gukga_weekly(ctx.calendar.period_type(d)) for d in week_dates)
                rule = "HC-TIME-2"
            worked = hours((student_id, d) for d in week_dates)
            if worked > cap:
                violations.append(
                    Violation(
                        rule=rule,
                        severity=CRITICAL,
                        message=(
                            f"{week_dates[0]} 주의 근로가 {worked:g}시간으로 "
                            f"상한 {cap:g}시간을 넘습니다."
                        ),
                        student_id=student_id,
                        work_date=week_dates[0],
                    )
                )

        if student.funding_type == FundingType.GUKGA:
            for month_dates in _group_by_month(ctx.grid.dates).values():
                worked = hours((student_id, d) for d in month_dates)
                cap = limits.gukga_monthly_max_hours
                if worked > cap:
                    violations.append(
                        Violation(
                            rule="HC-TIME-3",
                            severity=CRITICAL,
                            message=(
                                f"{month_dates[0]:%Y-%m}월 국가근로가 {worked:g}시간으로 "
                                f"상한 {cap:g}시간을 넘습니다 (배치 기간 내 날짜 기준)."
                            ),
                            student_id=student_id,
                            work_date=month_dates[0],
                        )
                    )

    gyobi_ids = [
        sid for sid, s in ctx.students.items() if s.funding_type == FundingType.GYOBI
    ]
    dates = ctx.grid.dates
    cap = limits.gyobi_biweekly_dept_total_max_hours
    for start in range(0, len(dates), 14):
        window = dates[start : start + 14]
        worked = hours((sid, d) for sid in gyobi_ids for d in window)
        if worked > cap:
            violations.append(
                Violation(
                    rule="HC-TIME-4",
                    severity=CRITICAL,
                    message=(
                        f"{window[0]}부터 2주간 부서 교비 총합이 {worked:g}시간으로 "
                        f"상한 {cap:g}시간을 넘습니다."
                    ),
                    work_date=window[0],
                )
            )

    return violations


# ---- 가능 시간 대비 배정 시간 ----


def _student_capacity(ctx: _Context) -> list[dict]:
    """학생별 "이 기간에 배정할 수 있었던 시간" 대비 실제 배정 시간 (주 단위).

    "가능 시간이 많은 학생은 상한까지 채우고, 적은 학생은 덜 채워도 된다"는 식의
    공정성 규칙은 배정 시간의 절대값만으로 판정할 수 없다 — 6시간을 받은 학생이
    덜 받은 것인지, 애초에 낼 수 있는 시간이 그것뿐이었는지 갈라야 한다. 그래서
    솔버의 fair_hours(SC-FAIR-1)와 **같은 기준**으로 주별 목표치를 계산해 둔다:
    목표 = min(주간 근로 상한, 그 주 본인 가용 슬롯).

    가용 슬롯은 개관 시간 안에서 `Student.can_work`가 참인 슬롯만 센다 — 학생이
    낸 가능 시간에서 수업·근무 불가일·활동 기간 밖을 걸러낸, 실제로 배정할 수
    있었던 시간이다. 위반 판정이 아니라 판단 근거이므로 violations에 넣지 않는다.
    """
    limits = ctx.policy.hour_limits
    hours_per_slot = ctx.policy.slot_minutes / 60

    assigned: dict[tuple[str, date], int] = {}
    for (day, _minute), occupants in ctx.occupancy.items():
        for student_id in set(occupants):
            assigned[(student_id, day)] = assigned.get((student_id, day), 0) + 1

    weeks = _group_by_week(ctx.grid.dates)
    rows: list[dict] = []
    for student_id, student in ctx.students.items():
        week_rows: list[dict] = []
        for week_dates in weeks.values():
            available_slots = sum(
                1
                for day in week_dates
                for minute in ctx.grid.slots_of(day)
                if student.can_work(day, minute, ctx.calendar)
            )
            worked_slots = sum(assigned.get((student_id, day), 0) for day in week_dates)
            if not available_slots and not worked_slots:
                continue  # 그 주에 활동하지 않은 학생 — 비교할 것이 없다
            if student.funding_type == FundingType.GYOBI:
                cap_hours = limits.gyobi_weekly_max_hours
            else:
                cap_hours = min(
                    limits.gukga_weekly(ctx.calendar.period_type(d)) for d in week_dates
                )
            available_hours = available_slots * hours_per_slot
            assigned_hours = worked_slots * hours_per_slot
            target_hours = min(cap_hours, available_hours)
            monday = week_dates[0] - timedelta(days=week_dates[0].weekday())
            week_rows.append(
                {
                    "week_start": monday.isoformat(),
                    "available_hours": round(available_hours, 1),
                    "cap_hours": cap_hours,
                    "target_hours": round(target_hours, 1),
                    "assigned_hours": round(assigned_hours, 1),
                    "fill_ratio": round(assigned_hours / target_hours, 3)
                    if target_hours
                    else None,
                }
            )
        if week_rows:
            rows.append({"student_id": student_id, "weeks": week_rows})
    return rows


# ---- 커버리지 요약 ----


def _coverage(ctx: _Context) -> dict:
    """개관 슬롯 대비 최소 인원을 채운 슬롯 비율 — "꽉 찼는가"에 답하는 수치."""
    min_per_slot = max(ctx.policy.staffing.min_per_slot, 1)
    open_slots = 0
    staffed_slots = 0
    assigned_slots = 0
    for day in ctx.grid.dates:
        for minute in ctx.grid.slots_of(day):
            open_slots += 1
            headcount = len(set(ctx.occupancy.get((day, minute), [])))
            assigned_slots += headcount
            if headcount >= min_per_slot:
                staffed_slots += 1

    hours_per_slot = ctx.policy.slot_minutes / 60
    return {
        "open_slots": open_slots,
        "open_hours": round(open_slots * hours_per_slot, 1),
        "staffed_slots": staffed_slots,
        "staffed_ratio": round(staffed_slots / open_slots, 3) if open_slots else None,
        "assigned_hours": round(assigned_slots * hours_per_slot, 1),
    }


# ---- 도우미 ----


def _merge_slots(minutes: list[int], slot_minutes: int) -> list[tuple[int, int]]:
    """연속된 슬롯 시작 분들을 (시작, 끝) 구간으로 합친다."""
    if not minutes:
        return []
    ordered = sorted(set(minutes))
    ranges: list[tuple[int, int]] = []
    start = prev = ordered[0]
    for minute in ordered[1:]:
        if minute == prev + slot_minutes:
            prev = minute
            continue
        ranges.append((start, prev + slot_minutes))
        start = prev = minute
    ranges.append((start, prev + slot_minutes))
    return ranges


def _group_by_week(dates: list[date]) -> dict[tuple[int, int], list[date]]:
    weeks: dict[tuple[int, int], list[date]] = {}
    for d in dates:
        iso = d.isocalendar()
        weeks.setdefault((iso.year, iso.week), []).append(d)
    return weeks


def _group_by_month(dates: list[date]) -> dict[tuple[int, int], list[date]]:
    months: dict[tuple[int, int], list[date]] = {}
    for d in dates:
        months.setdefault((d.year, d.month), []).append(d)
    return months
