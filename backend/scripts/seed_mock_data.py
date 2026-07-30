"""팀 공용 개발 시드 데이터 주입 스크립트 (이슈 #49).

frontend/src/api/devMockData.js와 동일한 내용(부서·공고·계정·지원 내역)을
DB에 넣어, 팀원 전원이 같은 mock 데이터로 FE-BE 통합 환경을 실행할 수 있게 한다.

데모 시나리오 (계정 명단은 팀 합의, 2026-07-30):
- 근로를 알아보는 학생 안희진(20220081): 공고 조회·지원 데모 — 공고 5건 지원 상태
- 정보서비스팀 근로 학생 9명: 시간표 생성 데모 — 마감된 공고 6에 "합격" 상태
  (부서 가능시간 수합 API가 "부서 공고 합격자"를 근로 학생으로 판별)
  국가/교비 구분은 DB에 컬럼이 없어 scheduler/config/sample/students_sample.json에만 존재
- 정보서비스팀 직원 이직원(A00123): 근로 학생 관리 데모

사용법 (backend/ 디렉토리에서):
    python3 scripts/seed_mock_data.py            # 빈 DB에만 주입 (데이터 있으면 중단)
    python3 scripts/seed_mock_data.py --reset    # 기존 데이터 전부 삭제 후 재주입

모든 시드 계정의 비밀번호는 "stream1234" (개발 전용).
"""

import argparse
import datetime
import json
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402

from app import models  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402

PASSWORD = "stream1234"

DEPARTMENTS = [
    # (department_id, name, weekly_hour_limit, headcount_to)
    (1, "학생지원팀", 15, 2),
    (2, "로욜라도서관 정보서비스팀", 15, 9),
    (3, "입학처", 15, 2),
    (4, "종합봉사실 학생서비스", 10, 2),
    (5, "국제교류팀", 10, 1),
]

STAFF = [
    # (staff_id, name, department_id, email, phone)
    # A00123 이직원: 메인 데모 직원 (정보서비스팀 근로 학생 관리 담당)
    ("A00123", "이직원", 2, "library@sogang.ac.kr", "02-705-7100"),
    ("STF001", "김직원", 1, "studentoffice@sogang.ac.kr", "02-705-8000"),
    ("STF003", "이입학", 3, "admission@sogang.ac.kr", "02-705-8200"),
    ("STF004", "최민원", 4, "onestop@sogang.ac.kr", "02-705-8300"),
    ("STF005", "정국제", 5, "international@sogang.ac.kr", "02-705-8400"),
]

# 근로를 알아보는 학생 — 공고 조회·지원 데모의 메인 계정
APPLICANT_STUDENT = ("20220081", "안희진", "국어국문학과", "010-2222-0081")

# 정보서비스팀 근로 학생 9명 — 시간표 생성 데모용 (괄호는 장학 구분, JSON 시드와 일치)
# (student_id, name, department_name, phone)
WORKING_STUDENTS = [
    ("20220042", "김현서", "국어국문학과", "010-1111-0042"),   # 국가
    ("20220912", "조수현", "경영학과", "010-1111-0912"),       # 국가
    ("20240673", "권지영", "경영학과", "010-1111-0673"),       # 교비
    ("20211357", "오규원", "생명과학과", "010-1111-1357"),     # 교비
    ("20220055", "박민진", "국어국문학과", "010-1111-0055"),   # 교비
    ("20220091", "윤영민", "철학과", "010-1111-0091"),         # 교비
    ("20220077", "송형준", "국어국문학과", "010-1111-0077"),   # 교비
    ("20221818", "정창범", "기계공학과", "010-1111-1818"),     # 교비
    ("20220557", "안승준", "경제학과", "010-1111-0557"),       # 교비
]

