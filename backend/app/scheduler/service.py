"""근무표 생성 API 어댑터 (서비스 레이어).

라우터(HTTP)와 스케줄러 모듈(순수 도메인) 사이의 얇은 어댑터.
- 입력: 부서 ID, 스케줄링 기간
- 처리: 정책·캘린더·가능시간 로드 → 도메인 객체 변환 → CP-SAT 솔버 실행
- 출력: 프론트엔드가 그대로 렌더링할 수 있는 JSON dict
  (배정 목록 + 판단 근거: 부족 슬롯·가능 후보·페널티 내역·개인별 집계)

가능시간은 DB(AvailableTime + AvailabilityException)에서 조회해
materialize_availability()로 날짜별 구간으로 전개한 뒤 Student.date_schedule에
담는다. 재원 구분(funding_type)과 활동 기간은 합격 공고 기준으로 채운다.
정책 파일 키는 DepartmentPolicy.policy_file_key로 조회한다.
"""

import logging
from dataclasses import dataclass, replace
from datetime import date, time, timedelta

from sqlalchemy.orm import Session

from app import models
from app.services import term_filter, term_segments

from .config import load_academic_calendar, load_department_policy
from .domain import (
    AcademicCalendar,
    DaySchedule,
    DepartmentPolicy,
    FundingType,
    OpeningHoursResolver,
    PeriodType,
    ScheduleResult,
    Student,
    StudentPreferences,
    TimeGrid,
    WeeklyTimeMap,
    Weekday,
    WorkSlotBlock,
    minutes_to_str,
    parse_work_slot_block,
    str_to_minutes,
    validate_work_slots_tiling,
)
from .engine import ScheduleSolver
from .loader.availability import (
    AvailabilityExceptionRow,
    AvailableTimeRow,
    materialize_availability,
)
from .reporting import merge_blocks, summarize_student_hours

logger = logging.getLogger(__name__)

_WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]

# policy_file_key가 없는(NULL) 부서에 적용할 기본 정책 파일.
# 공용 시드(scripts/seed_mock_data.py)는 department_policy.policy_file_key를
# 채우지 않으므로, 현재 seed 데이터 기준 department_id=2(로욜라도서관
# 정보서비스팀) 포함 모든 부서가 이 기본값으로 귀결된다.
_DEFAULT_POLICY_FILE_KEY = "library_info_service"

# student.funding_type이 비었거나 알 수 없는 값일 때 적용할 재원 구분.
# 주 상한이 더 낮은 교비(14h)로 잡아 규정 초과 배정을 막는다.
_DEFAULT_FUNDING_TYPE = FundingType.GYOBI

# preference(1=하/2=중/3=상) 중 이 값 이상만 '희망 시간'(preferred)으로 취급
_PREFERRED_THRESHOLD = 3


@dataclass(frozen=True)
class _Engagement:
    """학생 한 명의 부서 근로 관계 — 합격 공고에서 뽑은 신원·재원·활동 기간."""

    name: str
    funding_type: FundingType
    active_from: date | None
    active_until: date | None


class DepartmentNotFound(Exception):
    pass


class ScheduleInfeasible(Exception):
    """Hard Constraint 충돌로 해가 없음이 증명된 경우 (스펙 409 응답용)."""


class ScheduleTimeout(Exception):
    """시간 제한 내에 해를 찾지 못한 경우 (해 없음이 증명된 것이 아님)."""


@dataclass
class GenerateRequest:
    department_id: int
    start_date: date
    num_days: int = 14  # 2주 단위 권장 (2주 교비 총합 제약과 정합)
    time_limit_seconds: float = 30.0  # 해 하나당 시간 제한
    # 동률 해 열거: 페널티 총합이 같은(또는 더 낮은) 서로 다른 배정안 개수
    num_alternatives: int = 1
    min_difference_slots: int = 4  # 대안 간 최소 슬롯 차이 (30분 슬롯 기준)
    # 학기 고정 시간표용 대표 패턴 생성 모드 — 국가근로 주간 상한을 조여
    # 주 단위 복제 후에도 월 46시간 상한이 구조적으로 지켜지게 한다
    semester_pattern: bool = False
    # 챗봇 세션 임시 배율 (#136, 결정 15) — 부서 저장 배율 위에 곱으로 겹친다.
    # 부서 정책(department_policy.soft_weight_scales)은 바꾸지 않는다
    extra_weight_scales: dict[str, float] | None = None


