"""조직도 JSON의 각 홈페이지에서 Sogang CMS 공지 게시판을 자동 탐색한다.

homepage가 있는 노드마다 홈페이지 HTML과 메뉴 스크립트(/{siteId}/menu/*.js)를 뒤져
(cms)boardlist.do 링크를 수집하고, '공지' 이름이 붙은 게시판을 골라
조직도 JSON의 해당 노드에 "board" 설정을 채운다.

사용: python -m crawler discover [--overwrite]
"""

import json
import logging
import re
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

from crawler.config import ORG_CHART_PATH
from crawler.http_client import make_session, polite_get

logger = logging.getLogger(__name__)

# URL 경계 문자 — 이 문자를 만나면 URL이 끝난 것으로 본다
_URL_STOP = set("\"'<>\\) \t\r\n")


def _find_urls_around(text: str, marker: str) -> list[str]:
    """marker가 포함된 URL 조각들을 선형 스캔으로 추출한다.

    (압축 JS 같은 긴 한 줄 텍스트에서 정규식 백트래킹이 폭주하는 것을 피하기 위해
    re 대신 str.find로 marker 위치를 찾고 경계 문자까지 앞뒤로 확장한다.)
    """
    urls, idx = [], 0
    while True:
        i = text.find(marker, idx)
        if i < 0:
            break
        start = i
        while start > 0 and text[start - 1] not in _URL_STOP:
            start -= 1
        end = i + len(marker)
        while end < len(text) and text[end] not in _URL_STOP:
            end += 1
        urls.append(text[start:end])
        idx = end
    return urls

# 게시판 이름 우선순위 — 앞에 있을수록 공지 게시판일 가능성이 높다
PREFERRED_BOARD_NAMES = ["공지사항", "학부공지", "일반공지", "공지", "알림", "게시판"]

# 이 단어가 들어간 게시판은 공지 게시판으로 선택하지 않는다 (후순위로 밀림)
NEGATIVE_BOARD_WORDS = ["대학원", "입시", "입학", "앨범", "갤러리", "사진", "자료실", "자유", "Q&A", "질문"]


def _fetch_text(session, url: str) -> str | None:
    try:
        resp = polite_get(session, url)
        return resp.text
    except Exception as e:
        logger.debug("가져오기 실패 %s: %s", url, e)
        return None


def _board_params(url: str) -> tuple[str | None, str | None]:
    qs = parse_qs(urlparse(url).query)
    fk = (qs.get("bbsConfigFK") or [None])[0]
    site_id = (qs.get("siteId") or [None])[0]
    return fk, site_id


def _boards_from_menu_js(js_text: str) -> dict[str, str]:
    """메뉴 JS의 url/urlname 배열을 짝지어 {게시판이름: URL} 반환."""
    arrays = {}
    for var in ("url", "urlname"):
        m = re.search(rf"\b{var}\s*=\s*\[(.*?)\]", js_text, re.S)
        if m:
            arrays[var] = re.findall(r'"([^"]*)"', m.group(1))
    urls, names = arrays.get("url", []), arrays.get("urlname", [])
    boards = {}
    if len(urls) == len(names) and urls:
        for u, n in zip(urls, names):
            if "boardlist.do" in u and n:
                boards.setdefault(n, u)
    return boards