# 시드 데이터가 유효한 상태(모집중/마감)를 유지하도록 devMockData.js의 7월 마감일을
# 학기 중 날짜로 옮겼다. devMockData.js도 같은 날짜를 사용한다 (이슈 #49).
POSTINGS = [
    # (posting_id, department_id, created_by, title, description, qualification,
    #  upload_date, deadline, status)
    (
        1, 1, "STF001", "행정 업무 보조",
        "민원 응대 및 학생지원팀 행정 업무 보조\n문서 정리, 자료 입력, 안내 자료 관리\n부서 내 단순 행정 업무 지원",
        "엑셀 활용 가능자 우대\n문서 작성 및 자료 정리 경험자 우대\n월/수 요일 근무 가능자 우대",
        datetime.date(2026, 7, 1), datetime.date(2026, 9, 25), "모집중",
    ),
    (
        2, 2, "A00123", "참고서비스 제공",
        "참고서비스 제공 및 자료실 이용 안내\n도서 정리 및 서가 관리\n자료 검색 지원",
        "도서관 이용 경험자 우대\n성실하고 꼼꼼한 분",
        datetime.date(2026, 6, 28), datetime.date(2026, 9, 20), "모집중",
    ),
    (
        3, 3, "STF003", "논술 보조",
        "논술 전형 운영 보조\n고사장 안내 및 수험생 응대\n답안지 정리·이송 보조",
        "꼼꼼하고 성실한 분\n유사 업무 경험자 우대",
        datetime.date(2026, 7, 5), datetime.date(2026, 9, 15), "모집중",
    ),
    (
        4, 4, "STF004", "증명서·학생증 발급 보조",
        "증명서·학생증 발급 창구 보조\n민원 접수 및 안내\n발급 서류 정리",
        "민원 응대 경험 우대\n행정 업무 보조 경험 우대",
        datetime.date(2026, 7, 3), datetime.date(2026, 9, 19), "모집중",
    ),
    (
        5, 5, "STF005", "국제교류팀 지원 근로",
        "국제교류 프로그램 운영 보조\n외국인 학생 안내 및 행사 지원\n영문 문서 정리",
        "영어 회화 가능자 우대",
        datetime.date(2026, 6, 20), datetime.date(2026, 6, 30), "마감",
    ),
    # 정보서비스팀 근로 학생 9명이 합격해 있는 지난 학기 공고 (시간표 생성 데모의 근거 데이터)
    (
        6, 2, "A00123", "2026-1학기 정보서비스팀 근로학생 모집",
        "로욜라도서관 정보서비스팀 학기 근로\n대출/반납 데스크, 서가 정리, 이용자 안내",
        "성실하고 책임감 있는 분",
        datetime.date(2026, 2, 10), datetime.date(2026, 2, 25), "마감",
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
        "국제 업무에 관심이 있어 지원합니다.",
        "영어 회화 가능합니다.",
        [],
        ["수-13:00", "수-14:00", "금-13:00"],
        "제출완료", datetime.datetime(2026, 6, 25, 13, 10), None,
    ),
]

