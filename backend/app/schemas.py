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


class DepartmentStudentItem(StudentBase):
    """부서 소속 학생 정보 + 활동 기간 (학생 관리 화면용).

    활동 기간은 담당자 저장값(Student.active_from/until)을 우선 쓰고, 없으면
    합격 공고 period_start/period_end에서 파생 — 여러 공고면 가장 이른 시작~
    가장 늦은 종료, 한쪽이라도 기간 미지정이면 무제한(null).
    """

    student_id: str
    active_from: Optional[datetime.date] = None
    active_until: Optional[datetime.date] = None
    # "student" = 담당자가 저장한 값, "posting" = 합격 공고에서 파생한 값
    active_source: str = "posting"


class StudentActivePeriodUpdate(BaseModel):
    """활동 기간 저장 — 전체 교체. null은 무제한(그쪽 제한 없음)."""

    active_from: Optional[datetime.date] = None
    active_until: Optional[datetime.date] = None


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


class AvailabilityDateItem(BaseModel):
    """날짜별로 전개된 가능 시간 (주간 패턴 + 날짜 예외 반영) — 주차별 시간표용."""

    student_id: str
    student_name: Optional[str] = None
    date: datetime.date
    start_time: datetime.time
    end_time: datetime.time


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


class AvailabilityReplaceIn(BaseModel):
    # "요일-HH:MM" 슬롯 목록 (프런트 TimeGrid·공통 지원서가 다루는 형태와 동일, 예: "화-09:00")
    slots: list[str] = Field(default_factory=list)


class AvailabilityMeOut(BaseModel):
    slots: list[str]


# ---- 수업 시간 (ClassTime, REQ-SCHED-015) ----
class ClassTimeReplaceIn(BaseModel):
    # "요일-HH:MM" 슬롯 목록 — AvailabilityReplaceIn과 동일 형태
    slots: list[str] = Field(default_factory=list)


class ClassTimeMeOut(BaseModel):
    slots: list[str]


class ClassTimeDepartmentItem(BaseModel):
    student_id: Optional[str] = None
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


# ---- 부서 스케줄링 정책 (화면에서 개관 시간대를 그리기 위한 조회용) ----
_HHMM = r"^([01]\d|2[0-3]):(00|30)$"  # 30분 단위 (스케줄러 슬롯 길이와 동일)

# 담당자가 중요도를 조정할 수 있는 Soft Constraint 카테고리
# (scheduler/constraints/soft.py의 Constraint.name과 같은 값).
# understaffing은 미충원을 억제하는 큰 값이라 제외한다 — 낮추면 근무표가 비어버린다.
ADJUSTABLE_PENALTY_CATEGORIES = (
    "preferred_staffing",
    "preference_match",
    "contiguity",
    "meal_break",
    "morning_rules",
    "exam_proximity",
    "avoid_range",
    "non_campus_day",
    "fair_hours",
)


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
    # 부서 전체 2주 교비 근로시간 총합 상한 (Hard Constraint)
    biweekly_max_hours: int
    biweekly_source: str
    # 부서 정의 근무 슬롯(#89). 정의된 요일만 포함 — 없는 요일은 자유 30분 그리드.
    # 블록은 해당 요일 개관 구간을 정확히 타일링한다 (PATCH에서 검증).
    work_slots: dict[str, list[DepartmentOpeningDay]]
    work_slots_source: str
    # 페널티 카테고리별 중요도 배율 — 설정하지 않은 카테고리는 키가 없다(=기본값)
    soft_weight_scales: dict[str, float]
    # 정책 파일의 선호 인원 중 가장 큰 값 — 최대 인원을 이보다 낮게 잡으면
    # 선호 인원을 영영 못 채우므로 화면에서 안내하는 데 쓴다
    preferred_staffing_max: int