# 주간 패턴을 학기 내내 반복하면 한 달에 같은 요일이 최대 5번 온다.
# 국가근로 월 46시간(HC-TIME-3)을 복제 후에도 보장하려면 주간 상한이
# floor(46/5) = 9시간이어야 한다 (9 × 5 = 45 ≤ 46). 교비는 월 상한이 없고,
# 부서 2주 총합(HC-TIME-4)은 stride 14일 복제 시 창이 동일 패턴이라 자동 준수.
_SEMESTER_PATTERN_GUKGA_WEEKLY_MAX = 9.0


def _tighten_for_semester_pattern(policy: DepartmentPolicy) -> DepartmentPolicy:
    limits = replace(
        policy.hour_limits,
        gukga_weekly_max_hours={
            period: min(hours, _SEMESTER_PATTERN_GUKGA_WEEKLY_MAX)
            for period, hours in policy.hour_limits.gukga_weekly_max_hours.items()
        },
    )
    return replace(policy, hour_limits=limits)


def apply_department_overrides(
    db: Session, department_id: int, policy: DepartmentPolicy
) -> DepartmentPolicy:
    """부서 담당자가 화면에서 저장한 설정을 정책 파일 값 위에 덮어쓴다.

    저장하지 않은 항목은 정책 파일 값을 그대로 쓴다.
    """
    # 부서 운영 상한은 department 테이블에 있어 정책 행이 없어도 적용해야 한다
    policy = _apply_department_weekly_limit(db, department_id, policy)

    row = _department_policy_row(db, department_id)
    if row is None:
        return policy

    policy = _apply_stored_opening_hours(department_id, policy, row.opening_hours)
    policy = _apply_stored_work_slots(department_id, policy, row.work_slots)
    policy = _apply_stored_staffing(policy, row.min_per_slot, row.max_per_slot)
    policy = _apply_stored_biweekly_limit(policy, row.biweekly_max_hours)
    policy = _apply_stored_soft_scales(policy, row.soft_weight_scales)
    return _reconcile_work_slots(department_id, policy)


def _apply_department_weekly_limit(
    db: Session, department_id: int, policy: DepartmentPolicy
) -> DepartmentPolicy:
    """부서가 정한 주간 운영 상한(`department.weekly_hour_limit`)을 법정 상한 위에 겹친다 (#161).

    솔버가 이 값을 모르면 부서 상한을 넘는 근무표를 내는데, 확정은 그 상한을
    검사하므로 **생성은 되고 확정은 막히는** 상태가 된다. 실제로 정보서비스팀은
    부서 상한이 15h인데 국가 근로 법정 상한이 학기 20h라, 솔버가 20h를 배정하고
    confirm이 400으로 거부했다.

    교비는 보통 법정 상한(14h)이 더 낮아 이 값이 걸리지 않는다 — 국가처럼 법정
    상한이 부서 상한보다 높은 경우에만 좁혀진다.
    """
    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == department_id)
        .first()
    )
    limit = department.weekly_hour_limit if department else None
    if not limit:
        return policy

    limits = policy.hour_limits
    return replace(
        policy,
        hour_limits=replace(
            limits,
            gyobi_weekly_max_hours=min(limits.gyobi_weekly_max_hours, float(limit)),
            gukga_weekly_max_hours={
                period: min(hours, float(limit))
                for period, hours in limits.gukga_weekly_max_hours.items()
            },
        ),
    )