# 주간 근무 가능 시간 (REQ-SCHED-001/002 데모용)
# scheduler/config/sample/students_sample.json의 available과 대략 일치시킨 요약본.
# (student_id, day_of_week[월=1], start, end, preference)
AVAILABLE_TIMES = [
    # 근로 학생 9명
    ("20220042", 1, datetime.time(12, 0), datetime.time(18, 0), 1),
    ("20220042", 3, datetime.time(12, 0), datetime.time(18, 0), 1),
    ("20220042", 5, datetime.time(12, 0), datetime.time(18, 0), 2),
    ("20220912", 2, datetime.time(9, 0), datetime.time(15, 0), 1),
    ("20220912", 4, datetime.time(9, 0), datetime.time(15, 0), 1),
    ("20240673", 1, datetime.time(13, 0), datetime.time(18, 0), 1),
    ("20240673", 2, datetime.time(9, 0), datetime.time(12, 0), 2),
    ("20240673", 5, datetime.time(9, 0), datetime.time(18, 0), 1),
    ("20211357", 1, datetime.time(9, 0), datetime.time(13, 0), 1),
    ("20211357", 3, datetime.time(9, 0), datetime.time(13, 0), 1),
    ("20211357", 5, datetime.time(13, 0), datetime.time(18, 0), 2),
    ("20220055", 2, datetime.time(12, 0), datetime.time(18, 0), 1),
    ("20220055", 4, datetime.time(12, 0), datetime.time(18, 0), 1),
    ("20220091", 3, datetime.time(13, 0), datetime.time(18, 0), 1),
    ("20220091", 4, datetime.time(9, 0), datetime.time(12, 0), 1),
    ("20220091", 5, datetime.time(9, 0), datetime.time(12, 0), 2),
    ("20220077", 1, datetime.time(9, 0), datetime.time(18, 0), 2),
    ("20220077", 2, datetime.time(9, 0), datetime.time(18, 0), 1),
    ("20220077", 3, datetime.time(9, 0), datetime.time(18, 0), 1),
    ("20221818", 1, datetime.time(9, 0), datetime.time(12, 0), 1),
    ("20221818", 4, datetime.time(13, 0), datetime.time(18, 0), 1),
    ("20221818", 5, datetime.time(13, 0), datetime.time(18, 0), 1),
    ("20220557", 2, datetime.time(13, 0), datetime.time(18, 0), 1),
    ("20220557", 3, datetime.time(9, 0), datetime.time(13, 0), 2),
    ("20220557", 5, datetime.time(9, 0), datetime.time(13, 0), 1),
    # 안희진 (지원서의 근무 가능 시간과 유사)
    ("20220081", 1, datetime.time(10, 0), datetime.time(13, 0), 1),
    ("20220081", 3, datetime.time(10, 0), datetime.time(13, 0), 1),
]

# 시드가 채우는 테이블 (FK 역순 정리용)
SEEDED_TABLES = [
    "available_time",
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
                department_id=dept_id, availability_mode="weekly_only",
            ))

        for staff_id, name, dept_id, email, phone in STAFF:
            db.add(models.Staff(
                staff_id=staff_id, name=name, department_id=dept_id,
                email=email, phone=phone, password_hash=password_hash,
            ))

        for student_id, name, dept_name, phone in [APPLICANT_STUDENT] + WORKING_STUDENTS:
            db.add(models.Student(
                student_id=student_id, name=name, department_name=dept_name,
                phone=phone, password_hash=password_hash,
            ))

        for (posting_id, dept_id, created_by, title, description,
             qualification, upload_date, deadline, status) in POSTINGS:
            db.add(models.JobPosting(
                posting_id=posting_id, department_id=dept_id, created_by=created_by,
                title=title, description=description, qualification=qualification,
                upload_date=upload_date, deadline=deadline, status=status,
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
        for i, (student_id, name, _, _) in enumerate(WORKING_STUDENTS):
            db.add(models.Application(
                application_id=next_app_id + i, student_id=student_id,
                posting_id=6, reviewed_by="A00123",
                cover_letter=build_cover_letter(
                    "도서관 근로에 지원합니다.", f"{name}입니다. 성실히 근무하겠습니다.", [], [],
                ),
                status="합격",
                submitted_at=datetime.datetime(2026, 2, 18, 10, 0) + datetime.timedelta(hours=i),
            ))

        for student_id, day, start, end, preference in AVAILABLE_TIMES:
            db.add(models.AvailableTime(
                student_id=student_id, day_of_week=day,
                start_time=start, end_time=end, preference=preference,
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

        num_students = 1 + len(WORKING_STUDENTS)
        num_apps = len(APPLICATIONS) + len(WORKING_STUDENTS)
        print("시드 완료:")
        print(f"  부서 {len(DEPARTMENTS)} · 직원 {len(STAFF)} · 학생 {num_students} "
              f"· 공고 {len(POSTINGS)} · 지원 {num_apps} · 가능시간 {len(AVAILABLE_TIMES)}")
        print(f"  모든 계정 비밀번호: {PASSWORD}")
        print(f"  지원 데모 학생: {APPLICANT_STUDENT[0]} {APPLICANT_STUDENT[1]}")
        print(f"  정보서비스팀 직원: A00123 이직원 / 근로 학생 {len(WORKING_STUDENTS)}명 (공고 6 합격)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
