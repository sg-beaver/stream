import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


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
    # student_id는 담당자 화면이 학생별로 묶어 보여주기 위해 필요 (동명이인 구분)
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    day_of_week: int
    start_time: datetime.time
    end_time: datetime.time
    source: Optional[str] = None


class AvailabilityImportResult(BaseModel):
    student_id: str
    student_name: Optional[str] = None
    # "imported"(새로 연동됨) | "already"(이미 수합돼 있어 건너뜀) | "no_slots"(지원서에 시간 없음)
    result: str
    interval_count: int = 0


class AvailabilityImportOut(BaseModel):
    imported_students: int
    imported_intervals: int
    results: list[AvailabilityImportResult]


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


# ---- 부서 스케줄링 정책 (화면에서 개관 시간대를 그리기 위한 조회용) ----
_HHMM = r"^([01]\d|2[0-3]):(00|30)$"  # 30분 단위 (스케줄러 슬롯 길이와 동일)


class OpeningHourRange(BaseModel):
    """개관 구간 하나. 시각은 30분 단위."""

    start_time: str = Field(pattern=_HHMM, examples=["08:00"])
    end_time: str = Field(pattern=_HHMM, examples=["22:00"])

    @model_validator(mode="after")
    def _check_order(self) -> "OpeningHourRange":
        if self.start_time >= self.end_time:
            raise ValueError("개관 시각이 폐관 시각보다 빠르거나 같아야 합니다.")
        return self


class DepartmentOpeningDay(BaseModel):
    """요일 하나의 개관 구간 목록. 빈 목록이면 그 요일은 폐관."""

    day_of_week: Literal[1, 2, 3, 4, 5, 6, 7]  # 월=1 ~ 일=7
    # 점심 휴관처럼 하루가 여러 구간으로 끊길 수 있어 목록으로 받는다
    ranges: list[OpeningHourRange] = []

    @model_validator(mode="after")
    def _check_no_overlap(self) -> "DepartmentOpeningDay":
        ordered = sorted(self.ranges, key=lambda r: r.start_time)
        for previous, current in zip(ordered, ordered[1:]):
            if current.start_time < previous.end_time:
                raise ValueError(
                    f"{self.day_of_week}요일의 개관 구간이 서로 겹칩니다: "
                    f"{previous.start_time}~{previous.end_time}, "
                    f"{current.start_time}~{current.end_time}"
                )
        return self


class DepartmentPolicyOut(BaseModel):
    department_id: int
    department_name: Optional[str] = None
    policy_file_key: str
    slot_minutes: int
    # 화면 그리드의 세로 범위 — 학기·방학 개관 시간을 모두 덮는 구간
    grid_start_time: str
    grid_end_time: str
    # "department"= 담당자가 화면에서 설정한 값, "policy_file"= 기본 정책 파일 값
    opening_hours_source: str
    opening_hours: dict[str, list[DepartmentOpeningDay]]  # {"semester": [...], "vacation": [...]}
    # 한 시간대에 배정할 최소·최대 인원
    min_per_slot: int
    max_per_slot: int
    staffing_source: str
    # 정책 파일의 선호 인원 중 가장 큰 값 — 최대 인원을 이보다 낮게 잡으면
    # 선호 인원을 영영 못 채우므로 화면에서 안내하는 데 쓴다
    preferred_staffing_max: int


class DepartmentPolicyUpdate(BaseModel):
    """부서 스케줄링 정책 수정 — 전달된 항목만 반영한다.

    설정 항목이 늘어나도 엔드포인트를 더 만들지 않도록 하나의 PATCH로 받는다.
    """

    # 보낸 기간(semester/vacation)만 교체 — 학기만 고치고 방학은 그대로 둘 수 있다
    opening_hours: Optional[dict[Literal["semester", "vacation"], list[DepartmentOpeningDay]]] = None
    min_per_slot: Optional[int] = Field(default=None, ge=0, le=20)
    max_per_slot: Optional[int] = Field(default=None, ge=1, le=20)

    @model_validator(mode="after")
    def _check(self) -> "DepartmentPolicyUpdate":
        if (
            self.opening_hours is None
            and self.min_per_slot is None
            and self.max_per_slot is None
        ):
            raise ValueError("수정할 항목이 없습니다.")

        for period, days in (self.opening_hours or {}).items():
            seen = [d.day_of_week for d in days]
            if len(seen) != len(set(seen)):
                raise ValueError(f"{period} 기간에 같은 요일이 두 번 들어 있습니다.")

        # 둘 다 보낼 때만 여기서 비교할 수 있다. 한쪽만 보낸 경우는
        # 저장된 값과 비교해야 하므로 라우터에서 검증한다.
        if (
            self.min_per_slot is not None
            and self.max_per_slot is not None
            and self.min_per_slot > self.max_per_slot
        ):
            raise ValueError("최소 인원이 최대 인원보다 많을 수 없습니다.")
        return self


# ---- 확정 근무표 (REQ-SCHED-007/008/009) ----
class ScheduleConfirmItem(BaseModel):
    """generate 응답의 schedules[] 한 줄을 그대로 되돌려받는 형태."""

    student_id: str
    date: datetime.date
    start_time: datetime.time
    end_time: datetime.time


class ScheduleConfirmRequest(BaseModel):
    department_id: int
    period_start: datetime.date
    period_end: datetime.date
    schedules: list[ScheduleConfirmItem]


class ScheduleConfirmOut(BaseModel):
    batch_id: int
    status: str
    confirmed_count: int


class ScheduleManualCreate(BaseModel):
    """기존 근로 학생 수동 등록 — 요일 반복이 아닌 날짜 단위 (REQ-SCHED-010)."""

    student_id: str
    department_id: int
    work_date: datetime.date
    start_time: datetime.time
    end_time: datetime.time


class ScheduleManualCreateOut(BaseModel):
    schedule_id: int
    batch_id: int


class MyScheduleItem(BaseModel):
    schedule_id: int
    date: datetime.date
    day_of_week: str
    start_time: datetime.time
    end_time: datetime.time
    department_name: Optional[str] = None


class DepartmentScheduleItem(MyScheduleItem):
    student_id: Optional[str] = None
    student_name: Optional[str] = None
