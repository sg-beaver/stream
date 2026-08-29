"""팀 공용 개발 시드 데이터 주입 스크립트 (이슈 #49).

frontend/src/api/devMockData.js와 동일한 내용(부서·공고·계정·지원 내역)을
DB에 넣어, 팀원 전원이 같은 mock 데이터로 FE-BE 통합 환경을 실행할 수 있게 한다.

데모 시나리오 (계정 명단은 팀 합의, 2026-07-30):
- 근로를 알아보는 학생 안희진(20220081): 공고 조회·지원 데모 — 공고 5건 지원 상태
- 정보서비스팀 근로 학생 9명: 시간표 생성 데모 — 마감된 공고 6에 "합격" 상태
  (부서 가능시간 수합 API가 "부서 공고 합격자"를 근로 학생으로 판별)
  국가/교비 구분은 student.funding_type 컬럼과 scheduler/config/sample/students_sample.json에 동일하게 존재
- 정보서비스팀 직원 박정보(STF001): 근로 학생 관리 데모
- 대타 데모(이슈 #72): 다음 주 월~금 확정 근무표 + 상태별 대타 요청(대기·수락·승인·반려).
  날짜를 실행일 기준으로 잡아 언제 시드해도 학생 '대타 요청' 화면(오늘 이후 확정 근무)과
  관리자 처리 화면에 바로 나타난다.

가능 시간·수업 시간표는 학기별(term)로 넣는다 — 학기 중(2026-2)은 고정 시간표를
빼고 남는 시간, 방학(2026-summer)은 계절수업만 빼고 넓게 열어 둔 값이다.
학생 계정으로 로그인하면 그대로 화면에 체크된 상태로 보인다.

계정 명단·가능시간은 scripts/seed_data/*.csv에서 관리한다 (엑셀 편집 가능,
자세한 규칙은 scripts/seed_data/README.md). 공고·지원서처럼 중첩 구조인
데이터는 이 파일 안에 그대로 둔다.

사용법 (backend/ 디렉토리에서):
    python3 scripts/seed_mock_data.py            # 빈 DB에만 주입 (데이터 있으면 중단)
    python3 scripts/seed_mock_data.py --reset    # 기존 데이터 전부 삭제 후 재주입

모든 시드 계정의 비밀번호는 "stream1234" (개발 전용).
"""

import argparse
import csv
import datetime
import json
import sys
from pathlib import Path

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402

from app import models  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.schema_patches import apply_schema_patches  # noqa: E402

PASSWORD = "stream1234"

SEED_DATA_DIR = Path(__file__).parent / "seed_data"


