"""팀 공용 개발 시드 데이터 주입 스크립트 (이슈 #49).

frontend/src/api/devMockData.js와 동일한 내용(부서·공고·계정·지원 내역)을
DB에 넣어, 팀원 전원이 같은 mock 데이터로 FE-BE 통합 환경을 실행할 수 있게 한다.

데모 시나리오 (계정 명단은 팀 합의, 2026-07-30):
- 근로를 알아보는 학생 안희진(20220081): 공고 조회·지원 데모 — 공고 5건 지원 상태
- 정보서비스팀 근로 학생 9명: 시간표 생성 데모 — 마감된 공고 6에 "합격" 상태
  (부서 가능시간 수합 API가 "부서 공고 합격자"를 근로 학생으로 판별)
  국가/교비 구분은 student.funding_type 컬럼과 scheduler/config/sample/students_sample.json에 동일하게 존재
- 정보서비스팀 직원 박정보(STF001): 근로 학생 관리 데모
- 대타 데모(이슈 #72): 다음 주부터 2주 확정 근무표(솔버 생성) + 상태별 대타 요청(대기·수락·승인·반려).
  날짜를 실행일 기준으로 잡아 언제 시드해도 학생 '대타 요청' 화면(오늘 이후 확정 근무)과
  관리자 처리 화면에 바로 나타난다.

가능 시간·수업 시간표는 학기별(term)로 넣는다 — 학기 중(2026-2)은 고정 시간표를
빼고 남는 시간, 방학(2026-summer)은 계절수업만 빼고 넓게 열어 둔 값이다.
학생 계정으로 로그인하면 그대로 화면에 체크된 상태로 보인다.

계정 명단·가능시간은 scripts/seed_data/*.csv에서 관리한다 (엑셀 편집 가능,
자세한 규칙은 scripts/seed_data/README.md). 공고·지원서처럼 중첩 구조인
데이터는 이 파일 안에 그대로 둔다.

사용법 (backend/ 디렉토리에서):
    python3 scripts/seed_mock_data.py                    # 빈 DB에만 주입 (데이터 있으면 중단)
    python3 scripts/seed_mock_data.py --reset           # 기존 데이터 전부 삭제 후 재주입
    python3 scripts/seed_mock_data.py --only test-dept  # 기존 데이터 유지, 부서 6만 추가

--reset은 시드 테이블을 통째로 TRUNCATE하므로 운영 DB에 쓰면 데모 데이터가
사라진다. STREAM_ENV=production 이면 거부한다 — 운영 DB에 검증용 부서를 붙일
때는 --only test-dept 를 쓴다 (이미 있으면 아무것도 하지 않는다).

모든 시드 계정의 비밀번호는 "stream1234" (개발 전용).
"""

import argparse
import csv
import datetime
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, ".")

from sqlalchemy import func, text  # noqa: E402

from app import models  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.routers.substitutes import _find_candidates  # noqa: E402
from app.schema_patches import apply_schema_patches  # noqa: E402
from app.scheduler.config import (  # noqa: E402
    load_academic_calendar,
    load_department_policy,
)
from app.scheduler.service import GenerateRequest, generate_schedule  # noqa: E402
from app.scheduler.verify import verify_batch  # noqa: E402

PASSWORD = "stream1234"

SEED_DATA_DIR = Path(__file__).parent / "seed_data"