class DepartmentPolicyUpdate(BaseModel):
    """부서 스케줄링 정책 수정 — 전달된 항목만 반영한다.

    설정 항목이 늘어나도 엔드포인트를 더 만들지 않도록 하나의 PATCH로 받는다.
    """

    # 보낸 기간(semester/vacation)만 교체 — 학기만 고치고 방학은 그대로 둘 수 있다
    opening_hours: Optional[dict[Literal["semester", "vacation"], list[DepartmentOpeningDay]]] = None
    # 부서 정의 근무 슬롯(#89). opening_hours처럼 보낸 기간만 통째 교체.
    # 목록에 없는 요일은 자유 30분 그리드(미정의) — 블록 제거는 요일을 빼서 표현한다
    work_slots: Optional[dict[Literal["semester", "vacation"], list[DepartmentOpeningDay]]] = None
    min_per_slot: Optional[int] = Field(default=None, ge=0, le=20)
    max_per_slot: Optional[int] = Field(default=None, ge=1, le=20)
    biweekly_max_hours: Optional[int] = Field(default=None, ge=1, le=2000)
    # 페널티 카테고리별 중요도 배율. 0=끄기, 0.5=낮음, 1=보통, 2=높음.
    # 보낸 카테고리만 반영하며, 설정하지 않으면 정책 파일 가중치를 그대로 쓴다.
    soft_weight_scales: Optional[dict[str, float]] = None

    @model_validator(mode="after")
    def _check(self) -> "DepartmentPolicyUpdate":
        if all(
            value is None
            for value in (
                self.opening_hours,
                self.work_slots,
                self.min_per_slot,
                self.max_per_slot,
                self.biweekly_max_hours,
                self.soft_weight_scales,
            )
        ):
            raise ValueError("수정할 항목이 없습니다.")

        for category, scale in (self.soft_weight_scales or {}).items():
            if category not in ADJUSTABLE_PENALTY_CATEGORIES:
                raise ValueError(f"조정할 수 없는 항목입니다: {category}")
            if not 0 <= scale <= 5:
                raise ValueError(f"{category}의 중요도 배율은 0~5 사이여야 합니다.")

        for period, days in (self.opening_hours or {}).items():
            seen = [d.day_of_week for d in days]
            if len(seen) != len(set(seen)):
                raise ValueError(f"{period} 기간에 같은 요일이 두 번 들어 있습니다.")

        for period, days in (self.work_slots or {}).items():
            seen = [d.day_of_week for d in days]
            if len(seen) != len(set(seen)):
                raise ValueError(f"{period} 기간의 근무 슬롯에 같은 요일이 두 번 들어 있습니다.")
            for day in days:
                # 빈 목록은 '미정의(자유 그리드)'와 구분이 안 돼 금지 —
                # 블록을 없애려면 요일을 목록에서 뺀다
                if not day.ranges:
                    raise ValueError(
                        f"{period} 기간 {day.day_of_week}요일의 근무 슬롯이 비어 있습니다. "
                        "블록을 없애려면 요일을 목록에서 빼 주세요."
                    )

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
    # 학기 고정 시간표: 대표 기간(period_start~period_end)의 배정을 이 날짜까지
    # 주 단위로 복제해 확정한다. 복제된 날짜는 공휴일 단축·폐관 등 실제 개관
    # 시간에 맞춰 서버가 자동 조정한다. None이면 기존처럼 기간 그대로 확정.
    repeat_until: Optional[datetime.date] = None


class ScheduleAdjustedDate(BaseModel):
    """학기 고정 복제 시 개관 시간 때문에 조정된 날짜 (담당자 확인용)."""

    date: datetime.date
    reason: str  # "폐관 제외" | "개관 시간에 맞춰 조정"


class ScheduleConfirmOut(BaseModel):
    batch_id: int
    status: str
    confirmed_count: int
    # repeat_until 확정에서만 채워진다 — 없으면 빈 목록
    adjusted_dates: list[ScheduleAdjustedDate] = []


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


# ---- 대타 (SubstituteRequest, REQ-SUB-001~006) ----
class SubstituteRequestCreate(BaseModel):
    schedule_id: int
    reason: Optional[str] = None


class SubstituteRequestCreateOut(BaseModel):
    request_id: int
    status: str

    class Config:
        from_attributes = True


class SubstituteCandidateItem(BaseModel):
    student_id: str
    name: Optional[str] = None


class SubstituteRespondIn(BaseModel):
    substitute_id: str
    response: Literal["수락", "거절"]


class SubstituteRequestStatusOut(BaseModel):
    request_id: int
    status: str


class SubstituteApproveOut(BaseModel):
    request_id: int
    status: str
    approved_by: Optional[str] = None


class SubstituteRequestListItem(BaseModel):
    request_id: int
    # 근무표 행과 매칭해 대타 반영 칸을 표시하기 위한 참조 (관리자 시간표 시각화)
    schedule_id: Optional[int] = None
    requester_id: Optional[str] = None
    requester_name: Optional[str] = None
    department_name: Optional[str] = None
    date: datetime.date
    start_time: datetime.time
    end_time: datetime.time
    reason: Optional[str] = None
    requested_at: Optional[datetime.datetime] = None
    status: str
    substitute_id: Optional[str] = None
    substitute_name: Optional[str] = None
    approved_by: Optional[str] = None
    approver_name: Optional[str] = None
    reject_reason: Optional[str] = None


class SubstituteRejectIn(BaseModel):
    reject_reason: Optional[str] = None


class SubstituteRejectOut(BaseModel):
    request_id: int
    status: str
    reject_reason: Optional[str] = None


class SubstituteMyRequestItem(SubstituteRequestListItem):
    # 이 요청에서 조회자의 입장 — "requester"(내가 올린 요청) | "substitute"(내가 대타로 지목/수락된 요청)
    role: str


class SubstituteOpenRequestItem(BaseModel):
    """내가 후보인(응답 가능한) 대기 중 요청 — 후보 학생의 '받은 요청' 화면용."""

    request_id: int
    requester_id: Optional[str] = None
    requester_name: Optional[str] = None
    department_name: Optional[str] = None
    date: datetime.date
    start_time: datetime.time
    end_time: datetime.time
    reason: Optional[str] = None
    requested_at: Optional[datetime.datetime] = None
