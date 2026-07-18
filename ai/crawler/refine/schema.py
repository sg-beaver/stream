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
    description: Optional[str] = Field(
        default=None, description="담당 업무 내용 요약 (3문장 이내)"
    )
    qualification: Optional[str] = Field(
        default=None, description="지원 자격 요건 (학년, 학과, 성적, 기타 조건)"
    )
    wage: Optional[str] = Field(
        default=None, description="보수 (예: '시급 11,000원', '월 400,000원')"
    )
    work_hours: Optional[str] = Field(
        default=None, description="근무 시간 (예: '주 10시간', '평일 09:00-13:00')"
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
    apply_method: Optional[str] = Field(
        default=None, description="지원 방법 (이메일 접수, 구글폼 링크 등)"
    )
    contact: Optional[str] = Field(
        default=None, description="문의처 (이메일/전화번호)"
    )