def _read_csv(name):
    with open(SEED_DATA_DIR / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _weekly_cap_minutes(db, department_id, student_id, work_date):
    """그 학생의 주간 상한(분) — 대타 여력을 보여줄 때만 쓴다."""
    from app import models as _models
    from app.work_hours import weekly_cap_hours

    student = db.query(_models.Student).filter(
        _models.Student.student_id == student_id
    ).first()
    if student is None:
        return 0
    return int(weekly_cap_hours(db, department_id, student, work_date) * 60)


def _minutes_between(start, end):
    return (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)


def _time(hhmm):
    hh, mm = hhmm.split(":")
    return datetime.time(int(hh), int(mm))


def _tenure_start_date(student_id):
    """학번(student_id 앞 4자리 입학연도) 기준으로 근속 시작일을 대충 매핑한다.

    정확한 날짜는 의미 없고, 학번이 빠를수록 근속 시작일이 이르다는
    상대 순서만 맞으면 되는 데모용 값이다 (입학 다음 해 3/2 근무 시작으로 가정).
    """
    admission_year = int(student_id[:4])
    return datetime.date(admission_year + 1, 3, 2)


# ---- SAINT 학적 정보 (#122) ----
# 데모 기준 학기: 2026학년도 2학기 (시드 데이터가 2026-2학기 근무표를 다루므로 맞춘다)
_BASE_YEAR, _BASE_TERM = 2026, 2


def _academic_progress(student_id):
    """학번 앞 4자리(입학연도)로 학년·학기·이수학기를 계산한다.

    하드코딩하면 데모 기준 학기가 바뀔 때마다 어긋나므로 파생시킨다.
    예) 2022학번 · 2026-2학기 → 재학 10학기째, 이수 9학기, 4학년.
    """
    admission_year = int(student_id[:4])
    semester = (_BASE_YEAR - admission_year) * 2 + _BASE_TERM
    grade_year = min(4, -(-semester // 2))  # 올림 나눗셈, 4학년 상한
    return grade_year, semester, max(0, semester - 1)


def _student_email(student_id, override):
    """학번 기반 학교 메일. CSV에 값이 있으면 그것을 우선한다."""
    return override or f"{student_id}@sogang.ac.kr"


def _opt_date(value):
    return datetime.date.fromisoformat(value) if value else None


def _opt_int(value):
    return int(value) if value not in (None, "") else None


DEPARTMENTS = [
    (int(r["department_id"]), r["name"], _opt_int(r["weekly_hour_limit"]), int(r["headcount_to"]))
    for r in _read_csv("departments.csv")
]

# 정보서비스팀(department_id=2)만 자연어 운영 규칙을 채워 AI 검토(review) 데모용으로 쓴다.
# 다른 부서는 None으로 둬서, 규칙이 없는 부서에서 review가 어떻게 동작하는지도 테스트할 수 있게 한다.
DEPARTMENT_CUSTOM_RULES = {
    2: (
        "시험기간 전 주에는 신입을 혼자 배치하지 않는다.\n"
        "금요일 마감 시간대(17시 이후)에는 경험자가 최소 1명 있어야 한다.\n"
        "개관 첫 시간(09:00 슬롯)에는 가급적 같은 학생이 연속 배정되는 것이 좋다.\n"
        "금요일 19시~20시에는 가급적 근속 시작일이 이른 학생을 배치한다."
    ),
}

# 학생의 날짜별 예외 편집 허용 범위. MVP 부서인 정보서비스팀(2)은 매주 반복 시간표에
# 더해 주차별 수합(그 주만 빼기/더하기)까지 받는다 — 시험 주처럼 주마다 사정이 달라지는
# 학기 운영을 담기 위함. 나머지 부서는 기본값(weekly_only)으로 대비군을 남긴다.
DEPARTMENT_AVAILABILITY_MODES = {2: "weekly_with_exceptions", 6: "weekly_with_exceptions"}

# 스케줄러 정책 파일. 비우면 기본 파일로 폴백하며 경고 로그가 남는다 (#52).
# 정보서비스팀-test(6)는 같은 도서관 운영이라 정보서비스팀과 같은 정책을 쓴다.
DEPARTMENT_POLICY_FILES = {2: "library_info_service", 6: "library_info_service"}
DEFAULT_AVAILABILITY_MODE = "weekly_only"

STAFF = [
    (r["staff_id"], r["name"], int(r["department_id"]), r["email"], r["phone"])
    for r in _read_csv("staff.csv")
]

_students = _read_csv("students.csv")
def _student_tuple(r):
    """CSV 한 행 → 시드가 쓰는 학생 dict.

    학년·학기·이수학기와 이메일은 학번에서 파생하고, CSV에 값이 있으면 그것을 우선한다
    (파생값이 맞지 않는 예외 학생을 CSV로 덮어쓸 수 있게).
    """
    sid = r["student_id"]
    grade_year, semester, completed = _academic_progress(sid)
    # CSV가 학기를 지정하면(군 복무 등으로 파생값과 다른 학생) 학년도 그 학기 기준으로
    # 다시 계산한다 — 파생 학년을 그대로 두면 6학기인데 4학년으로 나온다.
    if r.get("semester"):
        semester = int(r["semester"])
        grade_year = min(4, -(-semester // 2))
        completed = max(0, semester - 1)
    return dict(
        student_id=sid,
        name=r["name"],
        department_name=r["department_name"],
        phone=r["phone"],
        funding_type=r["funding_type"],
        # 활동 기간 — 담당자가 관리하는 값 (빈 칸이면 공고 기간 파생)
        active_from=_opt_date(r.get("active_from")),
        active_until=_opt_date(r.get("active_until")),
        # ---- SAINT 학적 정보 (#122) ----
        email=_student_email(sid, r.get("email")),
        photo_url=r.get("photo_url") or None,
        enroll_status=r.get("enroll_status") or "재학",
        status_changed_at=_opt_date(r.get("status_changed_at")),
        degree_course=r.get("degree_course") or "학사",
        nationality=r.get("nationality") or "한국",
        advisor=r.get("advisor") or None,
        grade_year=_opt_int(r.get("grade_year")) or grade_year,
        semester=_opt_int(r.get("semester")) or semester,
        completed_semesters=_opt_int(r.get("completed_semesters")) or completed,
        birth_date=_opt_date(r.get("birth_date")),
        # 관심 분야는 한 칸에 여러 값이라 |로 구분한다 (쉼표는 CSV 구분자와 헷갈린다)
        interests=[x.strip() for x in (r.get("interests") or "").split("|") if x.strip()],
        # 운영 명단에 실제 근무시작일이 있으면 그것을 쓰고, 없으면 학번에서 파생한다
        tenure_start_date=_opt_date(r.get("tenure_start_date")) or _tenure_start_date(sid),
        is_team_lead=(r.get("is_team_lead") or "").strip().lower() == "true",
    )

# 근로를 알아보는 학생(role=applicant) — 공고 조회·지원 데모의 메인 계정
APPLICANT_STUDENT = next(_student_tuple(r) for r in _students if r["role"] == "applicant")

# 정보서비스팀 근로 학생(role=worker) — 시간표 생성 데모용, 공고 6 합격 자동 생성.
# 명단·장학 구분은 scheduler/config/sample/students_sample.json과 일치 유지.
WORKING_STUDENTS = [_student_tuple(r) for r in _students if r["role"] == "worker"]

# 정보서비스팀-test(부서 6) 근로 학생 10명 (role=test-worker) — 공고 7 합격 자동 생성.
# 운영 시트를 그대로 옮긴 실측 수합 데이터로 근무표 생성을 검증하기 위한 부서다.
TEST_DEPT_STUDENTS = [_student_tuple(r) for r in _students if r["role"] == "test-worker"]

# 공통 지원서 이력 (#122) — 비어 있으면 그 표는 시드되지 않는다.
# sort_order는 CSV에 적힌 순서를 그대로 쓴다 (학생별로 0부터).
STUDENT_CAREERS = [
    dict(
        student_id=r["student_id"], career_type=r["career_type"] or None,
        organization=r["organization"] or None, role=r["role"] or None,
        period_start=_opt_date(r.get("period_start")), period_end=_opt_date(r.get("period_end")),
        detail=r["detail"] or None,
    )
    for r in _read_csv("student_careers.csv")
]
STUDENT_LANGUAGES = [
    dict(
        student_id=r["student_id"], test_name=r["test_name"] or None,
        score=r["score"] or None, grade=r["grade"] or None,
        acquired_at=_opt_date(r.get("acquired_at")),
    )
    for r in _read_csv("student_languages.csv")
]
STUDENT_CERTIFICATES = [
    dict(
        student_id=r["student_id"], name=r["name"] or None, issuer=r["issuer"] or None,
        registration_number=r["registration_number"] or None,
        acquired_at=_opt_date(r.get("acquired_at")),
    )
    for r in _read_csv("student_certificates.csv")
]

# 주간 근무 가능 시간 (REQ-SCHED-001/002 데모용, day_of_week: 월=1).
# 학기(term)별로 따로 낸다 — 학기 중과 방학은 수업도 개관 시간도 다르다.
AVAILABLE_TIMES = [
    (r["term"] or None, r["student_id"], int(r["day_of_week"]),
     _time(r["start_time"]), _time(r["end_time"]), int(r["preference"]))
    for r in _read_csv("available_times.csv")
]

# 수강 시간표 (REQ-SCHED-015 데모용). 가능시간과 같은 학기 키를 쓰며,
# available_times.csv는 이 수업 시간을 이미 뺀 값이다 (겹치면 근무를 못 한다).
CLASS_TIMES = [
    (r["term"] or None, r["student_id"], int(r["day_of_week"]),
     _time(r["start_time"]), _time(r["end_time"]))
    for r in _read_csv("class_times.csv")
]

# ---- 정보서비스팀-test (부서 6) 운영 시트 수합 데이터 ----
#
# 운영 스프레드시트의 학생별 시트를 그대로 옮긴 값이다. 시트는 08/31~09/13 두 주를
# 날짜 단위로 받는데, 같은 요일이라도 1주차와 2주차 내용이 다르다 (개강 첫 주라
# 수업·일정이 아직 유동적). DB는 주간 패턴 + 날짜 예외 구조라 아래처럼 나눠 넣는다:
#
#   - 2026-2  주간 패턴 = 2주차(09/07~09/12) — '시간표 체크 완료'가 대부분 찍힌 주
#   - 2026-summer 주간 패턴 = 08/31(월) — 방학이라 학기 키가 다르다
#   - 1주차 09/01~09/05 = 날짜 예외 (종일 UNAVAILABLE로 지우고 그날 구간을 다시 넣음)
#
# 전사 정확도는 test_dept_daily_hours.csv(시트의 '근무 가능 시간' 행)로 검증한다.
TEST_DEPT_ID = 6
TEST_DEPT_POSTING_ID = 7
TEST_DEPT_STAFF_ID = "STF010"
_TEST_DEPT_SUMMER_MONDAY = datetime.date(2026, 8, 31)
_TEST_DEPT_PATTERN_DATES = [  # 2주차 월~토 = 가을학기 주간 패턴
    datetime.date(2026, 9, 7) + datetime.timedelta(days=i) for i in range(6)
]
_TEST_DEPT_WEEK1_DATES = [  # 1주차 화~토 = 날짜 예외로 덮는 날들
    datetime.date(2026, 9, 1) + datetime.timedelta(days=i) for i in range(5)
]
_TEST_DEPT_PREFERENCE = {"가능": 2, "희망": 3}  # 3(상)만 '근무 희망'으로 취급 (SC-PREF-1)


def _test_dept_grid():
    """(학생 이름, 날짜) → [(시작, 끝, 구분)] — 시트를 그대로 읽은 원본."""
    grid = {}
    for r in _read_csv("test_dept_availability.csv"):
        key = (r["student_name"], datetime.date.fromisoformat(r["date"]))
        grid.setdefault(key, []).append(
            (_time(r["start_time"]), _time(r["end_time"]), r["kind"])
        )
    return grid


def _build_test_dept_schedule():
    """운영 시트 → (주간 가능시간, 날짜 예외, 주간 수업시간).

    1주차 수업 시간은 주간 패턴으로 표현할 수 없어 넣지 않는다 — 근무표 생성은
    수업 시간표를 직접 읽지 않고 "가능시간에 없으면 근무 불가"로 처리하므로
    (SCHEDULER_SPEC 2.1) 배정 결과에는 영향이 없다. 화면 표시용 값이다.
    """
    grid = _test_dept_grid()
    student_ids = {s["name"]: s["student_id"] for s in TEST_DEPT_STUDENTS}
    available, exceptions, classes = [], [], []

    for name, student_id in student_ids.items():
        for term, day, key in (
            [("2026-summer", 1, _TEST_DEPT_SUMMER_MONDAY)]
            + [("2026-2", d.isoweekday(), d) for d in _TEST_DEPT_PATTERN_DATES]
        ):
            for start, end, kind in grid.get((name, key), []):
                if kind == "수업":
                    classes.append((term, student_id, day, start, end))
                else:
                    available.append(
                        (term, student_id, day, start, end, _TEST_DEPT_PREFERENCE[kind])
                    )

        for day in _TEST_DEPT_WEEK1_DATES:
            # 종일 UNAVAILABLE이 먼저 적용되고(그날 주간 패턴을 지움) 그 뒤에
            # AVAILABLE이 얹힌다 — 적용 순서는 loader/availability.py가 보장한다
            exceptions.append((student_id, day, "UNAVAILABLE", None, None, None))
            for start, end, kind in grid.get((name, day), []):
                if kind != "수업":
                    exceptions.append(
                        (student_id, day, "AVAILABLE", start, end,
                         _TEST_DEPT_PREFERENCE[kind])
                    )

    return available, exceptions, classes


TEST_DEPT_AVAILABLE_TIMES, TEST_DEPT_EXCEPTIONS, TEST_DEPT_CLASS_TIMES = (
    _build_test_dept_schedule()
)


# 시드 데이터가 유효한 상태(모집중/마감)를 유지하도록 devMockData.js의 7월 마감일을
# 학기 중 날짜로 옮겼다. devMockData.js도 같은 날짜를 사용한다 (이슈 #49).
# 상세 표시 필드(category~work_slots)는 #19 응답 확장분 (이슈 #55).
POSTINGS = [
    dict(
        posting_id=1, department_id=1, created_by="STF002", title="행정 업무 보조",
        description="민원 응대 및 학생지원팀 행정 업무 보조\n문서 정리, 자료 입력, 안내 자료 관리\n부서 내 단순 행정 업무 지원",
        qualification="엑셀 활용 가능자 우대\n문서 작성 및 자료 정리 경험자 우대\n월/수 요일 근무 가능자 우대",
        upload_date=datetime.date(2026, 7, 1), deadline=datetime.date(2026, 9, 25), status="모집중",
        category="교내 부서",
        period_start=datetime.date(2026, 8, 3), period_end=datetime.date(2026, 10, 30),
        headcount=2, weekly_max_hours=15, location="학생지원팀 사무실",
        contact_email="studentoffice@sogang.ac.kr", contact_phone="02-705-8000",
        work_slots=["월-10:00", "월-11:00", "월-12:00", "수-10:00", "수-11:00", "수-12:00"],
    ),
    dict(
        posting_id=2, department_id=2, created_by="STF001", title="참고서비스 제공",
        description="참고서비스 제공 및 자료실 이용 안내\n도서 정리 및 서가 관리\n자료 검색 지원",
        qualification="도서관 이용 경험자 우대\n성실하고 꼼꼼한 분",
        upload_date=datetime.date(2026, 6, 28), deadline=datetime.date(2026, 9, 20), status="모집중",
        category="도서관",
        period_start=datetime.date(2026, 8, 3), period_end=datetime.date(2026, 11, 27),
        headcount=1, weekly_max_hours=15, location="로욜라도서관 1층 정보서비스팀",
        contact_email="library@sogang.ac.kr", contact_phone="02-705-7100",
        work_slots=["화-14:00", "화-15:00", "화-16:00", "목-14:00", "목-15:00", "목-16:00"],
    ),
    dict(
        posting_id=3, department_id=3, created_by="STF003", title="논술 보조",
        description="논술 전형 운영 보조\n고사장 안내 및 수험생 응대\n답안지 정리·이송 보조",
        qualification="꼼꼼하고 성실한 분\n유사 업무 경험자 우대",
        upload_date=datetime.date(2026, 7, 5), deadline=datetime.date(2026, 9, 15), status="모집중",
        category="교내 부서",
        period_start=datetime.date(2026, 9, 21), period_end=datetime.date(2026, 10, 16),
        headcount=2, weekly_max_hours=15, location="입학팀 (본관)",
        contact_email="admission@sogang.ac.kr", contact_phone="02-705-8200",
        work_slots=["금-09:00", "금-10:00", "금-11:00", "금-13:00", "금-14:00", "금-15:00"],
    ),
    dict(
        posting_id=4, department_id=4, created_by="STF004", title="증명서·학생증 발급 보조",
        description="증명서·학생증 발급 창구 보조\n민원 접수 및 안내\n발급 서류 정리",
        qualification="민원 응대 경험 우대\n행정 업무 보조 경험 우대",
        upload_date=datetime.date(2026, 7, 3), deadline=datetime.date(2026, 9, 19), status="모집중",
        category="학과별 사무실",
        period_start=datetime.date(2026, 8, 3), period_end=datetime.date(2026, 10, 30),
        headcount=2, weekly_max_hours=10, location="종합봉사실 (학생회관)",
        contact_email="onestop@sogang.ac.kr", contact_phone="02-705-8300",
        work_slots=["월-09:00", "월-10:00", "월-11:00", "수-09:00", "수-10:00", "수-11:00"],
    ),
    dict(
        posting_id=5, department_id=5, created_by="STF005", title="발전홍보팀 지원 근로",
        description="학교 홍보 콘텐츠 제작 보조\n행사·캠페인 운영 지원\n홍보물 정리 및 발송",
        qualification="SNS 콘텐츠 제작 경험자 우대",
        upload_date=datetime.date(2026, 6, 20), deadline=datetime.date(2026, 6, 30), status="마감",
        category="교내 부서",
        period_start=datetime.date(2026, 7, 6), period_end=datetime.date(2026, 8, 28),
        headcount=1, weekly_max_hours=10, location="발전홍보팀 사무실",
        contact_email="pr@sogang.ac.kr", contact_phone="02-705-8400",
        work_slots=["수-13:00", "수-14:00", "금-13:00", "금-14:00"],
    ),
    # 정보서비스팀 근로 학생 9명이 합격해 있는 공고 (시간표 생성 데모의 근거 데이터).
    # 근로 기간이 곧 학생의 활동 기간이라, 이 기간 밖의 날짜로 생성하면 배정 대상이
    # 아무도 없어 전부 미충원으로 나온다 (scheduler가 active_from/until로 거른다).
    # 도서관은 방학에도 개관·근로가 있으므로(정책의 vacation opening_hours) 학기·방학을
    # 아우르는 2026학년도 기간으로 두어 아무 날짜로 생성해도 데모가 성립하게 한다.
    dict(
        posting_id=6, department_id=2, created_by="STF001", title="2026학년도 정보서비스팀 근로학생 모집",
        description="로욜라도서관 정보서비스팀 근로 (학기·방학)\n대출/반납 데스크, 서가 정리, 이용자 안내",
        qualification="성실하고 책임감 있는 분",
        upload_date=datetime.date(2026, 2, 10), deadline=datetime.date(2026, 2, 25), status="마감",
        category="도서관",
        period_start=datetime.date(2026, 3, 2), period_end=datetime.date(2026, 12, 18),
        headcount=9, weekly_max_hours=15, location="로욜라도서관 정보서비스팀",
        contact_email="library@sogang.ac.kr", contact_phone="02-705-7100",
        work_slots=None,
    ),
    # 정보서비스팀-test 근로 학생 10명이 합격해 있는 공고. 근로 기간이 곧 학생의
    # 활동 기간이므로(HC-CLASS-6) 시트가 다루는 08/31~09/13이 안에 들어와야 한다.
    dict(
        posting_id=7, department_id=6, created_by="STF010",
        title="2026학년도 정보서비스팀-test 근로학생 모집",
        description="근무표 생성 검증용 테스트 부서 근로\n운영 시트의 실제 수합 데이터를 그대로 쓴다",
        qualification="테스트 부서 — 실제 모집 공고가 아닙니다",
        upload_date=datetime.date(2026, 2, 10), deadline=datetime.date(2026, 2, 25), status="마감",
        category="도서관",
        period_start=datetime.date(2026, 3, 2), period_end=datetime.date(2026, 12, 18),
        headcount=10, weekly_max_hours=15, location="로욜라도서관 정보서비스팀 (test)",
        contact_email="library-test@sogang.ac.kr", contact_phone="02-705-7101",
        work_slots=None,
    ),
]


def build_cover_letter(motivation, self_intro, careers, slots):
    """frontend/src/utils/coverLetter.js buildCoverLetter()와 동일한 텍스트 형식.

    ApplicationDetailPage가 parseCoverLetter()로 되돌려 렌더링할 수 있어야 한다.
    """
    resume = {"careers": careers, "languages": [], "certificates": []}
    return "\n".join(
        [
            "[지원 동기]", motivation,
            "", "[자기소개]", self_intro,
            "", "[관련 경험 데이터]", json.dumps(resume, ensure_ascii=False),
            "", "[근무 가능 시간]", ", ".join(slots),
        ]
    )


def career(type_, org, role, start, end, detail):
    # commonApplication.js newCareerRow()와 같은 필드 구성 (id는 임의 문자열)
    return {
        "id": f"c-seed-{org}", "type": type_, "org": org, "role": role,
        "periodStart": start, "periodEnd": end, "detail": detail,
    }


# 데모 시나리오: 안희진(20220081)이 5개 공고에 모두 지원한 상태 (devMockData.myApplications)
APPLICATIONS = [
    # (application_id, student_id, posting_id, motivation, self_intro, careers, slots,
    #  status, submitted_at, reviewed_by)
    (
        1, "20220081", 1,
        "행정 업무에 관심이 많아 지원합니다.",
        "엑셀 활용 경험이 있으며 문서 작성에 능숙합니다.",
        [career("아르바이트", "동네 학원", "사무 보조", "2025.03.01", "2025.12.20", "수강생 명부·교재 재고 엑셀 관리")],
        ["월-10:00", "월-11:00", "수-10:00", "수-11:00"],
        "제출완료", datetime.datetime(2026, 7, 10, 15, 30), None,
    ),
    (
        2, "20220081", 2,
        "도서관 근로에 관심이 있어 지원합니다.",
        "도서관 이용 경험이 많습니다.",
        [],
        ["화-14:00", "화-15:00", "목-14:00", "목-15:00"],
        "검토중", datetime.datetime(2026, 7, 8, 11, 20), None,
    ),
    (
        3, "20220081", 3,
        "성실하게 업무를 수행할 자신이 있습니다.",
        "유사 경험은 없지만 꼼꼼합니다.",
        [],
        ["금-09:00", "금-10:00", "금-11:00"],
        "검토중", datetime.datetime(2026, 7, 6, 9, 15), None,
    ),
    (
        4, "20220081", 4,
        "민원 응대 경험을 쌓고 싶어 지원합니다.",
        "행정 업무 보조 경험이 있습니다.",
        [career("교내근로", "학과 사무실", "행정 보조", "2025.09.01", "2025.12.20", "서류 접수 및 안내")],
        ["월-09:00", "월-10:00", "수-09:00"],
        "불합격", datetime.datetime(2026, 7, 4, 16, 45), "STF004",
    ),
    (
        5, "20220081", 5,
        "홍보 업무에 관심이 있어 지원합니다.",
        "SNS 콘텐츠 제작 경험이 있습니다.",
        [],
        ["수-13:00", "수-14:00", "금-13:00"],
        "제출완료", datetime.datetime(2026, 6, 25, 13, 10), None,
    ),
]


# 시드가 채우는 테이블 (FK 역순 정리용)
SEEDED_TABLES = [
    "substitute_request",
    "work_schedule",
    "schedule_batch",
    "availability_exception",
    "available_time",
    "class_time",
    "application",
    "job_posting",
    "department_policy",
    "staff",
    "student",
    "department",
]


def seed_test_department(db, password_hash):
    """정보서비스팀-test(부서 6)만 기존 데이터를 건드리지 않고 추가한다.

    운영 중인 DB에 검증용 부서를 붙이기 위한 경로다 — 전체 시드는 TRUNCATE로
    시작하므로 배포 DB에 쓸 수 없다. 이미 있으면 아무것도 하지 않는다.
    """
    if db.query(models.Department).filter(
        models.Department.department_id == TEST_DEPT_ID
    ).first() is not None:
        print(f"부서 {TEST_DEPT_ID}가 이미 있습니다 — 아무것도 바꾸지 않았습니다.")
        return False

    dept = next(d for d in DEPARTMENTS if d[0] == TEST_DEPT_ID)
    db.add(models.Department(
        department_id=dept[0], name=dept[1], weekly_hour_limit=dept[2], headcount_to=dept[3],
    ))
    db.add(models.DepartmentPolicy(
        department_id=TEST_DEPT_ID,
        availability_mode=DEPARTMENT_AVAILABILITY_MODES.get(
            TEST_DEPT_ID, DEFAULT_AVAILABILITY_MODE
        ),
        custom_rules=DEPARTMENT_CUSTOM_RULES.get(TEST_DEPT_ID),
        policy_file_key=DEPARTMENT_POLICY_FILES.get(TEST_DEPT_ID),
    ))
    for staff_id, name, dept_id, email, phone in STAFF:
        if dept_id == TEST_DEPT_ID:
            db.add(models.Staff(
                staff_id=staff_id, name=name, department_id=dept_id,
                email=email, phone=phone, password_hash=password_hash,
            ))
    for row in TEST_DEPT_STUDENTS:
        db.add(models.Student(**row, password_hash=password_hash))

    posting = dict(next(p for p in POSTINGS if p["posting_id"] == TEST_DEPT_POSTING_ID))
    posting.pop("work_slots")
    db.add(models.JobPosting(**posting, work_slots=None))
    db.flush()

    # 지원서 ID는 기존 데이터와 겹치지 않게 현재 최대값 뒤로 이어 붙인다
    next_app_id = (db.query(func.max(models.Application.application_id)).scalar() or 0) + 1
    for i, student in enumerate(TEST_DEPT_STUDENTS):
        db.add(models.Application(
            application_id=next_app_id + i, student_id=student["student_id"],
            posting_id=TEST_DEPT_POSTING_ID, reviewed_by=TEST_DEPT_STAFF_ID,
            cover_letter=build_cover_letter(
                "테스트 부서 근로에 지원합니다.",
                f"{student['name']}입니다. 성실히 근무하겠습니다.", [], [],
            ),
            status="합격",
            submitted_at=datetime.datetime(2026, 2, 18, 10, 0) + datetime.timedelta(hours=i),
        ))

    for term, student_id, day, start, end, preference in TEST_DEPT_AVAILABLE_TIMES:
        db.add(models.AvailableTime(
            term=term, student_id=student_id, day_of_week=day,
            start_time=start, end_time=end, preference=preference,
        ))
    for term, student_id, day, start, end in TEST_DEPT_CLASS_TIMES:
        db.add(models.ClassTime(
            term=term, student_id=student_id, day_of_week=day,
            start_time=start, end_time=end,
        ))
    for student_id, day, kind, start, end, preference in TEST_DEPT_EXCEPTIONS:
        db.add(models.AvailabilityException(
            student_id=student_id, exception_date=day, exception_type=kind,
            start_time=start, end_time=end, preference=preference,
        ))
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset", action="store_true",
        help="기존 데이터를 전부 삭제하고 다시 주입 (개발 DB 전용)",
    )
    parser.add_argument(
        "--only", choices=["test-dept"],
        help="기존 데이터를 건드리지 않고 일부만 추가 (운영 DB에 검증용 부서를 붙일 때)",
    )
    args = parser.parse_args()

    # 운영 DB에서 --reset은 시드 테이블 11개를 통째로 지운다. 손이 미끄러지면
    # 복구가 RDS 백업(보존 1일)뿐이라, 환경 변수로 명시적으로 막는다.
    if args.reset and os.getenv("STREAM_ENV", "").lower() in ("production", "prod"):
        print("STREAM_ENV=production 에서는 --reset 을 쓸 수 없습니다. "
              "부분 추가는 --only test-dept 를 사용하세요.")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    apply_schema_patches(engine)  # 기존 테이블의 새 컬럼 보정 (app 시작 시에도 실행됨)
    db = SessionLocal()
    try:
        if args.only == "test-dept":
            changed = seed_test_department(db, hash_password(PASSWORD))
            db.commit()
            if changed:
                print(f"정보서비스팀-test(부서 {TEST_DEPT_ID}) 추가 완료 — "
                      f"직원 {TEST_DEPT_STAFF_ID} · 근로 학생 {len(TEST_DEPT_STUDENTS)}명. "
                      f"기존 데이터는 건드리지 않았습니다.")
            return

        existing = db.query(models.Department).count() + db.query(models.Student).count()
        if existing and not args.reset:
            print("DB에 이미 데이터가 있습니다. 전부 지우고 다시 넣으려면 --reset 을 사용하세요.")
            sys.exit(1)

        if args.reset:
            tables = ", ".join(SEEDED_TABLES)
            db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))

        password_hash = hash_password(PASSWORD)

        for dept_id, name, weekly, headcount in DEPARTMENTS:
            db.add(models.Department(
                department_id=dept_id, name=name,
                weekly_hour_limit=weekly, headcount_to=headcount,
            ))
            db.add(models.DepartmentPolicy(
                department_id=dept_id,
                availability_mode=DEPARTMENT_AVAILABILITY_MODES.get(
                    dept_id, DEFAULT_AVAILABILITY_MODE
                ),
                custom_rules=DEPARTMENT_CUSTOM_RULES.get(dept_id),
                policy_file_key=DEPARTMENT_POLICY_FILES.get(dept_id),
            ))

        for staff_id, name, dept_id, email, phone in STAFF:
            db.add(models.Staff(
                staff_id=staff_id, name=name, department_id=dept_id,
                email=email, phone=phone, password_hash=password_hash,
            ))

        for row in [APPLICANT_STUDENT] + WORKING_STUDENTS + TEST_DEPT_STUDENTS:
            db.add(models.Student(**row, password_hash=password_hash))

        # 공통 지원서 이력 (#122) — 학생별로 CSV 순서대로 sort_order 부여
        for model, rows in (
            (models.StudentCareer, STUDENT_CAREERS),
            (models.StudentLanguage, STUDENT_LANGUAGES),
            (models.StudentCertificate, STUDENT_CERTIFICATES),
        ):
            order_by_student = {}
            for row in rows:
                sid = row["student_id"]
                order = order_by_student.get(sid, 0)
                order_by_student[sid] = order + 1
                db.add(model(**row, sort_order=order))

        for posting in POSTINGS:
            fields = dict(posting)
            slots = fields.pop("work_slots")
            db.add(models.JobPosting(
                **fields,
                work_slots=json.dumps(slots, ensure_ascii=False) if slots else None,
            ))

        for (application_id, student_id, posting_id, motivation, self_intro,
             careers, slots, status, submitted_at, reviewed_by) in APPLICATIONS:
            db.add(models.Application(
                application_id=application_id, student_id=student_id,
                posting_id=posting_id, reviewed_by=reviewed_by,
                cover_letter=build_cover_letter(motivation, self_intro, careers, slots),
                status=status, submitted_at=submitted_at,
            ))

        # 근로 학생 9명: 공고 6(지난 학기 정보서비스팀 모집)에 합격 상태.
        # 부서 가능시간 수합 API(REQ-SCHED-002)가 이 "합격" 기록으로 부서 소속을 판별한다.
        next_app_id = len(APPLICATIONS) + 1
        for i, _w in enumerate(WORKING_STUDENTS):
            student_id, name = _w["student_id"], _w["name"]
            db.add(models.Application(
                application_id=next_app_id + i, student_id=student_id,
                posting_id=6, reviewed_by="STF001",
                cover_letter=build_cover_letter(
                    "도서관 근로에 지원합니다.", f"{name}입니다. 성실히 근무하겠습니다.", [], [],
                ),
                status="합격",
                submitted_at=datetime.datetime(2026, 2, 18, 10, 0) + datetime.timedelta(hours=i),
            ))

        # 정보서비스팀-test 근로 학생 10명: 공고 7 합격 — 부서 소속 판정의 근거
        next_app_id += len(WORKING_STUDENTS)
        for i, _w in enumerate(TEST_DEPT_STUDENTS):
            db.add(models.Application(
                application_id=next_app_id + i, student_id=_w["student_id"],
                posting_id=TEST_DEPT_POSTING_ID, reviewed_by=TEST_DEPT_STAFF_ID,
                cover_letter=build_cover_letter(
                    "테스트 부서 근로에 지원합니다.",
                    f"{_w['name']}입니다. 성실히 근무하겠습니다.", [], [],
                ),
                status="합격",
                submitted_at=datetime.datetime(2026, 2, 18, 10, 0) + datetime.timedelta(hours=i),
            ))

        for term, student_id, day, start, end, preference in (
            AVAILABLE_TIMES + TEST_DEPT_AVAILABLE_TIMES
        ):
            db.add(models.AvailableTime(
                term=term, student_id=student_id, day_of_week=day,
                start_time=start, end_time=end, preference=preference,
            ))

        for term, student_id, day, start, end in CLASS_TIMES + TEST_DEPT_CLASS_TIMES:
            db.add(models.ClassTime(
                term=term, student_id=student_id, day_of_week=day,
                start_time=start, end_time=end,
            ))

        # 정보서비스팀-test 1주차(09/01~09/05) — 주간 패턴과 다른 그 주만의 수합
        for student_id, day, kind, start, end, preference in TEST_DEPT_EXCEPTIONS:
            db.add(models.AvailabilityException(
                student_id=student_id, exception_date=day, exception_type=kind,
                start_time=start, end_time=end, preference=preference,
            ))

        # ---- 대타 데모 (REQ-SUB-001~008, 이슈 #72) ----
        #
        # 다음 주 월~일 확정 근무표를 **솔버로 생성해** 넣고, 그 배정 위에 상태별
        # 대타 요청을 얹는다. 예전에는 근무 7행을 손으로 적었는데 그러면
        #   - solver_summary가 없어 제약을 지켰는지 확인할 방법이 없고 (#156의 출발점)
        #   - 개관 시간의 2/3이 빈 시간표가 '확정본'으로 남았다
        # 기간을 일요일까지 잡는 것도 같은 이유다 — 금요일에서 끊으면 주간 뷰(월~일)와
        # 어긋나 토요일 개관이 배치에 아예 없는 것처럼 보인다.
        db.flush()  # 위에서 넣은 가능시간을 솔버가 조회할 수 있게
        today = datetime.date.today()
        next_monday = today + datetime.timedelta(days=7 - today.weekday())
        # 2주 — SPEC 권장 생성 단위다. 1주만 만들면 HC-TIME-4(부서 2주 교비 총합
        # 190h)의 14일 창에 7일만 들어가 제약이 사실상 걸리지 않는다.
        period_end = next_monday + datetime.timedelta(days=13)
        requested = lambda days_ago: datetime.datetime.now() - datetime.timedelta(days=days_ago)  # noqa: E731

        print(f"  근무표 생성 중... ({next_monday} ~ {period_end}, 부서 2)")
        result = generate_schedule(
            GenerateRequest(department_id=2, start_date=next_monday, num_days=14), db
        )
        batch = models.ScheduleBatch(
            department_id=2, period_start=next_monday, period_end=period_end,
            status="confirmed", created_by="STF001",
            solver_summary={
                "status": result["status"],
                "solve_time_seconds": result["solve_time_seconds"],
                "objective_value": result["objective_value"],
                "shortages": result["shortages"],
                "penalty_summary": result["penalty_summary"],
                "per_student": result["per_student"],
            },
        )
        db.add(batch)
        db.flush()

        shifts = []
        for row in result["schedules"]:
            ws = models.WorkSchedule(
                batch_id=batch.batch_id, student_id=row["student_id"], department_id=2,
                work_date=datetime.date.fromisoformat(row["date"]),
                start_time=_time(row["start_time"]), end_time=_time(row["end_time"]),
            )
            db.add(ws)
            shifts.append(ws)
        db.flush()

        # 대타 시나리오를 걸 근무를 배정 결과에서 고른다. 손으로 (학생, 요일, 시간)을
        # 박아두면 가능시간 CSV가 바뀔 때마다 후보가 0명인 요청이 되어 데모가 죽는다.
        # 실제 후보 탐색 로직(REQ-SUB-002)을 그대로 태워 "대타 설 사람이 있는" 근무만 고른다.
        #
        # 날짜를 흩어 고르고(한 날에 4건이 몰리면 데모가 부자연스럽다), 대타자는 그 주
        # 배정이 가장 적은 후보를 쓴다 — ③승인은 근무 담당자를 실제로 바꾸므로, 이미
        # 주간 상한에 가까운 학생에게 얹으면 확정본이 HC-TIME 위반이 된다.
        week_minutes = {}
        for ws in shifts:
            span = _minutes_between(ws.start_time, ws.end_time)
            week_minutes[ws.student_id] = week_minutes.get(ws.student_id, 0) + span

        names = {row["student_id"]: row["student_name"] for row in result["schedules"]}
        # 시나리오 4개 중 근무 담당자가 실제로 바뀌는 것은 ③승인뿐이고, ②수락도
        # 데모에서 직원이 승인을 누르면 그때 옮겨진다. 이 둘만 대타 학생의 주간
        # 여력을 확인해 고른다 — 상한을 넘기면 승인이 400으로 막혀 데모가 막다른
        # 길이 된다. ①대기·④반려는 시간이 옮겨가지 않으므로 후보만 있으면 된다.
        #
        # 짧은 근무부터 보는 이유: 여력은 몇 시간 단위로 남는데 근무는 3~8시간이라,
        # 긴 근무를 먼저 집으면 설 수 있는 사람이 없어진다.
        reserved = dict(week_minutes)
        used_students, used_dates, used_substitutes = set(), set(), set()

        def _room(student_id, minutes):
            cap = _weekly_cap_minutes(db, 2, student_id, next_monday)
            return not cap or reserved.get(student_id, 0) + minutes <= cap

        def _take(require_room):
            """조건에 맞는 (근무, 대타 후보) 하나를 고르고 예약분을 반영한다."""
            for ws in sorted(
                shifts,
                key=lambda w: (_minutes_between(w.start_time, w.end_time),
                               w.work_date, w.start_time, w.student_id),
            ):
                if ws.student_id in used_students or ws.work_date in used_dates:
                    continue
                span = _minutes_between(ws.start_time, ws.end_time)
                found = [
                    c for c in _find_candidates(db, ws, ws.start_time, ws.end_time, ws.student_id)
                    if not require_room
                    or (c.student_id not in used_substitutes and _room(c.student_id, span))
                ]
                if not found:
                    continue
                candidate = min(found, key=lambda c: reserved.get(c.student_id, 0))
                used_students.add(ws.student_id)
                used_dates.add(ws.work_date)
                if require_room:
                    used_substitutes.add(candidate.student_id)
                    reserved[candidate.student_id] = reserved.get(candidate.student_id, 0) + span
                return ws, candidate
            return None

        # 순서: 시간이 옮겨가는 둘을 먼저 잡아 짧은 근무를 배정받게 한다
        accepted_pick = _take(require_room=True)
        approved_pick = _take(require_room=True)
        pending_pick = _take(require_room=False)
        rejected_pick = _take(require_room=False)
        picks = [pending_pick, accepted_pick, approved_pick, rejected_pick]

        # 솔버가 낸 배정 자체를 먼저 채점해 둔다. 아래에서 ③승인이 근무 담당자를
        # 바꾸므로, 그 전후를 나눠 봐야 "위반이 솔버 탓인지 대타 탓인지"가 드러난다.
        db.flush()
        solver_check = verify_batch(db, batch.batch_id)

        if any(p is None for p in picks):
            # 후보 탐색은 가능시간·근무 겹침에 더해 주간 상한까지 본다 (#159).
            # 솔버가 SC-FAIR-1로 전원을 상한까지 채우면 대타 여력이 0이 되어
            # 후보가 사라진다 — 데이터 문제가 아니라 그 부서의 실제 상태다.
            headroom = [
                f"{names.get(sid, sid)} {(cap - used) / 60:+.1f}h"
                for sid, used in sorted(week_minutes.items())
                for cap in [_weekly_cap_minutes(db, 2, sid, next_monday)]
            ]
            print(f"  ⚠️ 대타 시나리오를 {sum(p is not None for p in picks)}건만 만들었습니다.")
            print(f"     주간 상한 대비 여력: {' · '.join(headroom)}")
            print("     여력이 0이면 그 주에는 대타를 세울 사람이 없습니다 (#159).")

        demo_lines = []
        for i, pick in enumerate(picks):
            if pick is None:
                continue
            ws, candidate = pick
            who = names.get(ws.student_id, ws.student_id)
            span = f"{ws.work_date:%m/%d} {ws.start_time:%H:%M}~{ws.end_time:%H:%M}"
            common = dict(
                schedule_id=ws.schedule_id, start_time=ws.start_time, end_time=ws.end_time,
                requested_at=requested(i),
            )
            if i == 0:  # ① 대기 — 관리자가 처리할 요청이 하나 떠 있는 상태
                db.add(models.SubstituteRequest(
                    requester_id=ws.student_id, status="대기",
                    reason="전공 시험과 겹쳐 근무가 어렵습니다", **common,
                ))
                demo_lines.append(f"대기 {who} {span}")
            elif i == 1:  # ② 수락(승인 대기) — 후보가 수락했고 직원 승인만 남은 상태
                db.add(models.SubstituteRequest(
                    requester_id=ws.student_id, substitute_id=candidate.student_id,
                    status="수락", reason="병원 진료 예약이 있습니다", **common,
                ))
                demo_lines.append(f"수락 {who}→{candidate.name} {span}")
            elif i == 2:
                # ③ 승인 완료 — REQ-SUB-005대로 근무 행의 담당자가 이미 교체된 상태를 넣는다.
                # 대타자 시간표에 '대타 근무' 칸이, 요청자 기록에 승인 내역이 보인다.
                db.add(models.SubstituteRequest(
                    requester_id=ws.student_id, substitute_id=candidate.student_id,
                    approved_by="STF001", status="승인", reason="가족 행사 참석", **common,
                ))
                ws.student_id = candidate.student_id
                demo_lines.append(f"승인 {who}→{candidate.name} {span}")
            else:  # ④ 반려 — 반려 사유 표시·같은 근무 재요청 데모용
                db.add(models.SubstituteRequest(
                    requester_id=ws.student_id, status="반려",
                    reason="개인 사정으로 근무가 어렵습니다",
                    reject_reason="해당 주 근무 인원이 부족해 반려합니다. 일정 조정 후 다시 요청해 주세요.",
                    **common,
                ))
                demo_lines.append(f"반려 {who} {span}")

        db.commit()

        # autoincrement PK를 명시 ID로 넣었으므로 시퀀스를 현재 최대값 뒤로 맞춘다
        for table, pk in [
            ("job_posting", "posting_id"),
            ("application", "application_id"),
            ("department", "department_id"),
            ("department_policy", "department_policy_id"),
        ]:
            db.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table}', '{pk}'), "
                f"(SELECT COALESCE(MAX({pk}), 1) FROM {table}))"
            ))
        db.commit()

        num_students = 1 + len(WORKING_STUDENTS) + len(TEST_DEPT_STUDENTS)
        num_apps = len(APPLICATIONS) + len(WORKING_STUDENTS) + len(TEST_DEPT_STUDENTS)
        all_available = AVAILABLE_TIMES + TEST_DEPT_AVAILABLE_TIMES
        all_classes = CLASS_TIMES + TEST_DEPT_CLASS_TIMES
        print("시드 완료:")
        print(f"  부서 {len(DEPARTMENTS)} · 직원 {len(STAFF)} · 학생 {num_students} "
              f"· 공고 {len(POSTINGS)} · 지원 {num_apps}")
        terms = {row[0] for row in all_available} | {row[0] for row in all_classes}
        for term in sorted(terms, key=lambda t: t or ""):  # 학기 미지정(None)도 함께 센다
            avail = [r for r in all_available if r[0] == term]
            klass = [r for r in all_classes if r[0] == term]
            hours = sum(
                (r[4].hour * 60 + r[4].minute) - (r[3].hour * 60 + r[3].minute) for r in avail
            ) / 60
            print(f"  [{term or '학기 없음'}] 가능시간 {len(avail)}건({hours:.0f}시간) "
                  f"· 수업 {len(klass)}건")
        print(f"  모든 계정 비밀번호: {PASSWORD}")
        print(f"  지원 데모 학생: {APPLICANT_STUDENT['student_id']} {APPLICANT_STUDENT['name']}")
        print(f"  정보서비스팀 직원: STF001 박정보 / 근로 학생 {len(WORKING_STUDENTS)}명 (공고 6 합격)")
        test_staff = next((n for sid, n, *_ in STAFF if sid == TEST_DEPT_STAFF_ID), "")
        print(f"  정보서비스팀-test 직원: {TEST_DEPT_STAFF_ID} {test_staff} "
              f"/ 근로 학생 {len(TEST_DEPT_STUDENTS)}명 (공고 {TEST_DEPT_POSTING_ID} 합격) "
              f"· 1주차 날짜 예외 {len(TEST_DEPT_EXCEPTIONS)}건")
        # 확정본을 제약으로 다시 채점해 보여준다 (#156) — 시드가 넣은 근무표가
        # 규정을 지키는지, 개관 시간을 얼마나 덮는지 눈으로 확인할 수 있게.
        check = verify_batch(db, batch.batch_id)
        coverage = check["coverage"]
        criticals = [v for v in check["violations"] if v["severity"] == "critical"]
        solver_criticals = [
            v for v in solver_check["violations"] if v["severity"] == "critical"
        ]
        print(f"  대타 데모 확정 근무표: {next_monday} ~ {period_end} "
              f"· {result['status']} {result['solve_time_seconds']}s "
              f"· 근무 {len(shifts)}건 · 요청 {len(picks)}건")
        print(f"    개관 {coverage['open_hours']}h 중 최소인원 충족 "
              f"{coverage['staffed_slots']}/{coverage['open_slots']} 슬롯 "
              f"({coverage['staffed_ratio']:.0%}) · 배정 시간 합계 {coverage['assigned_hours']}시간 "
              f"· 솔버 배정 제약 위반 {len(solver_criticals)}건")
        for line in demo_lines:
            print(f"    {line}")
        # 대타 승인은 근무 담당자를 바꾸므로 솔버가 지킨 상한을 넘길 수 있다.
        # 승인 API가 주간 상한을 검사하지 않아 실제로도 생길 수 있는 상태다.
        added = len(criticals) - len(solver_criticals)
        if added > 0:
            print(f"    ⓘ 대타 승인 반영 후 제약 위반 {len(criticals)}건 (승인으로 +{added}건)")
            for violation in criticals[:3]:
                print(f"      {violation['rule']} {violation.get('student_id') or ''} "
                      f"{violation.get('date') or ''} — {violation['message']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
