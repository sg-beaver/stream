"""서담(ssodam.com) 모집공고 게시판 크롤러.

서담은 로그인해야 게시물을 볼 수 있다. 브라우저에서 로그인한 뒤
개발자도구 > Network에서 요청의 Cookie 헤더 값을 통째로 복사해
환경변수 SSODAM_COOKIE에 넣고 실행한다.

- 목록: https://www.ssodam.com/board/{board_no}/{page}
- 상세: https://www.ssodam.com/content/{content_id}
"""

import itertools
import logging
import re
from typing import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from crawler.config import (
    CAMPUS_JOB_KEYWORDS,
    SSODAM_BASE_URL,
    SSODAM_BOARD_NO,
    SSODAM_COOKIE_ENV,
)
from crawler.http_client import CrawlAuthError, make_session, polite_get
from crawler.models import RawPost
from crawler.sources.base import BaseCrawler, matches_keywords

logger = logging.getLogger(__name__)

CONTENT_ID_RE = re.compile(r"/content/(\d+)")


class SsodamCrawler(BaseCrawler):
    source_name = "ssodam"

    def __init__(
        self,
        board_no: int = SSODAM_BOARD_NO,
        keywords: list[str] | None = None,
    ):
        self.board_no = board_no
        # 모집공고 게시판에는 연구 참여·동아리 등 교외성 글이 섞여 있어
        # 기본적으로 교내 근로 키워드로 제목을 필터링한다.
        self.keywords = CAMPUS_JOB_KEYWORDS if keywords is None else keywords
        self.session = make_session(cookie_env=SSODAM_COOKIE_ENV)

    def _check_auth(self, soup: BeautifulSoup, url: str) -> None:
        # 로그인 상태면 상단 메뉴에 /logout 링크가 있다.
        if soup.select_one('a[href="/logout"]'):
            return
        if soup.select_one('a[href*="login"]') or "로그인" in soup.get_text()[:2000]:
            raise CrawlAuthError(
                "[ssodam] 로그인 세션이 필요합니다. 브라우저에서 로그인한 뒤 "
                f"Cookie 헤더 값을 환경변수 {SSODAM_COOKIE_ENV}에 넣고 다시 실행하세요. "
                f"(요청 URL: {url})"
            )

    # ---------- 목록 ----------

    def _fetch_list(self, page: int) -> list[dict]:
        url = f"{SSODAM_BASE_URL}/board/{self.board_no}/{page}"
        resp = polite_get(self.session, url)
        soup = BeautifulSoup(resp.text, "lxml")
        self._check_auth(soup, url)

        items, seen = [], set()
        for a in soup.select('a[href^="/content/"]'):
            href = a.get("href", "")
            m = CONTENT_ID_RE.search(href)
            if not m:
                continue
            content_id = m.group(1)
            if content_id in seen:
                continue
            title = a.get_text(" ", strip=True)
            if not title:
                continue
            # 광고(제휴)·공지 행 제외
            row = a.find_parent("tr")
            row_text = row.get_text(" ", strip=True) if row else ""
            if row_text.startswith(("공지", "제휴")):
                continue
            seen.add(content_id)
            items.append(
                {
                    "post_id": content_id,
                    "title": title,
                    "url": urljoin(SSODAM_BASE_URL, f"/content/{content_id}"),
                }
            )
        return items

    # ---------- 상세 ----------

    def _fetch_detail(self, url: str) -> dict:
        resp = polite_get(self.session, url)
        soup = BeautifulSoup(resp.text, "lxml")
        self._check_auth(soup, url)

        # 본문은 div.board-content에 있다. (post-element 첫 매치는 사이드 메뉴이므로
        # 과거처럼 폴백으로 메뉴 텍스트를 집어오지 않도록 명시 셀렉터만 쓴다.)
        container = None
        for sel in ["div.board-content", "div.post-content", "div.content-body"]:
            container = soup.select_one(sel)
            if container and len(container.get_text(strip=True)) > 30:
                break
            container = None

        text = container.get_text("\n", strip=True) if container else None
        html = str(container) if container else None

        m = re.search(r"(\d{4}[./-]\d{1,2}[./-]\d{1,2})", soup.get_text(" ", strip=True))
        return {
            "content_text": text,
            "content_html": html,
            "posted_at": m.group(1) if m else None,
        }

    # ---------- 본문 재수집 ----------

    @staticmethod
    def _looks_broken(content_text: str | None) -> bool:
        """본문이 비었거나, 과거 셀렉터 버그로 사이드 메뉴 텍스트가 저장된 경우."""
        if not content_text or not content_text.strip():
            return True
        t = content_text.strip()
        return "자유게시판" in t and "벼룩시장" in t and len(t) < 500

    def refetch_details(self, store, only_broken: bool = True) -> int:
        """이미 수집된 raw 게시물의 본문을 다시 가져와 파일을 갱신한다.

        원본은 {source}.jsonl.bak 으로 백업한다. 반환값은 갱신 건수.
        """
        import json
        from datetime import datetime, timezone

        path = store.path(self.source_name)
        if not path.exists():
            logger.info("[ssodam] raw 파일이 없어 재수집할 게시물이 없습니다")
            return 0

        records = list(store.iter_records(self.source_name))
        targets = [
            r for r in records
            if not only_broken or self._looks_broken(r.get("content_text"))
        ]
        logger.info(
            "[ssodam] 전체 %d건 중 %d건 본문 재수집 시작", len(records), len(targets)
        )

        updated = 0
        for i, rec in enumerate(targets, 1):
            try:
                detail = self._fetch_detail(rec["url"])
            except CrawlAuthError:
                raise
            except Exception as e:
                logger.warning("[ssodam] 재수집 실패 %s: %s", rec["url"], e)
                continue
            if not detail.get("content_text"):
                logger.warning("[ssodam] 본문을 찾지 못함 (%s) — 건너뜀", rec["post_id"])
                continue
            rec["content_text"] = detail["content_text"]
            rec["content_html"] = detail["content_html"]
            if detail.get("posted_at"):
                rec["posted_at"] = detail["posted_at"]
            rec["crawled_at"] = datetime.now(timezone.utc).isoformat()
            updated += 1
            if i % 50 == 0 or i == len(targets):
                logger.info("[ssodam] 재수집 진행 %d/%d (갱신 %d건)", i, len(targets), updated)

        backup = path.with_suffix(".jsonl.bak")
        path.replace(backup)
        with path.open("w", encoding="utf-8") as f:
            for rec in records:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        logger.info(
            "[ssodam] 본문 %d건 갱신 완료 (백업: %s)", updated, backup.name
        )
        return updated

    # ---------- 크롤링 루프 ----------

    def iter_posts(self, pages: int | None, known_ids: set[str]) -> Iterator[RawPost]:
        page_range = itertools.count(1) if pages is None else range(1, pages + 1)
        prev_page_ids: set[str] | None = None
        for page in page_range:
            items = self._fetch_list(page)
            if not items:
                logger.info("[ssodam] %d페이지에 게시물이 없어 중단", page)
                break
            page_ids = {item["post_id"] for item in items}
            if page_ids == prev_page_ids:
                # 범위를 벗어나면 마지막 페이지를 반복하는 게시판 대비
                logger.info("[ssodam] %d페이지가 이전 페이지와 동일해 중단", page)
                break
            prev_page_ids = page_ids
            for item in items:
                if item["post_id"] in known_ids:
                    continue
                if not matches_keywords(item["title"], self.keywords):
                    continue
                try:
                    detail = self._fetch_detail(item["url"])
                except CrawlAuthError:
                    raise
                except Exception as e:
                    logger.warning("[ssodam] 상세 수집 실패 %s: %s", item["url"], e)
                    continue
                yield RawPost(
                    source=self.source_name,
                    post_id=item["post_id"],
                    url=item["url"],
                    title=item["title"],
                    extra={"board": f"모집공고(board {self.board_no})"},
                    **detail,
                )