def _apply_stored_biweekly_limit(
    policy: DepartmentPolicy, biweekly_max_hours: int | None
) -> DepartmentPolicy:
    """저장된 2주 교비 총합 상한을 반영 (BiweeklyDeptGyobiLimitConstraint가 읽는 값)."""
    if biweekly_max_hours is None:
        return policy
    limits = replace(
        policy.hour_limits, gyobi_biweekly_dept_total_max_hours=biweekly_max_hours
    )
    return replace(policy, hour_limits=limits)


def _apply_stored_soft_scales(
    policy: DepartmentPolicy, scales: dict | None
) -> DepartmentPolicy:
    """저장된 페널티 카테고리 배율을 반영. 실제 곱셈은 ModelContext.add_penalty에서 한다."""
    if not scales:
        return policy
    return replace(policy, soft_weight_scales={k: float(v) for k, v in scales.items()})


def _apply_stored_staffing(
    policy: DepartmentPolicy, min_per_slot: int | None, max_per_slot: int | None
) -> DepartmentPolicy:
    """저장된 최소·최대 배정 인원을 반영. allow_understaffing_with_penalty는 정책 파일 값 유지."""
    if min_per_slot is None and max_per_slot is None:
        return policy
    staffing = replace(
        policy.staffing,
        min_per_slot=min_per_slot if min_per_slot is not None else policy.staffing.min_per_slot,
        max_per_slot=max_per_slot if max_per_slot is not None else policy.staffing.max_per_slot,
    )
    return replace(policy, staffing=staffing)


def _apply_stored_opening_hours(
    department_id: int, policy: DepartmentPolicy, stored: dict | None
) -> DepartmentPolicy:
    """저장된 개관 시간을 반영. 담당자가 일부 기간만 저장했으면 그 기간만 교체한다."""
    if not stored:
        return policy

    opening = {period: dict(by_day) for period, by_day in policy.opening_hours.items()}
    for period_key, by_day in stored.items():
        try:
            period = PeriodType(period_key)
        except ValueError:  # 알 수 없는 기간 키는 무시 (정책 파일 값 유지)
            logger.warning("부서 %s의 알 수 없는 개관 기간 키: %s", department_id, period_key)
            continue
        # 저장된 기간은 통째로 교체 — 담당자가 비운 요일은 폐관이 되어야 한다
        opening[period] = {
            weekday: [] for weekday in policy.opening_hours.get(period, {})
        }
        for day_key, ranges in by_day.items():
            weekday = Weekday(int(day_key) - 1)  # API는 월=1, Weekday는 월=0
            opening[period][weekday] = [
                (str_to_minutes(start), str_to_minutes(end)) for start, end in ranges
            ]

    return replace(policy, opening_hours=opening)


