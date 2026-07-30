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
    """

    __tablename__ = "department_policy"

    department_policy_id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(
        Integer, ForeignKey("department.department_id"), unique=True, nullable=False
    )
    availability_mode = Column(String, nullable=False)
    policy_file_key = Column(String, nullable=True)  # scheduler/config 정책 파일 키

    department = relationship("Department", back_populates="policy")


class WorkSchedule(Base):
    __tablename__ = "work_schedule"

    schedule_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String, ForeignKey("student.student_id"))
    department_id = Column(Integer, ForeignKey("department.department_id"))
    day_of_week = Column(Integer)
    start_time = Column(Time)
    end_time = Column(Time)

    student = relationship("Student", back_populates="work_schedules")
    department = relationship("Department", back_populates="work_schedules")
    substitute_requests = relationship("SubstituteRequest", back_populates="schedule")


class SubstituteRequest(Base):
    __tablename__ = "substitute_request"

    request_id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("work_schedule.schedule_id"))
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
