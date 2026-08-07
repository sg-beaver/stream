from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class Department(Base):
    __tablename__ = "department"

    department_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    weekly_hour_limit = Column(Integer)
    headcount_to = Column(Integer)

    staff = relationship("Staff", back_populates="department")
    job_postings = relationship("JobPosting", back_populates="department")
    work_schedules = relationship("WorkSchedule", back_populates="department")
    schedule_batches = relationship("ScheduleBatch", back_populates="department")
    policy = relationship(
        "DepartmentPolicy", back_populates="department", uselist=False
    )


class Student(Base):
    __tablename__ = "student"

    student_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    department_name = Column(String)
    phone = Column(String)
    password_hash = Column(String, nullable=False)
    # 근로 장학 구분: "gyobi"(교비) | "gukga"(국가) — 값 정의는 scheduler FundingType,
    # 시간 상한·휴강일 규칙 차이는 docs/SCHEDULER_SPEC.md 참조
    funding_type = Column(String)

    applications = relationship("Application", back_populates="student")
    available_times = relationship("AvailableTime", back_populates="student")
    work_schedules = relationship("WorkSchedule", back_populates="student")
    availability_exceptions = relationship(
        "AvailabilityException", back_populates="student"
    )


class Staff(Base):
    __tablename__ = "staff"

    staff_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    department_id = Column(Integer, ForeignKey("department.department_id"))
    email = Column(String)
    phone = Column(String)
    password_hash = Column(String, nullable=False)

    department = relationship("Department", back_populates="staff")
    created_job_postings = relationship(
        "JobPosting", back_populates="creator", foreign_keys="JobPosting.created_by"
    )
    reviewed_applications = relationship(
        "Application", back_populates="reviewer", foreign_keys="Application.reviewed_by"
    )
    approved_substitute_requests = relationship(
        "SubstituteRequest",
        back_populates="approver",
        foreign_keys="SubstituteRequest.approved_by",
    )
    created_schedule_batches = relationship(
        "ScheduleBatch", back_populates="creator", foreign_keys="ScheduleBatch.created_by"
    )


class JobPosting(Base):
    __tablename__ = "job_posting"

    posting_id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(Integer, ForeignKey("department.department_id"))
    created_by = Column(String, ForeignKey("staff.staff_id"))
    title = Column(String, nullable=False)
    description = Column(Text)
    qualification = Column(Text)
    upload_date = Column(Date)
    deadline = Column(Date)
    status = Column(String)
    # 공고 상세 표시 필드 (#19 응답 확장, 이슈 #55)
    category = Column(String)  # "도서관" | "학과별 사무실" | "교내 부서"
    period_start = Column(Date)  # 근로 기간
    period_end = Column(Date)
    headcount = Column(Integer)  # 모집 인원
    weekly_max_hours = Column(Integer)  # 주간 최대 근로시간
    location = Column(String)  # 근무 장소
    contact_email = Column(String)
    contact_phone = Column(String)
    work_slots = Column(Text)  # JSON 배열 문자열, 예: ["월-10:00", "수-11:00"]

    department = relationship("Department", back_populates="job_postings")
    creator = relationship(
        "Staff", back_populates="created_job_postings", foreign_keys=[created_by]
    )
    applications = relationship("Application", back_populates="posting")


class Application(Base):
    __tablename__ = "application"
    __table_args__ = (UniqueConstraint("student_id", "posting_id"),)

    application_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String, ForeignKey("student.student_id"))
    posting_id = Column(Integer, ForeignKey("job_posting.posting_id"))
    reviewed_by = Column(String, ForeignKey("staff.staff_id"))
    cover_letter = Column(Text)
    status = Column(String)
    submitted_at = Column(DateTime, server_default=func.now())

    student = relationship("Student", back_populates="applications")
    posting = relationship("JobPosting", back_populates="applications")
    reviewer = relationship(
        "Staff", back_populates="reviewed_applications", foreign_keys=[reviewed_by]
    )


class AvailableTime(Base):
    __tablename__ = "available_time"

    availability_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String, ForeignKey("student.student_id"))
    day_of_week = Column(Integer)
    start_time = Column(Time)
    end_time = Column(Time)
    preference = Column(Integer)
    # 수합 경로 구분: "application"(합격 시 지원서에서 연동) | "manual"(학생 직접 입력).
    # 담당자 화면에서 "지원서 연동됨"과 "직접 입력"을 구분해 보여주는 데 쓴다 (REQ-SCHED-012).
    source = Column(String, default="manual")

    student = relationship("Student", back_populates="available_times")


class AvailabilityException(Base):
    """요일 반복(AvailableTime)에 대한 날짜별 예외 (이슈 #36 B안).

    exception_type == "UNAVAILABLE": 특정일 근무 불가 신고.
        start_time/end_time이 둘 다 NULL이면 하루 종일 불가.
    exception_type == "AVAILABLE": 날짜별 자유 수정(주간 패턴 대신/추가로 적용).
        start_time/end_time 둘 다 필수 (스키마 레이어에서 검증, NULL 조합 금지 —
        "하루 종일 가능"을 암묵적으로 표현하지 않기 위함).

    부서별 편집 허용 범위는 DepartmentPolicy.availability_mode가 결정하며,
    이 테이블의 스키마 자체는 모드에 따라 달라지지 않는다.
    """

    __tablename__ = "availability_exception"

    exception_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String, ForeignKey("student.student_id"))
    exception_date = Column(Date, nullable=False)
    exception_type = Column(String, nullable=False)  # "UNAVAILABLE" | "AVAILABLE"
    start_time = Column(Time)
    end_time = Column(Time)
    preference = Column(Integer)

    student = relationship("Student", back_populates="availability_exceptions")


