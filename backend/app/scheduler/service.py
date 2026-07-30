"""근무표 생성 API 어댑터 (서비스 레이어).

라우터(HTTP)와 스케줄러 모듈(순수 도메인) 사이의 얇은 어댑터.
- 입력: 부서 ID, 스케줄링 기간
- 처리: 정책·캘린더·가능시간 로드 → 도메인 객체 변환 → CP-SAT 솔버 실행
- 출력: 프론트엔드가 그대로 렌더링할 수 있는 JSON dict
  (배정 목록 + 판단 근거: 부족 슬롯·가능 후보·페널티 내역·개인별 집계)

가능시간은 DB(AvailableTime + AvailabilityException)에서 조회해
materialize_availability()로 날짜별 구간으로 전개한 뒤 Student.date_schedule에
담는다. 정책 파일 키는 DepartmentPolicy.policy_file_key로 조회한다.
"""

import logging
from dataclasses import dataclass
from datetime import date, time, timedelta

from sqlalchemy.orm import Session

from app import models
from app.services import get_department_student_ids

from .config import load_academic_calendar, load_department_policy
from .domain import (
    AcademicCalendar,
    DaySchedule,
    FundingType,
    ScheduleResult,
    Student,
    StudentPreferences,
    TimeGrid,
    WeeklyTimeMap,
    minutes_to_str,
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

# TODO(DB): funding_type 컬럼이 student 테이블에 없어 전원 교비로 임시 고정.
# 실제 재원 구분 컬럼이 추가되면 이 상수 대입을 제거하고 DB 값을 사용한다.
_DEFAULT_FUNDING_TYPE = FundingType.GYOBI

# preference(1=하/2=중/3=상) 중 이 값 이상만 '희망 시간'(preferred)으로 취급
_PREFERRED_THRESHOLD = 3


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


def generate_schedule(req: GenerateRequest, db: Session) -> dict:
    department = (
        db.query(models.Department)
        .filter(models.Department.department_id == req.department_id)
        .first()
    )
    if department is None:
        raise DepartmentNotFound(f"부서 {req.department_id}의 스케줄링 정책이 없습니다.")

    policy_id = _resolve_policy_file_key(db, req.department_id)
    policy = load_department_policy(policy_id)
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


def _resolve_policy_file_key(db: Session, department_id: int) -> str:
    """DepartmentPolicy.policy_file_key 조회. 없으면 기본 정책으로 대체하고 로그를 남긴다."""
    row = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )
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


def _load_students_from_db(
    db: Session, department_id: int, period_start: date, period_end: date
) -> list[Student]:
    """부서 소속 학생의 가능시간을 DB에서 조회해 Student 목록으로 조립한다.

    아래 Student 필드는 대응하는 DB 테이블이 없어 팀 논의로 정한 값으로 채운다:
    - funding_type: 전원 _DEFAULT_FUNDING_TYPE(교비)으로 임시 고정
    - class_times/exams/avoid_ranges: 근거 테이블 없음 → 빈 값
      (수업 시간은 "AVAILABLE_TIME에 등록 안 된 시간 = 수업 중"으로 이미 간접 처리하기로
      결정되어 있어 별도 저장이 필요 없다)
    - preferences: 근거 테이블 없음 → StudentPreferences() 기본값
    - active_from/active_until: 근거 컬럼 없음 → None(제한 없음)
    """
    student_ids = get_department_student_ids(db, department_id)

    policy_row = (
        db.query(models.DepartmentPolicy)
        .filter(models.DepartmentPolicy.department_id == department_id)
        .first()
    )
    availability_mode = policy_row.availability_mode if policy_row else "weekly_only"

    students: list[Student] = []
    for student_id in student_ids:
        student_row = (
            db.query(models.Student).filter(models.Student.student_id == student_id).first()
        )
        if student_row is None:
            continue

        weekly_patterns = [
            AvailableTimeRow(
                day_of_week=row.day_of_week,
                start_time=row.start_time,
                end_time=row.end_time,
                preference=row.preference,
            )
            for row in db.query(models.AvailableTime)
            .filter(models.AvailableTime.student_id == student_id)
            .all()
        ]

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

        by_date = materialize_availability(
            weekly_patterns=weekly_patterns,
            exceptions=exceptions,
            availability_mode=availability_mode,
            period_start=period_start,
            period_end=period_end,
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
                student_id=student_row.student_id,
                name=student_row.name,
                funding_type=_DEFAULT_FUNDING_TYPE,
                available=WeeklyTimeMap(),
                preferred=WeeklyTimeMap(),
                class_times=WeeklyTimeMap(),
                exams=[],
                unavailable_dates=set(),
                avoid_ranges=[],
                preferences=StudentPreferences(),
                date_schedule=date_schedule,
                active_from=None,
                active_until=None,
            )
        )

    return students


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

    return {
        "policy_id": policy_id,
        "status": result.status,
        "generated_count": len(schedules),
        "schedules": schedules,
        "shortages": shortages,
        "penalty_summary": result.penalty_breakdown,
        "per_student": per_student,
        "solve_time_seconds": round(result.solve_time_seconds, 2),
    }
