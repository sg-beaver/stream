import datetime
from typing import Literal, Optional

from pydantic import BaseModel, model_validator


# ---- Auth ----
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    sub: Optional[str] = None


class LoginRequest(BaseModel):
    id: str
    password: str
    role: Literal["student", "staff"]


class LoginResponse(BaseModel):
    token: str
    role: str
    name: str
    # 직원 로그인 시 소속 부서 (관리자 화면 부서 스코프용, 학생은 null — #55)
    department_id: Optional[int] = None
    department_name: Optional[str] = None


# ---- Student ----
class StudentBase(BaseModel):
    name: str
    department_name: Optional[str] = None
    phone: Optional[str] = None
    # 근로 장학 구분 (교비/국가) — 값 정의는 docs/SCHEDULER_SPEC.md 2.1
    funding_type: Optional[Literal["gyobi", "gukga"]] = None


class StudentCreate(StudentBase):
    student_id: str
    password: str


class StudentOut(StudentBase):
    student_id: str

    class Config:
        from_attributes = True


# ---- Staff ----
class StaffBase(BaseModel):
    name: str
    department_id: Optional[int] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class StaffCreate(StaffBase):
    staff_id: str
    password: str


class StaffOut(StaffBase):
    staff_id: str

    class Config:
        from_attributes = True


# ---- Department ----
class DepartmentBase(BaseModel):
    name: str
    weekly_hour_limit: Optional[int] = None
    headcount_to: Optional[int] = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentOut(DepartmentBase):
    department_id: int

    class Config:
        from_attributes = True


# ---- Job Posting ----
class JobPostingCreate(BaseModel):
    department_id: int
    title: str
    description: str
    qualification: Optional[str] = None
    deadline: datetime.date
    # 상세 표시 필드 (#19 응답 확장, 이슈 #55)
    category: Optional[str] = None
    period_start: Optional[datetime.date] = None
    period_end: Optional[datetime.date] = None
    headcount: Optional[int] = None
    weekly_max_hours: Optional[int] = None
    location: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    work_slots: Optional[list[str]] = None  # 예: ["월-10:00", "수-11:00"]


class JobPostingUpdate(BaseModel):
    """PATCH /api/postings/{id} — 전달된 필드만 수정 (직원, 본인 부서 공고만)."""

    title: Optional[str] = None
    description: Optional[str] = None
    qualification: Optional[str] = None
    deadline: Optional[datetime.date] = None
    status: Optional[Literal["모집중", "마감"]] = None
    category: Optional[str] = None
    period_start: Optional[datetime.date] = None
    period_end: Optional[datetime.date] = None
    headcount: Optional[int] = None
    weekly_max_hours: Optional[int] = None
    location: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    work_slots: Optional[list[str]] = None


class JobPostingCreateOut(BaseModel):
    posting_id: int
    status: str
    upload_date: datetime.date
    created_by: str

    class Config:
        from_attributes = True


class JobPostingListItem(BaseModel):
    posting_id: int
    title: str
    department_name: Optional[str] = None
    upload_date: Optional[datetime.date] = None
    deadline: Optional[datetime.date] = None
    status: Optional[str] = None
    category: Optional[str] = None
    period_start: Optional[datetime.date] = None
    period_end: Optional[datetime.date] = None
    headcount: Optional[int] = None
    weekly_max_hours: Optional[int] = None
    # 요청자가 학생일 때만 채워지는 개인화 필드
    applied: Optional[bool] = None
    application_id: Optional[int] = None
    schedule_match: Optional[bool] = None  # 학생 가능시간과 work_slots 겹침 여부


class JobPostingDetail(BaseModel):
    posting_id: int
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    created_by: Optional[str] = None
    title: str
    description: Optional[str] = None
    qualification: Optional[str] = None
    upload_date: Optional[datetime.date] = None
    deadline: Optional[datetime.date] = None
    status: Optional[str] = None
    category: Optional[str] = None
    period_start: Optional[datetime.date] = None
    period_end: Optional[datetime.date] = None
    headcount: Optional[int] = None
    weekly_max_hours: Optional[int] = None
    location: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    work_slots: Optional[list[str]] = None
    applied: Optional[bool] = None
    application_id: Optional[int] = None