def expand_weekly_pattern(
    items: list[tuple[str, date, int, int]],
    period_start: date,
    period_end: date,
    repeat_until: date,
    resolver: OpeningHoursResolver,
) -> tuple[list[tuple[str, date, int, int]], list[dict]]:
    """확정 배정(대표 기간)을 주 단위로 repeat_until까지 복제한다 (학기 고정 시간표).

    항목은 (student_id, 날짜, 시작 분, 종료 분). stride는 기간 일수를 7의 배수로
    올림해 요일을 보존한다. 복제된 각 날짜는 그날의 실제 개관 구간(공휴일 단축·
    시험 연장·폐관 반영, HC-OPEN-1..6)과 교집합을 취한다 — 폐관이면 행 제거,
    개관이 좁으면 잘라내고 다구간이면 분할하며, 조정된 날짜 목록을 함께 돌려준다.
    원본 기간(오프셋 0)은 솔버가 이미 개관을 반영했으므로 그대로 둔다.
    """
    period_days = (period_end - period_start).days + 1
    stride = -(-period_days // 7) * 7  # 7의 배수로 올림

    expanded = list(items)
    adjusted: dict[date, str] = {}
    offset = stride
    while period_start + timedelta(days=offset) <= repeat_until:
        for student_id, work_date, start_min, end_min in items:
            new_date = work_date + timedelta(days=offset)
            if new_date > repeat_until:
                continue
            open_ranges = resolver.resolve(new_date)
            if not open_ranges:
                adjusted[new_date] = "폐관 제외"
                continue
            pieces = [
                (max(start_min, open_min), min(end_min, close_min))
                for open_min, close_min in open_ranges
                if max(start_min, open_min) < min(end_min, close_min)
            ]
            if pieces != [(start_min, end_min)]:
                # 폐관 제외가 이미 기록된 날짜(다른 학생 행)는 더 강한 사유를 유지
                adjusted.setdefault(new_date, "개관 시간에 맞춰 조정")
            expanded.extend(
                (student_id, new_date, piece_start, piece_end)
                for piece_start, piece_end in pieces
            )
        offset += stride

    expanded.sort(key=lambda row: (row[1], row[2], row[0]))
    return expanded, [
        {"date": d, "reason": reason} for d, reason in sorted(adjusted.items())
    ]


def _apply_stored_work_slots(
    department_id: int, policy: DepartmentPolicy, stored: dict | None
) -> DepartmentPolicy:
    """저장된 근무 슬롯(#89)을 반영. 저장된 기간은 통째로 교체한다."""
    if not stored:
        return policy

    work_slots = {period: dict(by_day) for period, by_day in policy.work_slots.items()}
    for period_key, by_day in stored.items():
        try:
            period = PeriodType(period_key)
        except ValueError:
            logger.warning(
                "부서 %s의 알 수 없는 근무 슬롯 기간 키: %s", department_id, period_key
            )
            continue
        work_slots[period] = {}
        for day_key, blocks in by_day.items():
            weekday = Weekday(int(day_key) - 1)  # API는 월=1, Weekday는 월=0
            # 블록별 배정 인원(#171)이 붙은 dict 형식과 옛 [시작, 종료] 형식을 함께 읽는다
            work_slots[period][weekday] = [parse_work_slot_block(b) for b in blocks]

    return replace(policy, work_slots=work_slots)


def merge_stored_hours(
    department_id: int,
    policy: DepartmentPolicy,
    stored_opening: dict | None,
    stored_work_slots: dict | None,
) -> DepartmentPolicy:
    """저장된 개관 시간·근무 슬롯만 정책 파일 위에 병합한다 (타일링 정리는 하지 않음).

    PATCH 검증처럼 '저장 반영 후 조합이 유효한가'를 봐야 하는 곳에서 쓴다 —
    apply_department_overrides는 어긋난 블록을 조용히 걸러내므로 검증에 못 쓴다.
    """
    policy = _apply_stored_opening_hours(department_id, policy, stored_opening)
    return _apply_stored_work_slots(department_id, policy, stored_work_slots)


def _reconcile_work_slots(
    department_id: int, policy: DepartmentPolicy
) -> DepartmentPolicy:
    """파일+DB 병합 후 개관 시간과 타일링이 깨진 (기간, 요일)의 블록을 끈다.

    담당자가 opening_hours만 저장하고 work_slots는 파일 기본값인 경우 등
    조합이 어긋날 수 있는데, 여기서 걸러 생성이 죽지 않게 한다 (경고 로그).
    """
    reconciled: dict[PeriodType, dict[Weekday, list[WorkSlotBlock]]] = {}
    changed = False
    for period, by_day in policy.work_slots.items():
        reconciled[period] = {}
        for weekday, blocks in by_day.items():
            if not blocks:  # 빈 목록은 미정의(자유 그리드)와 동일 — 정규화만 한다
                changed = True
                continue
            opening = policy.opening_hours.get(period, {}).get(weekday, [])
            error = validate_work_slots_tiling(opening, blocks, policy.slot_minutes)
            if error is None:
                reconciled[period][weekday] = blocks
            else:
                changed = True
                logger.warning(
                    "부서 %s의 근무 슬롯이 개관 시간과 맞지 않아 무시합니다 (%s %s요일): %s",
                    department_id,
                    period.value,
                    _WEEKDAY_KO[weekday.value],
                    error,
                )
    if not changed:
        return policy
    return replace(policy, work_slots=reconciled)


def generate_schedule(req: GenerateRequest, db: Session) -> dict:
    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == req.department_id)
        .first()
    )
    if department is None:
        raise DepartmentNotFound(f"부서 {req.department_id}의 스케줄링 정책이 없습니다.")

    policy_id = resolve_policy_file_key(db, req.department_id)
    policy = apply_department_overrides(
        db, req.department_id, load_department_policy(policy_id)
    )
    if req.semester_pattern:
        policy = _tighten_for_semester_pattern(policy)
    if req.extra_weight_scales:
        merged = dict(policy.soft_weight_scales)
        for category, scale in req.extra_weight_scales.items():
            merged[category] = merged.get(category, 1.0) * float(scale)
        policy = replace(policy, soft_weight_scales=merged)
    calendar = load_academic_calendar(req.start_date.year)
    period_end = req.start_date + timedelta(days=req.num_days - 1)
    students = _load_students(db, req.department_id, req.start_date, period_end)

    solver = ScheduleSolver(
        policy=policy,
        calendar=calendar,
        students=students,
        start_date=req.start_date,
        num_days=req.num_days,
    )
    results, ctx = solver.solve_alternatives(
        num_solutions=req.num_alternatives,
        time_limit_seconds=req.time_limit_seconds,
        min_difference_slots=req.min_difference_slots,
    )
    first = results[0]
    if not first.is_feasible:
        # UNKNOWN = 시간 내에 못 찾음(해가 없다는 증명 아님) → 409와 구분
        if first.status == "UNKNOWN":
            raise ScheduleTimeout(
                "시간 제한 내에 근무표를 생성하지 못했습니다. "
                "기간을 줄이거나 time_limit_seconds를 늘려 다시 시도해주세요."
            )
        raise ScheduleInfeasible(
            "제약조건을 만족하는 근무표를 생성할 수 없습니다. 가능시간 데이터를 확인해주세요."
        )
    response = _to_response(first, ctx.grid, calendar, students, policy_id)
    # 동률 대안들 (첫 해와 같은 구조, 배치만 다름) — 담당자가 비교 후 선택
    response["alternatives"] = [
        _to_response(r, ctx.grid, calendar, students, policy_id) for r in results[1:]
    ]
    response["num_alternatives_found"] = len(results)
    return response


