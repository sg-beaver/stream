"""수집 데이터 모델."""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone


@dataclass
class RawPost:
    """크롤러가 수집한 게시물 원본 한 건."""

    source: str  # scc | ssodam | dept_math ...
    post_id: str  # 원본 사이트의 게시물 식별자
    url: str
    title: str
    author: str | None = None
    posted_at: str | None = None  # 원문 표기 그대로 (예: "2026.07.09", "07/09")
    views: int | None = None
    content_text: str | None = None
    content_html: str | None = None
    attachments: list = field(default_factory=list)
    extra: dict = field(default_factory=dict)
    crawled_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "RawPost":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})
