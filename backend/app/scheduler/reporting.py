"""배정 결과 콘솔 리포트.

- 날짜별 시간표 (학생별 연속 블록으로 병합 표시)
- 개인별 요일/주차/2주 근무 시간 집계
- 부서 교비 주별·2주 총합, 국가 월별 총합
- 최소 인원 미달 슬롯 리포트

추후 프론트엔드 주간 그리드 시각화의 데이터 소스가 될 집계 로직이므로,
출력(print)과 집계(summarize_*)를 분리해 둔다.
"""

from datetime import date

from .domain import (
    AcademicCalendar,
    FundingType,
    ScheduleResult,
    Student,
    TimeGrid,
    minutes_to_str,
)

_WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]


def merge_blocks(slots: list[int], slot_minutes: int) -> list[tuple[int, int]]:
    """정렬된 슬롯 목록을 (시작, 끝) 연속 구간으로 병합."""
    blocks: list[tuple[int, int]] = []
    for m in sorted(slots):
        if blocks and blocks[-1][1] == m:
            blocks[-1] = (blocks[-1][0], m + slot_minutes)
        else:
            blocks.append((m, m + slot_minutes))
    return blocks


def summarize_student_hours(
    result: ScheduleResult, grid: TimeGrid, student: Student
) -> dict:
    """학생 1명의 일별/주별/전체 근무 시간(시간 단위)."""
    per_day: dict[date, float] = {}
    for day, slots in result.slots_of_student(student.student_id).items():
        per_day[day] = grid.slots_to_hours(len(slots))
    per_week: dict[tuple[int, int], float] = {}
    for day, hours in per_day.items():
        iso = day.isocalendar()
        key = (iso.year, iso.week)
        per_week[key] = per_week.get(key, 0) + hours
    return {
        "per_day": per_day,
        "per_week": per_week,
        "total": sum(per_day.values()),
    }


def print_report(
    result: ScheduleResult,
    grid: TimeGrid,
    students: list[Student],
    calendar: AcademicCalendar,
) -> None:
    print(f"\n{'=' * 64}")
    print(f"솔버 상태: {result.status}  (풀이 {result.solve_time_seconds:.2f}초)")
    if not result.is_feasible:
        print("해를 찾지 못했습니다. Hard Constraint 설정을 점검하세요.")
        return
    print(f"목적함수(총 페널티): {result.objective_value}")
    if result.penalty_breakdown:
        print("페널티 내역:")
        for name, value in result.penalty_breakdown.items():
            print(f"  - {name}: {value}")

    by_id = {s.student_id: s for s in students}

    print(f"\n{'=' * 64}\n[날짜별 시간표]")
    for day in grid.dates:
        slots = grid.slots_of(day)
        label = f"{day} ({_WEEKDAY_KO[day.weekday()]})"
        if not slots:
            print(f"\n{label}  — 폐관")
            continue
        open_range = f"{minutes_to_str(slots[0])}~{minutes_to_str(slots[-1] + grid.slot_minutes)}"
        notes = []
        if calendar.is_public_holiday(day):
            notes.append("공휴일")
        if calendar.is_school_only_holiday(day):
            notes.append("교내휴강")
        if calendar.is_exam_extended_weekend(day):
            notes.append("시험기간 연장개관")
        note = f"  [{', '.join(notes)}]" if notes else ""
        print(f"\n{label}  개관 {open_range}{note}")

        day_assignments = result.assignments.get(day, {})
        student_slots: dict[str, list[int]] = {}
        for minute, sids in day_assignments.items():
            for sid in sids:
                student_slots.setdefault(sid, []).append(minute)
        if not student_slots:
            print("  (배정 없음)")
        for sid in sorted(student_slots):
            blocks = merge_blocks(student_slots[sid], grid.slot_minutes)
            ranges = ", ".join(
                f"{minutes_to_str(s)}~{minutes_to_str(e)}" for s, e in blocks
            )
            print(f"  {sid} {by_id[sid].name}: {ranges}")

        day_shortages = [s for s in result.shortages if s.day == day]
        for shortage in merge_shortage_blocks(day_shortages, grid.slot_minutes):
            print(f"  ⚠ 인원 부족: {shortage}")

    print(f"\n{'=' * 64}\n[개인별 근무 시간 집계]")
    week_keys = sorted({(d.isocalendar().year, d.isocalendar().week) for d in grid.dates})
    header = "  ".join(f"{y}-W{w:02d}" for y, w in week_keys)
    print(f"{'학생':<14} {header}  2주합  재원")
    for student in students:
        summary = summarize_student_hours(result, grid, student)
        weekly = "  ".join(
            f"{summary['per_week'].get(k, 0):>7.1f}h" for k in week_keys
        )
        funding = "교비" if student.funding_type == FundingType.GYOBI else "국가"
        label = (
            student.name
            if student.student_id == student.name
            else f"{student.student_id} {student.name}"
        )
        print(f"{label:<12} {weekly}  {summary['total']:>5.1f}h  {funding}")

    gyobi_total = sum(
        summarize_student_hours(result, grid, s)["total"]
        for s in students
        if s.funding_type == FundingType.GYOBI
    )
    gukga_total = sum(
        summarize_student_hours(result, grid, s)["total"]
        for s in students
        if s.funding_type == FundingType.GUKGA
    )
    print(f"\n부서 교비 기간 총합: {gyobi_total:.1f}h")
    print(f"부서 국가 기간 총합: {gukga_total:.1f}h")

    if result.shortages:
        print(f"\n⚠ 최소 인원 미달 슬롯 {len(result.shortages)}개 — 가능 시간 추가 수합 또는 인원 충원 필요")


def merge_shortage_blocks(shortages, slot_minutes: int) -> list[str]:
    """같은 날짜의 연속 부족 슬롯을 사람이 읽기 좋은 구간 문자열로 병합."""
    if not shortages:
        return []
    slots = [s.slot_min for s in shortages]
    blocks = merge_blocks(slots, slot_minutes)
    required = shortages[0].required
    return [
        f"{minutes_to_str(s)}~{minutes_to_str(e)} (최소 {required}명 미달)" for s, e in blocks
    ]