def _department_policy_row(db: Session, department_id: int):
    return (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )


def resolve_policy_file_key(db: Session, department_id: int) -> str:
    """DepartmentPolicy.policy_file_key 조회. 없으면 기본 정책으로 대체하고 로그를 남긴다."""
    row = _department_policy_row(db, department_id)
    if row is None or row.policy_file_key is None:
        logger.warning(
            "부서 %s의 policy_file_key가 없어 기본 정책(%s)으로 대체합니다.",
            department_id,
            _DEFAULT_POLICY_FILE_KEY,
        )
        return _DEFAULT_POLICY_FILE_KEY
    return row.policy_file_key


def _load_students(
    db: Session, department_id: int, period_start: date, period_end: date
) -> list[Student]:
    return _load_students_from_db(db, department_id, period_start, period_end)


# 기근무로 칠 배치 상태 — draft도 포함한다. 아직 확정 전이어도 곧 확정될 배정이라,
# 빼지 않으면 다른 기간을 생성할 때 월 상한을 넘긴 조합이 만들어진다
# (routers/schedule.py의 주간 상한 검증이 draft를 세는 것과 같은 이유).
_PRIOR_HOURS_STATUSES = ("draft", "confirmed", "manual")


def _prior_monthly_hours(
    db: Session, period_start: date, period_end: date
) -> dict[str, dict[tuple[int, int], float]]:
    """학생별 (연, 월) → 스케줄링 기간 **밖**에 이미 잡혀 있는 근로 시간 (#159 후속).

    월 상한(HC-TIME-3)은 한 달 전체가 기준인데 생성은 보통 2주씩 끊는다. 이 값을
    빼주지 않으면 같은 달을 두 번 생성할 때 각 회차는 상한 안이어도 월 합계가 넘는다.

    기간 안 날짜는 세지 않는다 — 지금 다시 짜는 중이라 이번 결과로 대체되기 때문이다
    (같은 기간의 기존 draft를 이중으로 세지 않는 효과도 있다). 부서는 가리지 않는다:
    상한은 학생 개인에게 걸리는 것이라 다른 부서 근무도 같은 달에 합산된다.
    """
    months = set()
    day = period_start.replace(day=1)
    while day <= period_end:
        months.add((day.year, day.month))
        day = (day + timedelta(days=32)).replace(day=1)
    if not months:
        return {}

    month_starts = [date(y, m, 1) for y, m in sorted(months)]
    window_start = min(month_starts)
    last_year, last_month = max(months)
    window_end = date(
        last_year + (last_month == 12), (last_month % 12) + 1, 1
    ) - timedelta(days=1)

    rows = (
        db.query(models.WorkSchedule)
        .join(models.ScheduleBatch)
        .filter(
            models.WorkSchedule.work_date >= window_start,
            models.WorkSchedule.work_date <= window_end,
            models.ScheduleBatch.status.in_(_PRIOR_HOURS_STATUSES),
        )
        .all()
    )
    prior: dict[str, dict[tuple[int, int], float]] = {}
    for row in rows:
        if period_start <= row.work_date <= period_end:
            continue  # 이번에 다시 짜는 구간
        hours = (_minutes(row.end_time) - _minutes(row.start_time)) / 60
        key = (row.work_date.year, row.work_date.month)
        prior.setdefault(row.student_id, {})
        prior[row.student_id][key] = prior[row.student_id].get(key, 0.0) + hours
    return prior


