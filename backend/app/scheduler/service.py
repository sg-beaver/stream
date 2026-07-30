"""근무표 생성 API 어댑터 (서비스 레이어).

라우터(HTTP)와 스케줄러 모듈(순수 도메인) 사이의 얇은 어댑터.
- 입력: 부서 ID, 스케줄링 기간
- 처리: 정책·캘린더·가능시간 로드 → 도메인 객체 변환 → CP-SAT 솔버 실행
- 출력: 프론트엔드가 그대로 렌더링할 수 있는 JSON dict
  (배정 목록 + 판단 근거: 부족 슬롯·가능 후보·페널티 내역·개인별 집계)

TODO(DB 연동): 지금은 config/ JSON에서 읽는다. availability·department_policy
테이블이 생기면 아래 _load_* 함수 내부만 DB 조회로 교체한다 (반환 타입 유지).
"""

from dataclasses import dataclass
from datetime import date

from .config import (
    load_academic_calendar,
    load_department_policy,
    load_sample_students,
)
from .domain import AcademicCalendar, ScheduleResult, Student, TimeGrid, minutes_to_str
from .engine import ScheduleSolver
from .reporting import merge_blocks, summarize_student_hours

_WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]

# TODO(DB): departments 테이블의 id ↔ 정책 파일 매핑. 지금은 MVP 부서 하나.
# 공용 시드(scripts/seed_mock_data.py) 기준: 2 = 로욜라도서관 정보서비스팀
_DEPARTMENT_POLICY_IDS = {2: "library_info_service"}
_DEFAULT_SAMPLE = "students_sample"


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


def generate_schedule(req: GenerateRequest) -> dict:
    policy_id = _DEPARTMENT_POLICY_IDS.get(req.department_id)
    if policy_id is None:
        raise DepartmentNotFound(f"부서 {req.department_id}의 스케줄링 정책이 없습니다.")

    policy = load_department_policy(policy_id)
    calendar = load_academic_calendar(req.start_date.year)
    students = _load_students(req.department_id)

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


def _load_students(department_id: int) -> list[Student]:
    """TODO(DB): availability 테이블에서 부서 소속 학생 가능시간 조회로 교체."""
    students, _, _ = load_sample_students(_DEFAULT_SAMPLE)
    return students


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
