"""표준 Sogang CMS가 아닌 학과 홈페이지 게시판 크롤러.

이공계 학과들은 공용 CMS 대신 자체 사이트(그누보드, 커스텀 php 게시판)를 쓴다.
사이트마다 목록 URL·상세 링크 패턴·본문 컨테이너가 달라 HTML_SITES 명세로 정의한다.

| 소스 | 학과 | 게시판 |
|---|---|---|
| dept_lifescience | 생명과학과 | 공지사항 (그누보드) |
| dept_me | 기계공학과 | 학과게시판 (그누보드) |
| dept_ee | 전자공학과 | 공지사항 (커스텀 php) |
| dept_sse | 시스템반도체공학과 | 공지사항 (커스텀 php) |
| dept_se / dept_se_recruit | 반도체공학과 | 공지사항 / 채용공고 |
| dept_chemeng / dept_chemeng_career | 화공생명공학과 | 공지사항 / 취업·모집 |

화학과(chemistry.sogang.ac.kr)는 자체 게시판이 확인되지 않아 제외한다.
"""

import itertools
import logging
import re
from dataclasses import dataclass
from typing import Iterator
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

from crawler.http_client import make_session, polite_get
from crawler.models import RawPost
from crawler.sources.base import BaseCrawler

logger = logging.getLogger(__name__)

DATE_RE = re.compile(r"(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})")


@dataclass(frozen=True)
class HtmlBoardSite:
    name: str                       # 소스 이름 (raw/refined 파일명)
    org_name: str                   # 조직명 (정제 힌트)
    base_url: str
    list_path: str                  # '{page}' 포함 목록 경로
    view_marker: str                # 상세 링크를 식별하는 substring
    id_param: str                   # 게시물 id 쿼리 파라미터
    content_selectors: tuple        # 본문 컨테이너 CSS 셀렉터 (우선순위순)
    label: str = "공지사항"
    verify_ssl: bool = True         # 인증서 체인이 깨진 사이트는 False
    # 상세 링크가 href 쿼리가 아니라 javascript 함수 호출인 게시판용:
    # link_id_re의 첫 캡처 그룹이 게시물 id, view_url의 {pid}에 끼워 상세 URL을 만든다
    link_id_re: str | None = None
    view_url: str | None = None


HTML_SITES: list[HtmlBoardSite] = [
    HtmlBoardSite(
        name="dept_lifescience", org_name="생명과학과",
        base_url="http://lifescien.sogang.ac.kr",
        list_path="/bbs/board.php?bo_table=notice&page={page}",
        view_marker="bo_table=notice", id_param="wr_id",
        content_selectors=("#bo_v_con",),
    ),
    HtmlBoardSite(
        name="dept_me", org_name="기계공학과",
        base_url="https://me.sogang.ac.kr",
        list_path="/v2/bbs/board.php?bo_table=sub6_1&page={page}",
        view_marker="bo_table=sub6_1", id_param="wr_id",
        content_selectors=("div.writ_view_con", "#bo_v_con"),
        label="학과게시판",
    ),
    HtmlBoardSite(
        name="dept_ee", org_name="전자공학과",
        base_url="https://ee.sogang.ac.kr",
        list_path="/kor/community/notice01.php?pNo={page}",
        view_marker="notice01.php?m=v", id_param="idx",
        content_selectors=("div.v_cont", "div.board_view"),
    ),
    HtmlBoardSite(
        name="dept_sse", org_name="시스템반도체공학과",
        base_url="https://sse.sogang.ac.kr",
        list_path="/kor/community/notice.php?pNo={page}",
        view_marker="notice.php?m=v", id_param="idx",
        content_selectors=("#hwpEditorBoardContent", "div.view_bx"),
        verify_ssl=False,  # 중간 인증서 누락으로 체인 검증 실패 (2026-07 기준)
    ),
    HtmlBoardSite(
        name="dept_se", org_name="반도체공학과",
        base_url="https://se.sogang.ac.kr",
        list_path="/board/board_list.php?board_id=notice&page={page}",
        view_marker="board_view.php?board_id=notice", id_param="no",
        content_selectors=("div.view_con",),
    ),
    HtmlBoardSite(
        name="dept_se_recruit", org_name="반도체공학과",
        base_url="https://se.sogang.ac.kr",
        list_path="/board/board_list.php?board_id=recruit&page={page}",
        view_marker="board_view.php?board_id=recruit", id_param="no",
        content_selectors=("div.view_con",),
        label="채용공고",
    ),
    HtmlBoardSite(
        name="dept_chemeng", org_name="화공생명공학과",
        base_url="http://chemeng.sogang.ac.kr",
        list_path="/kor/sub/05_04.php?pageNo={page}",
        view_marker="05_04.php?mode=view", id_param="idx",
        content_selectors=("div.bbs_cont", "#b_content", "div.view_content"),
    ),
    HtmlBoardSite(
        name="dept_gonzaga", org_name="곤자가국제학사",
        base_url="https://gonzaga.sogang.ac.kr",
        list_path="/admin/board/list.jsp?board_nm=notice&intNowPage={page}",
        view_marker="board_view(", id_param="idx",
        link_id_re=r"board_view\('\d+',\s*'(\d+)'\)",
        view_url="/admin/board/view.jsp?board_nm=notice&idx={pid}&intNowPage=1",
        content_selectors=("table",),  # view.jsp는 표 하나에 제목·본문이 담긴다
    ),
    HtmlBoardSite(
        name="dept_chemeng_career", org_name="화공생명공학과",
        base_url="http://chemeng.sogang.ac.kr",
        list_path="/kor/sub/05_05.php?pageNo={page}",
        view_marker="05_05.php?mode=view", id_param="idx",
        content_selectors=("div.bbs_cont", "#b_content", "div.view_content"),
        label="취업·모집",
    ),
]


