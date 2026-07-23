"""서강대 Sogang CMS 게시판 크롤러.

청년광장(scc.sogang.ac.kr, boardlist.do)과 학과·기관 홈페이지(cmsboardlist.do)가
같은 CMS를 쓰므로 SogangCMSSite 설정 하나로 공용 처리한다.

- 목록: {base_url}{list_endpoint}?currentPage=N&bbsConfigFK=...&siteId=...
- 상세: 목록의 <a href="...(cms)boardview.do?...pkid=..."> 링크
"""

import itertools
import logging
import re
from typing import Iterator
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

from crawler.config import SogangCMSSite
from crawler.http_client import CrawlAuthError, make_session, polite_get
from crawler.models import RawPost
from crawler.sources.base import BaseCrawler, matches_keywords

logger = logging.getLogger(__name__)

# CMS 상세 페이지에서 본문일 가능성이 높은 컨테이너 후보 (우선순위 순)
CONTENT_SELECTORS = [
    "div.bbs_view_content",
    "div.board_view_content",
    "div.view_content",
    "div.bbs-view",
    "div.board_view",
    "div.view_cont",
    "td.content",
    "div#content",
]

DATE_RE = re.compile(r"(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})")


class SogangCMSCrawler(BaseCrawler):
    def __init__(self, site: SogangCMSSite):
        self.site = site
        self.source_name = site.name
        self.session = make_session(cookie_env=site.cookie_env)

    # ---------- 목록 ----------

    def _list_url(self) -> str:
        return urljoin(self.site.base_url, self.site.list_endpoint)

    def _fetch_list(self, page: int) -> BeautifulSoup:
        params = dict(self.site.params)
        params["currentPage"] = str(page)
        resp = polite_get(self.session, self._list_url(), params=params)
        self._check_auth(resp)
        return BeautifulSoup(resp.text, "lxml")

    def _check_auth(self, resp) -> None:
        # scc는 비로그인 접근 시 gomsgboard.do(msgCode=LOG001)로 리다이렉트된다.
        if "gomsgboard.do" in resp.url or "msgCode=LOG001" in resp.url:
            raise CrawlAuthError(
                f"[{self.source_name}] 로그인 세션이 필요합니다. "
                f"브라우저에서 로그인한 뒤 Cookie 헤더 값을 환경변수 "
                f"{self.site.cookie_env or 'SCC_COOKIE'}에 넣고 다시 실행하세요."
            )

    def _parse_list(self, soup: BeautifulSoup) -> list[dict]:
        """목록 페이지에서 (pkid, title, url) 추출."""
        view_name = self.site.view_endpoint.rsplit("/", 1)[-1]  # (cms)boardview.do
        items, seen = [], set()
        for a in soup.select(f'a[href*="{view_name}"]'):
            href = a.get("href", "")
            qs = parse_qs(urlparse(href).query)
            pkid = (qs.get("pkid") or qs.get("pkId") or [None])[0]
            if not pkid or pkid in seen:
                continue
            title = a.get_text(" ", strip=True)
            if not title:
                continue
            seen.add(pkid)
            items.append(
                {
                    "post_id": pkid,
                    "title": title,
                    "url": urljoin(self.site.base_url, href),
                }
            )
        return items

    # ---------- 상세 ----------

    def _fetch_detail(self, url: str) -> tuple[str | None, str | None, str | None, list]:
        """상세 페이지에서 (본문 텍스트, 본문 HTML, 게시일, 첨부파일) 추출."""
        resp = polite_get(self.session, url)
        self._check_auth(resp)
        soup = BeautifulSoup(resp.text, "lxml")

        container = None
        for sel in CONTENT_SELECTORS:
            container = soup.select_one(sel)
            if container and container.get_text(strip=True):
                break
        if container is None or not container.get_text(strip=True):
            # 후보 셀렉터가 모두 실패하면 텍스트가 가장 긴 div를 본문으로 간주
            divs = sorted(
                soup.find_all("div"),
                key=lambda d: len(d.get_text(strip=True)),
                reverse=True,
            )
            container = divs[0] if divs else None

        text = container.get_text("\n", strip=True) if container else None
        html = str(container) if container else None

        m = DATE_RE.search(soup.get_text(" ", strip=True)[:3000])
        posted_at = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None

        attachments = [
            a.get_text(" ", strip=True)
            for a in soup.select('a[href*="download"], a[href*="fileDown"]')
            if a.get_text(strip=True)
        ]
        return text, html, posted_at, attachments

    # ---------- 크롤링 루프 ----------

    def iter_posts(self, pages: int | None, known_ids: set[str]) -> Iterator[RawPost]:
        page_range = itertools.count(1) if pages is None else range(1, pages + 1)
        prev_page_ids: set[str] | None = None
        for page in page_range:
            soup = self._fetch_list(page)
            items = self._parse_list(soup)
            if not items:
                logger.info("[%s] %d페이지에 게시물이 없어 중단", self.source_name, page)
                break
            page_ids = {item["post_id"] for item in items}
            if page_ids == prev_page_ids:
                # 범위를 벗어나면 마지막 페이지를 반복하는 게시판 대비
                logger.info("[%s] %d페이지가 이전 페이지와 동일해 중단", self.source_name, page)
                break
            prev_page_ids = page_ids
            for item in items:
                if item["post_id"] in known_ids:
                    continue
                if not matches_keywords(item["title"], self.site.keywords):
                    continue
                try:
                    text, html, posted_at, attachments = self._fetch_detail(item["url"])
                except CrawlAuthError:
                    raise
                except Exception as e:  # 개별 게시물 실패는 건너뛰고 계속
                    logger.warning("[%s] 상세 수집 실패 %s: %s", self.source_name, item["url"], e)
                    continue
                yield RawPost(
                    source=self.source_name,
                    post_id=item["post_id"],
                    url=item["url"],
                    title=item["title"],
                    posted_at=posted_at,
                    content_text=text,
                    content_html=html,
                    attachments=attachments,
                    extra={"board": self.site.label},
                )