def _load_students_from_db(
    db: Session, department_id: int, period_start: date, period_end: date
) -> list[Student]:
    """부서 소속 학생의 가능시간을 DB에서 조회해 Student 목록으로 조립한다.

    신원·재원·활동 기간은 합격 공고에서 가져온다 (_load_engagements):
    - funding_type: student.funding_type. 비었거나 알 수 없는 값이면 교비로 폴백
    - active_from/active_until: 합격 공고의 근로 기간(period_start/period_end)

    아래 Student 필드는 대응하는 DB 테이블이 없어 팀 논의로 정한 값으로 채운다:
    - class_times/exams/avoid_ranges: 근거 테이블 없음 → 빈 값
      (수업 시간은 "AVAILABLE_TIME에 등록 안 된 시간 = 수업 중"으로 이미 간접 처리하기로
      결정되어 있어 별도 저장이 필요 없다)
    - preferences: 근거 테이블 없음 → StudentPreferences() 기본값
    """
    engagements = _load_engagements(db, department_id)

    policy_row = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )
    availability_mode = policy_row.availability_mode if policy_row else "weekly_only"
    # 가능 시간은 학기마다 다르다 (#89 후속). 생성 기간이 학기 경계를 넘으면 날짜마다
    # 읽을 학기가 달라지므로 기간을 학기 구간으로 쪼개 구간별로 전개한다 (#156).
    segments = term_segments(period_start, period_end)

    prior_hours = _prior_monthly_hours(db, period_start, period_end)

    students: list[Student] = []
    for student_id, engagement in engagements.items():
        patterns_by_term = {
            term: [
                AvailableTimeRow(
                    day_of_week=row.day_of_week,
                    start_time=row.start_time,
                    end_time=row.end_time,
                    preference=row.preference,
                )
                for row in db.query(models.AvailableTime)
                .filter(
                    models.AvailableTime.student_id == student_id,
                    term_filter(models.AvailableTime.term, term),
                )
                .all()
            ]
            for term in {seg_term for seg_term, _, _ in segments}
        }

        exceptions = [
            AvailabilityExceptionRow(
                exception_date=row.exception_date,
                exception_type=row.exception_type,
                start_time=row.start_time,
                end_time=row.end_time,
                preference=row.preference,
            )
            for row in db.query(models.AvailabilityException)
            .filter(
                models.AvailabilityException.student_id == student_id,
                models.AvailabilityException.exception_date >= period_start,
                models.AvailabilityException.exception_date <= period_end,
            )
            .all()
        ]

        by_date: dict[date, list[tuple[time, time, int | None]]] = {}
        for seg_term, seg_start, seg_end in segments:
            by_date.update(
                materialize_availability(
                    weekly_patterns=patterns_by_term[seg_term],
                    exceptions=exceptions,
                    availability_mode=availability_mode,
                    period_start=seg_start,
                    period_end=seg_end,
                )
            )
        date_schedule = {
            day: DaySchedule(
                available=[
                    (_minutes(start), _minutes(end)) for start, end, _ in intervals
                ],
                # 결정: preference >= _PREFERRED_THRESHOLD(3="상")인 구간만 희망으로 취급
                preferred=[
                    (_minutes(start), _minutes(end))
                    for start, end, pref in intervals
                    if pref is not None and pref >= _PREFERRED_THRESHOLD
                ],
                classes=[],
            )
            for day, intervals in by_date.items()
        }

        students.append(
            Student(
                student_id=student_id,
                name=engagement.name,
                funding_type=engagement.funding_type,
                available=WeeklyTimeMap(),
                preferred=WeeklyTimeMap(),
                class_times=WeeklyTimeMap(),
                exams=[],
                unavailable_dates=set(),
                avoid_ranges=[],
                preferences=StudentPreferences(),
                date_schedule=date_schedule,
                active_from=engagement.active_from,
                active_until=engagement.active_until,
                prior_monthly_hours=prior_hours.get(student_id, {}),
            )
        )

    return students


