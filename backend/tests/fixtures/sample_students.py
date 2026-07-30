"""테스트 전용 샘플 학생 데이터 픽스처.

실제 함수/데이터(scheduler/config/sample/students_sample.json)는
CLI 프로토타입 도구(scheduler/prototype.py, scheduler/tools/import_xlsx.py)가
여전히 사용 중이라 그대로 두고, 여기서는 pytest에서 쓰기 좋은 이름으로만
얇게 재노출한다. 프로덕션 경로(scheduler/service.py)는 더 이상 이 데이터를
사용하지 않는다 — DB(AvailableTime/AvailabilityException)에서 직접 읽는다.
"""

from datetime import date

from app.scheduler.config import load_sample_students
from app.scheduler.domain import Student


def load_test_students(name: str = "students_sample") -> tuple[list[Student], date, int]:
    return load_sample_students(name)
