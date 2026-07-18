import datetime
from typing import Literal, Optional

from pydantic import BaseModel


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


# ---- Student ----
class StudentBase(BaseModel):
    name: str
    department_name: Optional[str] = None
    phone: Optional[str] = None


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
