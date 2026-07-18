"""크롤러 공통 베이스."""

import logging
from abc import ABC, abstractmethod
from typing import Iterator

from crawler.models import RawPost
from crawler.storage import RawStore

logger = logging.getLogger(__name__)


class BaseCrawler(ABC):
    """소스 하나를 담당하는 크롤러.

    crawl()은 목록 페이지를 돌며 새 게시물만 상세 수집해 RawPost로 낸다.
    """

    source_name: str

    @abstractmethod
    def iter_posts(self, pages: int | None, known_ids: set[str]) -> Iterator[RawPost]:
        """목록 pages쪽을 순회하며 known_ids에 없는 게시물만 수집한다.

        pages가 None이면 게시물이 없는 페이지가 나올 때까지 전체를 순회한다.
        """

    def run(self, store: RawStore, pages: int | None = 3) -> int:
        known = store.existing_ids(self.source_name)
        scope = "전체 페이지" if pages is None else f"목록 {pages}페이지"
        logger.info("[%s] 기존 수집 %d건, %s 크롤링 시작", self.source_name, len(known), scope)
        count = 0
        for post in self.iter_posts(pages=pages, known_ids=known):
            store.append_post(post)
            known.add(post.post_id)
            count += 1
            logger.info("[%s] 수집: (%s) %s", self.source_name, post.post_id, post.title)
        logger.info("[%s] 신규 %d건 수집 완료", self.source_name, count)
        return count


def matches_keywords(title: str, keywords: list[str] | None) -> bool:
    if not keywords:
        return True
    return any(k in title for k in keywords)