def _load_engagements(db: Session, department_id: int) -> dict[str, _Engagement]:
    """부서 공고에 합격한 학생의 신원·재원·활동 기간을 student_id별로 모은다.

    소속 판정 규칙은 services.get_department_student_ids와 같지만, 여기서는
    활동 기간을 함께 써야 해서 공고 행까지 한 번에 조인한다.
    """
    rows = (
        db.query(models.Student, models.JobPosting)
        .join(
            models.Application,
            models.Application.student_id == models.Student.student_id,
        )
        .join(
            models.JobPosting,
            models.Application.posting_id == models.JobPosting.posting_id,
        )
        .filter(
            models.JobPosting.department_id == department_id,
            models.Application.status == "합격",
        )
        .all()
    )

    engagements: dict[str, _Engagement] = {}
    for student_row, posting in rows:
        # 담당자가 학생 관리에서 직접 저장한 활동 기간이 있으면 공고 기간 대신 그 값을 쓴다
        stored = (
            student_row.active_from is not None or student_row.active_until is not None
        )
        previous = engagements.get(student_row.student_id)
        if previous is None:
            engagements[student_row.student_id] = _Engagement(
                name=student_row.name,
                funding_type=_to_funding_type(student_row.funding_type),
                active_from=student_row.active_from if stored else posting.period_start,
                active_until=student_row.active_until if stored else posting.period_end,
            )
            continue
        if stored:
            continue  # 저장값 사용 중 — 공고 기간으로 넓히지 않는다
        # 같은 부서의 여러 공고에 합격한 경우 활동 기간을 합집합으로 넓힌다
        engagements[student_row.student_id] = replace(
            previous,
            active_from=_earlier(previous.active_from, posting.period_start),
            active_until=_later(previous.active_until, posting.period_end),
        )
    return engagements