def discover_board(session, homepage: str) -> dict | None:
    """홈페이지에서 (공지) 게시판 설정을 찾는다. 실패 시 None."""
    parsed = urlparse(homepage)
    base = f"{parsed.scheme}://{parsed.netloc}"

    named: dict[str, str] = {}  # 이름 -> URL
    anonymous: list[str] = []

    html = _fetch_text(session, homepage)
    pages = [(homepage, html)] if html else []

    # index.html이 안내 페이지(앵커/JS/meta 리다이렉트)만 있는 경우 따라간다 (최대 3단계)
    cur_url, cur_html, visited = homepage, html, {homepage}
    for _ in range(3):
        if not cur_html or len(cur_html) >= 3000:
            break
        m = (
            re.search(r'href="([^"]+index[^"]*\.html)"', cur_html)
            or re.search(r"location(?:\.href)?\s*=\s*['\"]([^'\"]+)['\"]", cur_html)
            or re.search(r'content=["\']\d+;\s*url=([^"\']+)["\']', cur_html, re.I)
        )
        if not m:
            break
        nxt = urljoin(cur_url, m.group(1))
        if nxt in visited:
            break
        visited.add(nxt)
        nxt_html = _fetch_text(session, nxt)
        if not nxt_html:
            break
        pages.append((nxt, nxt_html))
        cur_url, cur_html = nxt, nxt_html

    for page_url, text in pages:
        # 앵커 텍스트와 함께 boardlist 링크 수집
        soup = BeautifulSoup(text, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "boardlist.do" not in href:
                continue
            full = urljoin(page_url, href)
            inner = a.get_text(" ", strip=True)
            if inner:
                named.setdefault(inner, full)
            else:
                anonymous.append(full)
        # 앵커 밖(스크립트 등)의 boardlist URL
        anonymous.extend(
            urljoin(page_url, u) for u in _find_urls_around(text, "boardlist.do")
        )
        # 메뉴 JS 탐색
        js_paths = {
            u for u in _find_urls_around(text, "/menu/") if ".js" in u
        }
        for js_path in js_paths:
            js_text = _fetch_text(session, urljoin(page_url, js_path))
            if js_text:
                for n, u in _boards_from_menu_js(js_text).items():
                    named.setdefault(n, urljoin(base, u))

    def to_board(url: str, label_hint: str | None):
        fk, site_id = _board_params(url)
        if not fk:
            return None
        board = {"bbs_config_fk": fk, "base_url": base}
        if site_id:
            board["site_id"] = site_id
        if label_hint:
            board["board_name"] = label_hint
        if "/front/boardlist.do" in url:
            board["list_endpoint"] = "/front/boardlist.do"
            board["view_endpoint"] = "/front/boardview.do"
        return board

    def is_negative(name: str) -> bool:
        return any(w.lower() in name.lower() for w in NEGATIVE_BOARD_WORDS)

    # 1) 이름 우선순위로 선택 — 부정 단어(대학원, 앨범 등)가 없는 게시판 먼저
    for allow_negative in (False, True):
        for pref in PREFERRED_BOARD_NAMES:
            for name, url in named.items():
                if pref not in name:
                    continue
                if is_negative(name) != allow_negative:
                    continue
                board = to_board(url, name)
                if board:
                    return board
    # 2) 이름 있는 게시판 아무거나 (부정 단어 없는 것 우선)
    for allow_negative in (False, True):
        for name, url in named.items():
            if is_negative(name) != allow_negative:
                continue
            board = to_board(url, name)
            if board:
                return board
    # 3) 익명 링크 중 첫 번째
    for url in anonymous:
        board = to_board(url, None)
        if board:
            return board
    return None


def run_discovery(overwrite: bool = False) -> None:
    doc = json.loads(ORG_CHART_PATH.read_text(encoding="utf-8"))
    session = make_session()

    def walk(node):
        if isinstance(node, list):
            for item in node:
                yield from walk(item)
        elif isinstance(node, dict):
            yield node
            yield from walk(node.get("children", []))

    seen_boards: set[tuple] = set()
    found = skipped = failed = 0
    for node in walk(doc["organization"]):
        homepage = node.get("homepage")
        if not homepage:
            continue
        if node.get("board") and not overwrite:
            fk = node["board"].get("bbs_config_fk")
            seen_boards.add((urlparse(node["board"].get("base_url", "")).netloc, fk))
            continue
        if "sogang.ac.kr" not in urlparse(homepage).netloc:
            logger.info("건너뜀(외부 사이트): %s (%s)", node["name"], homepage)
            skipped += 1
            continue
        board = discover_board(session, homepage)
        if board is None:
            logger.warning("게시판 못 찾음: %s (%s)", node["name"], homepage)
            failed += 1
            continue
        key = (urlparse(board["base_url"]).netloc, board["bbs_config_fk"])
        if key in seen_boards:
            logger.info(
                "건너뜀(다른 조직과 게시판 중복): %s -> %s/%s",
                node["name"], key[0], key[1],
            )
            skipped += 1
            continue
        seen_boards.add(key)
        node["board"] = board
        found += 1
        logger.info(
            "발견: %s -> %s bbsConfigFK=%s (%s)",
            node["name"], key[0], board["bbs_config_fk"], board.get("board_name", "?"),
        )
        # 중단돼도 진행분이 남도록 발견 즉시 저장
        ORG_CHART_PATH.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    ORG_CHART_PATH.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    logger.info("탐색 완료: 발견 %d, 건너뜀 %d, 실패 %d -> %s", found, skipped, failed, ORG_CHART_PATH)