class DepartmentPolicy(Base):
    """부서별 가능시간 수합 정책 (이슈 #36 B안).

    availability_mode: "weekly_only" | "weekly_with_unavailable" | "weekly_with_exceptions"
    저장 구조는 모든 부서 동일 — 모드 전환 시 마이그레이션이 필요 없다.

    custom_rules: 부서가 자연어로 등록한 운영 규칙 (예: "금요일 마감 시간대엔
    경험자가 최소 1명 있어야 한다"). 여러 규칙은 줄바꿈으로 구분해 하나의
    텍스트로 저장한다.

    opening_hours: 부서 담당자가 화면에서 직접 설정하는 개관 시간대.
        {"semester": {"1": [["08:00", "22:00"]], ...}, "vacation": {...}}
        - 바깥 키는 학사 기간(semester/vacation), 안쪽 키는 요일(월=1 ~ 일=7)
        - 값은 [시작, 종료] 구간 목록 — 점심 휴관처럼 하루에 여러 구간으로
          끊기는 경우를 담을 수 있다. 빈 목록이면 그 요일은 폐관
        - 시각은 30분 단위 (스케줄러 슬롯 길이와 같은 단위)
        NULL이면 scheduler/config/departments/*.json의 기본 정책을 그대로 쓴다.

    biweekly_max_hours: 부서 전체 2주 교비 근로시간 총합 상한 (Hard Constraint).
        부서 예산에 해당하는 값이라 담당자가 직접 정한다. NULL이면 정책 파일 값.

    soft_weight_scales: 페널티 카테고리별 중요도 배율
        {"contiguity": 2.0, "meal_break": 0} — 0이면 그 제약을 끈다.
        설정하지 않은(키가 없는) 카테고리는 정책 파일 가중치를 그대로 쓴다.
        미충원 억제(understaffing)는 끄면 근무표가 비어버릴 수 있어 대상이 아니다.

    min_per_slot / max_per_slot: 한 시간대에 배정할 최소·최대 인원.
        NULL이면 정책 파일의 staffing 값을 쓴다. 최소 인원을 못 채운 시간대는
        해가 없다고 보지 않고 '미충원'으로 보고한다
        (정책 파일의 allow_understaffing_with_penalty가 그 동작을 결정하며,
        이 값은 화면에서 바꾸지 않는다 — 끄면 생성이 통째로 실패할 수 있다).
    """

    __tablename__ = "department_policy"

    department_policy_id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(
        Integer, ForeignKey("department.department_id"), unique=True, nullable=False
    )
    availability_mode = Column(String, nullable=False)
    policy_file_key = Column(String, nullable=True)  # scheduler/config 정책 파일 키
    custom_rules = Column(Text, nullable=True)
    opening_hours = Column(JSONB, nullable=True)
    min_per_slot = Column(Integer, nullable=True)
    max_per_slot = Column(Integer, nullable=True)
    biweekly_max_hours = Column(Integer, nullable=True)
    soft_weight_scales = Column(JSONB, nullable=True)

    department = relationship("Department", back_populates="policy")


class ScheduleBatch(Base):
    """근무표 생성 1회 실행 단위 (draft → confirmed).

    REQ-SCHED-009: generate 결과는 확정이 아닌 초안이며, 담당자가 검토 후
    확정하는 플로우를 전제로 한다. WorkSchedule의 모든 행은 이 배치에 속한다.
    """

    __tablename__ = "schedule_batch"

    batch_id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(Integer, ForeignKey("department.department_id"))
    period_start = Column(Date)
    period_end = Column(Date)
    status = Column(String)  # "draft" | "confirmed"
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(String, ForeignKey("staff.staff_id"))
    # generate 시점의 shortages/penalty_summary/per_student 스냅샷.
    # AI 검토(review)가 batch_id만으로 근거 데이터를 조회할 수 있게 한다.
    solver_summary = Column(JSONB, nullable=True)

    department = relationship("Department", back_populates="schedule_batches")
    creator = relationship(
        "Staff", back_populates="created_schedule_batches", foreign_keys=[created_by]
    )
    work_schedules = relationship("WorkSchedule", back_populates="batch")


class WorkSchedule(Base):
    __tablename__ = "work_schedule"

    schedule_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("schedule_batch.batch_id"), nullable=False)
    student_id = Column(String, ForeignKey("student.student_id"))
    department_id = Column(Integer, ForeignKey("department.department_id"))
    work_date = Column(Date, nullable=False)
    start_time = Column(Time)
    end_time = Column(Time)

    batch = relationship("ScheduleBatch", back_populates="work_schedules")
    student = relationship("Student", back_populates="work_schedules")
    department = relationship("Department", back_populates="work_schedules")
    substitute_requests = relationship("SubstituteRequest", back_populates="schedule")


class SubstituteRequest(Base):
    __tablename__ = "substitute_request"

    request_id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("work_schedule.schedule_id"), nullable=False)
    requester_id = Column(String, ForeignKey("student.student_id"))
    substitute_id = Column(String, ForeignKey("student.student_id"))
    approved_by = Column(String, ForeignKey("staff.staff_id"))
    status = Column(String)
    reason = Column(Text)

    schedule = relationship("WorkSchedule", back_populates="substitute_requests")
    requester = relationship("Student", foreign_keys=[requester_id])
    substitute = relationship("Student", foreign_keys=[substitute_id])
    approver = relationship(
        "Staff",
        back_populates="approved_substitute_requests",
        foreign_keys=[approved_by],
    )