def _to_funding_type(raw: str | None) -> FundingType:
    try:
        return FundingType(raw)
    except ValueError:
        logger.warning(
            "알 수 없는 funding_type(%r) — 기본값 %s로 처리합니다.",
            raw,
            _DEFAULT_FUNDING_TYPE.value,
        )
        return _DEFAULT_FUNDING_TYPE


def _earlier(left: date | None, right: date | None) -> date | None:
    """None은 '제한 없음'이므로 한쪽이라도 None이면 경계가 사라진다."""
    if left is None or right is None:
        return None
    return min(left, right)


def _later(left: date | None, right: date | None) -> date | None:
    if left is None or right is None:
        return None
    return max(left, right)


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _to_response(
    result: ScheduleResult,
    grid: TimeGrid,
    calendar: AcademicCalendar,
    students: list[Student],
    policy_id: str,
) -> dict:

    schedules = []
    for student in students:
        for day, slots in result.slots_of_student(student.student_id).items():
            for start, end in merge_blocks(slots, grid.slot_minutes):
                schedules.append(
                    {
                        "student_id": student.student_id,
                        "student_name": student.name,
                        "date": day.isoformat(),
                        "day_of_week": _WEEKDAY_KO[day.weekday()],
                        "start_time": minutes_to_str(start),
                        "end_time": minutes_to_str(end),
                        # 판단 근거: 학생이 '희망'으로 제출한 시간대인지
                        "preferred_match": all(
                            student.is_preferred(day, m)
                            for m in range(start, end, grid.slot_minutes)
                        ),
                    }
                )
    schedules.sort(key=lambda r: (r["date"], r["start_time"], r["student_id"]))

    shortages = [
        {
            "date": s.day.isoformat(),
            "day_of_week": _WEEKDAY_KO[s.day.weekday()],
            "start_time": minutes_to_str(s.slot_min),
            "end_time": minutes_to_str(s.slot_min + grid.slot_minutes),
            "required": s.required,
            "assigned": s.assigned,
            # 판단 근거: 이 슬롯에 올 수 있었던 후보 (없으면 추가 수합 필요)
            "candidates": [
                {"student_id": st.student_id, "student_name": st.name}
                for st in students
                if st.can_work(s.day, s.slot_min, calendar)
            ],
        }
        for s in result.shortages
    ]

    per_student = []
    for student in students:
        summary = summarize_student_hours(result, grid, student)
        per_student.append(
            {
                "student_id": student.student_id,
                "student_name": student.name,
                "funding_type": student.funding_type.value,
                "total_hours": summary["total"],
                "weekly_hours": {
                    f"{y}-W{w:02d}": h for (y, w), h in sorted(summary["per_week"].items())
                },
            }
        )

    # 학기 고정 확정의 종료일 기본값 — 시작일이 방학이면 null
    semester = calendar.semester_containing(grid.start_date)

    return {
        "policy_id": policy_id,
        "status": result.status,
        "generated_count": len(schedules),
        "schedules": schedules,
        "shortages": shortages,
        "penalty_summary": result.penalty_breakdown,
        # 이벤트별 상세 — 챗봇 explain_penalty 툴(#134)이 "어디서 누구에게 몇 점"을
        # 조회하는 원천. 총계(penalty_summary)만으로는 근거 있는 설명이 불가능하다.
        "penalty_events": [
            {
                "name": ev.name,
                "cost": ev.cost,
                "amount": ev.amount,
                "student_id": ev.student_id,
                "day": ev.day.isoformat() if ev.day else None,
                "minute": ev.minute,
            }
            for ev in result.penalty_events
        ],
        "per_student": per_student,
        "solve_time_seconds": round(result.solve_time_seconds, 2),
        # OPTIMAL이 "격차 한계 이내 최적"을 뜻할 수 있어 하한을 함께 남긴다 (#143)
        "best_objective_bound": result.best_objective_bound,
        "objective_value": result.objective_value,
        "semester_end": semester.end.isoformat() if semester else None,
    }
