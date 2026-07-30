"""정제 결과 스키마.

backend/app/models.py의 job_posting 테이블(title, description, qualification,
upload_date, deadline)과 맞닿도록 설계하되, 원본 공고에만 있는 정보(시급,
근무시간, 모집인원 등)는 확장 필드로 함께 보존한다.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class RefinedPosting(BaseModel):
    """교내 근로 공고 한 건의 정형화 결과."""

    is_campus_job: bool = Field(
        description="서강대학교 교내 근로(조교/근로장학/행정보조 등) 공고이면 true. "
        "교외 알바, 연구 참여자 모집, 동아리 모집 등은 false."
    )
    category: Literal[
        "조교", "근로장학", "행정보조", "연구보조", "튜터/멘토", "기타교내근로", "해당없음"
    ] = Field(description="공고 분류. is_campus_job이 false면 '해당없음'.")
    title: str = Field(description="정리된 공고 제목 (말머리 태그 제거)")
    organization: Optional[str] = Field(
        default=None, description="모집 부서/기관/학과명 (예: 교육혁신팀, 수학과)"
    )
    role: Optional[str] = Field(
        default=None,
        description="모집 직무를 짧은 명사구로 (예: '논술 조교', '실험 조교', 'SNS 운영', "
        "'사무보조', '영어 튜터'). 부서·기관명은 포함하지 않는다. "
        "직무가 불분명하면 null, is_campus_job이 false면 null.",
    )
    description: Optional[str] = Field(
        default=None, description="담당 업무 내용 요약 (3문장 이내)"
    )
    qualification: Optional[str] = Field(
        default=None, description="지원 자격 요건 (학년, 학과, 성적, 기타 필수 조건)"
    )
    preferred_qualification: Optional[str] = Field(
        default=None,
        description="우대사항 (예: '디자인 툴 사용 가능자 우대', '관련 업무 경험자 우대'). "
        "필수 자격(qualification)과 구분해 우대/가점 조건만 담는다.",
    )
    work_location: Optional[str] = Field(
        default=None, description="근무 장소 (예: '리치과학관 R404', '국제인문관 J건물')"
    )
    wage: Optional[str] = Field(
        default=None, description="보수 원문 표기 (예: '시급 11,000원', '월 400,000원')"
    )
    hourly_wage_krw: Optional[int] = Field(
        default=None,
        description="시급을 원화 정수로 정규화 (예: 11000). 시급이 아닌 월급·건별 보수만 있으면 null.",
    )
    work_hours: Optional[str] = Field(
        default=None, description="근무 시간 (예: '주 10시간', '평일 09:00-13:00')"
    )
    weekly_hours: Optional[float] = Field(
        default=None,
        description="주당 근무시간을 숫자로 정규화 (예: 주 10시간 → 10). '주당 최대 7시간'처럼 상한이면 그 값.",
    )
    work_period: Optional[str] = Field(
        default=None, description="근무 기간 (예: '2026-09-01 ~ 2026-12-20')"
    )
    headcount: Optional[int] = Field(default=None, description="모집 인원 수")
    posted_date: Optional[str] = Field(
        default=None, description="공고 게시일 (YYYY-MM-DD)"
    )
    deadline: Optional[str] = Field(
        default=None, description="지원 마감일 (YYYY-MM-DD). 시간까지 있으면 날짜만."
    )
    application_start: Optional[str] = Field(
        default=None, description="지원 접수 시작일 (YYYY-MM-DD)"
    )
    apply_method: Optional[str] = Field(
        default=None, description="지원 방법 (이메일 접수, 구글폼 링크 등)"
    )
    documents_required: Optional[str] = Field(
        default=None, description="제출 서류 (예: '지원서, 시간표, 성적증명서')"
    )
    selection_method: Optional[str] = Field(
        default=None, description="선발 방법 (예: '서류 심사 후 면접')"
    )
    contact: Optional[str] = Field(
        default=None, description="문의처 (이메일/전화번호)"
    )


class RefinedBatchItem(BaseModel):
    """배치 정제 결과의 한 항목 — 입력 게시물 번호와 정제 결과의 쌍."""

    post_index: int = Field(description="입력에 표기된 게시물 번호 ([게시물 N]의 N)")
    posting: RefinedPosting


class RefinedBatch(BaseModel):
    """여러 게시물을 한 번에 정제한 결과."""

    items: list[RefinedBatchItem] = Field(
        description="입력된 모든 게시물에 대해 게시물 번호 순서대로 하나씩"
    )
