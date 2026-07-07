import datetime
from typing import Optional

from pydantic import BaseModel


# ---- Auth ----
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    sub: Optional[str] = None


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
class JobPostingBase(BaseModel):
    department_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    qualification: Optional[str] = None
    upload_date: Optional[datetime.date] = None
    deadline: Optional[datetime.date] = None
    status: Optional[str] = None


class JobPostingCreate(JobPostingBase):
    pass


class JobPostingOut(JobPostingBase):
    posting_id: int
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


# ---- Application ----
class ApplicationBase(BaseModel):
    posting_id: int
    cover_letter: Optional[str] = None


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationOut(ApplicationBase):
    application_id: int
    student_id: str
    reviewed_by: Optional[str] = None
    status: Optional[str] = None
    submitted_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True
