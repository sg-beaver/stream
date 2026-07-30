"""팀 공용 개발 시드 데이터 주입 스크립트 (이슈 #49).

frontend/src/api/devMockData.js와 동일한 내용(부서·공고·계정·지원 내역)을
DB에 넣어, 팀원 전원이 같은 mock 데이터로 FE-BE 통합 환경을 실행할 수 있게 한다.

데모 시나리오 (계정 명단은 팀 합의, 2026-07-30):
- 근로를 알아보는 학생 안희진(20220081): 공고 조회·지원 데모 — 공고 5건 지원 상태
- 정보서비스팀 근로 학생 9명: 시간표 생성 데모 — 마감된 공고 6에 "합격" 상태
  (부서 가능시간 수합 API가 "부서 공고 합격자"를 근로 학생으로 판별)
  국가/교비 구분은 student.funding_type 컬럼과 scheduler/config/sample/students_sample.json에 동일하게 존재
- 정보서비스팀 직원 박정보(STF001): 근로 학생 관리 데모

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

PASSWORD = "stream1234"

SEED_DATA_DIR = Path(__file__).parent / "seed_data"


def _read_csv(name):
    with open(SEED_DATA_DIR / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _time(hhmm):
    hh, mm = hhmm.split(":")
    return datetime.time(int(hh), int(mm))


DEPARTMENTS = [
    (int(r["department_id"]), r["name"], int(r["weekly_hour_limit"]), int(r["headcount_to"]))
    for r in _read_csv("departments.csv")
]

STAFF = [
    (r["staff_id"], r["name"], int(r["department_id"]), r["email"], r["phone"])
    for r in _read_csv("staff.csv")
]

_students = _read_csv("students.csv")
_student_tuple = lambda r: (r["student_id"], r["name"], r["department_name"], r["phone"], r["funding_type"])  # noqa: E731

# 근로를 알아보는 학생(role=applicant) — 공고 조회·지원 데모의 메인 계정
APPLICANT_STUDENT = next(_student_tuple(r) for r in _students if r["role"] == "applicant")

# 정보서비스팀 근로 학생(role=worker) — 시간표 생성 데모용, 공고 6 합격 자동 생성.
# 명단·장학 구분은 scheduler/config/sample/students_sample.json과 일치 유지.
WORKING_STUDENTS = [_student_tuple(r) for r in _students if r["role"] == "worker"]

# 주간 근무 가능 시간 (REQ-SCHED-001/002 데모용, day_of_week: 월=1)
AVAILABLE_TIMES = [
    (r["student_id"], int(r["day_of_week"]), _time(r["start_time"]), _time(r["end_time"]), int(r["preference"]))
    for r in _read_csv("available_times.csv")
]

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
    # 정보서비스팀 근로 학생 9명이 합격해 있는 지난 학기 공고 (시간표 생성 데모의 근거 데이터)
    dict(
        posting_id=6, department_id=2, created_by="STF001", title="2026-1학기 정보서비스팀 근로학생 모집",
        description="로욜라도서관 정보서비스팀 학기 근로\n대출/반납 데스크, 서가 정리, 이용자 안내",
        qualification="성실하고 책임감 있는 분",
        upload_date=datetime.date(2026, 2, 10), deadline=datetime.date(2026, 2, 25), status="마감",
        category="도서관",
        period_start=datetime.date(2026, 3, 2), period_end=datetime.date(2026, 6, 19),
        headcount=9, weekly_max_hours=15, location="로욜라도서관 정보서비스팀",
        contact_email="library@sogang.ac.kr", contact_phone="02-705-7100",
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
        # create_all은 기존 테이블에 새 컬럼을 추가하지 않으므로 직접 보정
        # (funding_type 도입 이전에 만들어진 DB 대응 — 정식 마이그레이션 도구 도입 전 임시)
        db.execute(text("ALTER TABLE student ADD COLUMN IF NOT EXISTS funding_type VARCHAR"))
        for column, col_type in [
            ("category", "VARCHAR"), ("period_start", "DATE"), ("period_end", "DATE"),
            ("headcount", "INTEGER"), ("weekly_max_hours", "INTEGER"), ("location", "VARCHAR"),
            ("contact_email", "VARCHAR"), ("contact_phone", "VARCHAR"), ("work_slots", "TEXT"),
        ]:
            db.execute(text(f"ALTER TABLE job_posting ADD COLUMN IF NOT EXISTS {column} {col_type}"))
        db.commit()

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

        for student_id, name, dept_name, phone, funding in [APPLICANT_STUDENT] + WORKING_STUDENTS:
            db.add(models.Student(
                student_id=student_id, name=name, department_name=dept_name,
                phone=phone, password_hash=password_hash, funding_type=funding,
            ))

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
        for i, (student_id, name, _, _, _) in enumerate(WORKING_STUDENTS):
            db.add(models.Application(
                application_id=next_app_id + i, student_id=student_id,
                posting_id=6, reviewed_by="STF001",
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
        print(f"  정보서비스팀 직원: STF001 박정보 / 근로 학생 {len(WORKING_STUDENTS)}명 (공고 6 합격)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