class DeptHtmlCrawler(BaseCrawler):
    """HtmlBoardSite 명세 하나를 크롤링한다."""

    def __init__(self, site: HtmlBoardSite):
        self.site = site
        self.source_name = site.name
        self.session = make_session()

    def _fetch(self, url: str) -> BeautifulSoup:
        kwargs = {}
        if not self.site.verify_ssl:
            import urllib3

            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            kwargs["verify"] = False
        resp = polite_get(self.session, url, **kwargs)
        # php 사이트는 인코딩 선언이 없어 latin-1로 잘못 잡히는 경우가 있다
        if resp.encoding and resp.encoding.lower() in ("iso-8859-1", "ascii"):
            resp.encoding = resp.apparent_encoding
        return BeautifulSoup(resp.text, "lxml")

    def _list_items(self, page: int) -> list[dict]:
        url = urljoin(self.site.base_url, self.site.list_path.format(page=page))
        soup = self._fetch(url)
        items, seen = [], set()
        for a in soup.select("a[href]"):
            href = a.get("href", "")
            if self.site.view_marker not in href:
                continue
            if self.site.link_id_re:
                # javascript:board_view('1','8521') 같은 함수 호출 링크
                m = re.search(self.site.link_id_re, href)
                if not m:
                    continue
                pid = m.group(1)
                detail_url = urljoin(self.site.base_url, self.site.view_url.format(pid=pid))
            else:
                q = parse_qs(urlparse(href).query)
                pid = (q.get(self.site.id_param) or [None])[0]
                detail_url = urljoin(url, href)
            if not pid or pid in seen:
                continue
            title = a.get_text(" ", strip=True)
            if not title or len(title) < 4:  # 아이콘·번호 링크 제외
                continue
            seen.add(pid)
            items.append({"post_id": pid, "title": title, "url": detail_url})
        return items

    def _fetch_detail(self, url: str) -> dict:
        soup = self._fetch(url)
        container = None
        for sel in self.site.content_selectors:
            container = soup.select_one(sel)
            if container and len(container.get_text(strip=True)) > 20:
                break
            container = None
        text = container.get_text("\n", strip=True) if container else None
        m = DATE_RE.search(soup.get_text(" ", strip=True))
        posted = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None
        return {
            "content_text": text,
            "content_html": str(container) if container else None,
            "posted_at": posted,
        }

    def iter_posts(self, pages: int | None, known_ids: set[str]) -> Iterator[RawPost]:
        page_range = itertools.count(1) if pages is None else range(1, pages + 1)
        prev_ids: set | None = None
        for page in page_range:
            items = self._list_items(page)
            page_ids = {i["post_id"] for i in items}
            if not items:
                logger.info("[%s] %d페이지에 게시물이 없어 중단", self.source_name, page)
                break
            if page_ids == prev_ids:
                # 범위를 벗어나면 마지막 페이지를 반복하는 게시판 대비
                logger.info("[%s] %d페이지가 이전과 동일해 중단", self.source_name, page)
                break
            prev_ids = page_ids
            for item in items:
                if item["post_id"] in known_ids:
                    continue
                try:
                    detail = self._fetch_detail(item["url"])
                except Exception as e:
                    logger.warning("[%s] 상세 수집 실패 %s: %s", self.source_name, item["url"], e)
                    continue
                yield RawPost(
                    source=self.source_name,
                    post_id=item["post_id"],
                    url=item["url"],
                    title=item["title"],
                    extra={"board": self.site.label, "organization": self.site.org_name},
                    **detail,
                )
