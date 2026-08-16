"""정책·캘린더·샘플 데이터 JSON 로더.

지금은 파일 기반이지만, 로더 함수의 반환 타입(도메인 객체)을 유지한 채
내부 구현만 DB 조회로 바꾸면 되도록 로딩 창구를 이 모듈로 일원화한다.
"""

import json
from datetime import date
from pathlib import Path

from ..domain import AcademicCalendar, DepartmentPolicy, Student

CONFIG_DIR = Path(__file__).parent


def _load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_department_policy(department_id: str) -> DepartmentPolicy:
    path = CONFIG_DIR / "departments" / f"{department_id}.json"
    return DepartmentPolicy.from_dict(_load_json(path))


def load_academic_calendar(year: int) -> AcademicCalendar:
    path = CONFIG_DIR / f"academic_calendar_{year}.json"
    return AcademicCalendar.from_dict(_load_json(path))


def load_sample_students(name: str = "students_sample") -> tuple[list[Student], date, int]:
    """샘플 학생 데이터와 스케줄링 대상 기간(시작일, 일수)을 로드."""
    raw = _load_json(CONFIG_DIR / "sample" / f"{name}.json")
    students = [Student.from_dict(s) for s in raw["students"]]
    horizon = raw["horizon"]
    return students, date.fromisoformat(horizon["start_date"]), horizon["num_days"]