# ---- Application ----
class ApplicationBase(BaseModel):
    posting_id: int
    cover_letter: Optional[str] = None


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationResponse(BaseModel):
    application_id: int
    student_id: str
    posting_id: int
    cover_letter: Optional[str] = None
    status: Optional[str] = None
    submitted_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class ApplicationOut(ApplicationBase):
    application_id: int
    student_id: str
    reviewed_by: Optional[str] = None
    status: Optional[str] = None
    submitted_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class ApplicationStatusUpdate(BaseModel):
    status: Literal["합격", "불합격"]


class MyApplicationItem(BaseModel):
    application_id: int
    posting_id: int
    posting_title: Optional[str] = None
    department_name: Optional[str] = None
    cover_letter: Optional[str] = None
    status: Optional[str] = None
    submitted_at: Optional[datetime.datetime] = None
    # 지원 상세 화면용 공고 부가 정보 (#19 항목 2, 이슈 #55)
    period_start: Optional[datetime.date] = None
    period_end: Optional[datetime.date] = None


class ApplicantItem(BaseModel):
    application_id: int
    student_id: str
    student_name: Optional[str] = None
    cover_letter: Optional[str] = None
    status: Optional[str] = None
    submitted_at: Optional[datetime.datetime] = None


# ---- Availability ----
class AvailabilityCreate(BaseModel):
    day_of_week: Literal[1, 2, 3, 4, 5, 6, 7]
    start_time: datetime.time
    end_time: datetime.time
    # 선호도: 1=하, 2=중, 3=상 (숫자가 클수록 선호).
    # 스케줄러는 3만 '근무 희망'(SC-PREF-1)으로 취급한다
    # — scheduler/service.py의 _PREFERRED_THRESHOLD
    preference: Literal[1, 2, 3]


class AvailabilityCreateOut(BaseModel):
    availability_id: int

    class Config:
        from_attributes = True


class AvailabilityDepartmentItem(BaseModel):
    student_name: Optional[str] = None
    day_of_week: int
    start_time: datetime.time
    end_time: datetime.time


# ---- Availability Exception (이슈 #36 B안) ----
class AvailabilityExceptionCreate(BaseModel):
    exception_date: datetime.date
    exception_type: Literal["UNAVAILABLE", "AVAILABLE"]
    start_time: Optional[datetime.time] = None
    end_time: Optional[datetime.time] = None
    preference: Optional[Literal[1, 2, 3]] = None

    @model_validator(mode="after")
    def _check_time_and_preference(self) -> "AvailabilityExceptionCreate":
        if self.exception_type == "AVAILABLE":
            if self.start_time is None or self.end_time is None:
                raise ValueError("AVAILABLE 타입은 start_time, end_time이 모두 필요합니다.")
            if self.preference is None:
                raise ValueError("AVAILABLE 타입은 preference가 필요합니다.")
        else:  # UNAVAILABLE
            if self.preference is not None:
                raise ValueError("UNAVAILABLE 타입은 preference를 지정할 수 없습니다.")
            if (self.start_time is None) != (self.end_time is None):
                raise ValueError("start_time, end_time은 둘 다 지정하거나 둘 다 비워야 합니다.")
        return self


class AvailabilityExceptionCreateOut(BaseModel):
    exception_id: int

    class Config:
        from_attributes = True


class AvailabilityExceptionItem(BaseModel):
    exception_id: int
    exception_date: datetime.date
    exception_type: str
    start_time: Optional[datetime.time] = None
    end_time: Optional[datetime.time] = None
    preference: Optional[int] = None

    class Config:
        from_attributes = True
