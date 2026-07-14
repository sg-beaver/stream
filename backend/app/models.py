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