def _read_csv(name):
    with open(SEED_DATA_DIR / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


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
    (int(r["department_id"]), r["name"], int(r["weekly_hour_limit"]), int(r["headcount_to"]))
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset", action="store_true",
        help="기존 데이터를 전부 삭제하고 다시 주입 (개발 DB 전용)",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    apply_schema_patches(engine)  # 기존 테이블의 새 컬럼 보정 (app 시작 시에도 실행됨)
    db = SessionLocal()
    try:
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
        # 다음 주 월~금 확정 근무표 한 주를 만들고, uiux 킷 데모처럼 상태별 대타 요청을
        # 함께 넣는다. 근무·대타자 배치는 available_times.csv와 정합하게 골라
        # 후보 탐색(REQ-SUB-002) 데모가 성립한다. 여기 확정 근무가 있어야 학생이
        # 화면에서 새 대타 요청을 올리고 관리자가 처리하는 실제 플로우도 바로 돌아간다.
        today = datetime.date.today()
        next_monday = today + datetime.timedelta(days=7 - today.weekday())
        demo_date = lambda weekday: next_monday + datetime.timedelta(days=weekday - 1)  # 월=1  # noqa: E731
        requested = lambda days_ago: datetime.datetime.now() - datetime.timedelta(days=days_ago)  # noqa: E731

        batch = models.ScheduleBatch(
            department_id=2, period_start=demo_date(1), period_end=demo_date(5),
            status="confirmed", created_by="STF001",
        )
        db.add(batch)
        db.flush()

        def shift(student_id, weekday, start, end):
            ws = models.WorkSchedule(
                batch_id=batch.batch_id, student_id=student_id, department_id=2,
                work_date=demo_date(weekday), start_time=_time(start), end_time=_time(end),
            )
            db.add(ws)
            db.flush()  # schedule_id 확보
            return ws

        # 요청이 걸리지 않은 정규 근무 — 시간표가 자연스럽게 채워지도록
        shift("20220091", 4, "08:00", "11:00")  # 윤영민 목 (가능시간 목 08:00-12:00, 근무 희망)
        shift("20220557", 5, "09:00", "12:00")  # 안승준 금 (가능시간 금 09:00-12:00, 근무 희망)
        shift("20220042", 5, "12:00", "15:00")  # 김현서 금 (가능시간 금 12:00-15:00, 근무 희망)

        # 아래 네 시나리오는 모두 근무 전체를 넘기는 대타다 — 요청 구간(#123)에는
        # 근무 시간을 그대로 넣는다. NULL로 두면 겹침 판정·승인 분할이 돌지 않는다.
        # ① 대기: 조수현 월 09-12 — 월 오전이 가능한 김현서·오규원·송형준 등이 후보로 잡힌다
        ws_pending = shift("20220912", 1, "09:00", "12:00")
        db.add(models.SubstituteRequest(
            schedule_id=ws_pending.schedule_id, requester_id="20220912",
            start_time=ws_pending.start_time, end_time=ws_pending.end_time,
            status="대기", reason="전공 시험과 겹쳐 근무가 어렵습니다",
            requested_at=requested(0),
        ))

        # ② 수락(승인 대기): 김현서 화 09-12 — 조수현(화 09:00-13:30 가능)이 수락한 상태
        ws_accepted = shift("20220042", 2, "09:00", "12:00")
        db.add(models.SubstituteRequest(
            schedule_id=ws_accepted.schedule_id, requester_id="20220042",
            start_time=ws_accepted.start_time, end_time=ws_accepted.end_time,
            substitute_id="20220912", status="수락", reason="병원 진료 예약이 있습니다",
            requested_at=requested(1),
        ))

        # ③ 승인 완료: 권지영 수 10-13 요청을 오규원(수 08:00-13:30 가능)이 수락, 직원이 승인.
        # REQ-SUB-005대로 근무 행의 담당자가 이미 오규원으로 교체된 상태를 그대로 넣는다
        # — 오규원 시간표에 금색 '대타 근무' 칸이, 권지영 기록에 승인 내역이 보인다.
        ws_approved = shift("20211357", 3, "10:00", "13:00")
        db.add(models.SubstituteRequest(
            schedule_id=ws_approved.schedule_id, requester_id="20240673",
            start_time=ws_approved.start_time, end_time=ws_approved.end_time,
            substitute_id="20211357", approved_by="STF001",
            status="승인", reason="가족 행사 참석",
            requested_at=requested(2),
        ))

        # ④ 반려: 송형준 목 13-16 — 반려 사유 표시·같은 근무 재요청 데모용
        ws_rejected = shift("20220077", 4, "13:00", "16:00")
        db.add(models.SubstituteRequest(
            schedule_id=ws_rejected.schedule_id, requester_id="20220077",
            start_time=ws_rejected.start_time, end_time=ws_rejected.end_time,
            status="반려", reason="개인 사정으로 근무가 어렵습니다",
            reject_reason="해당 주 근무 인원이 부족해 반려합니다. 일정 조정 후 다시 요청해 주세요.",
            requested_at=requested(3),
        ))

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
        print(f"  정보서비스팀-test 직원: {TEST_DEPT_STAFF_ID} 김찬우 "
              f"/ 근로 학생 {len(TEST_DEPT_STUDENTS)}명 (공고 {TEST_DEPT_POSTING_ID} 합격) "
              f"· 1주차 날짜 예외 {len(TEST_DEPT_EXCEPTIONS)}건")
        print(f"  대타 데모: {demo_date(1)} ~ {demo_date(5)} 확정 근무 7건 · 요청 4건 (대기·수락·승인·반려)")
        print("    대기 요청자 조수현(20220912) / 수락 대기 김현서(20220042) / 대타 근무 오규원(20211357)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
