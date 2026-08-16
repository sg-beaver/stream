"""크롤러 전역 설정.

부서명 키워드와 학과·기관 게시판 목록(DEPT_SITES)은 조직도 문서
(resources/sogang_org_chart.json)에서 읽는다. 크롤링 대상 게시판을
추가하려면 조직도 JSON의 해당 조직 노드에 "board" 설정을 넣으면 된다.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator
from urllib.parse import urlparse

try:
    from dotenv import load_dotenv

    # ai/.env 우선, 없으면 레포 루트 .env도 읽는다
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass

# ai/data/{raw,refined}
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
RAW_DIR = DATA_DIR / "raw"
REFINED_DIR = DATA_DIR / "refined"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# 요청 간 대기 시간(초) — 상대 서버 부하 방지
REQUEST_DELAY = float(os.getenv("CRAWLER_DELAY", "1.0"))

# 교내 근로 관련 게시물 판별 키워드 (서담·학과 게시판 제목 필터링용)
# — 직무 성격 키워드
JOB_KEYWORDS = [
    "TA",
    "조교",
    "근로",
    "장학",
    "장학생",
    "근로장학",
    "근로학생",
    "장학생",
    "곤자가",
    "벨라르미노",
]

# — 서강대 조직 부서명 키워드: 조직도 문서(resources/sogang_org_chart.json)에서 추출.
#   제목에 부서명이 말머리로 붙는 교내 공고를 놓치지 않기 위한 키워드.
#   조직 개편 시 JSON 문서만 수정하면 된다.
ORG_CHART_PATH = Path(__file__).resolve().parent / "resources" / "sogang_org_chart.json"

# 이 접미사로 끝나는 조직 단위 이름만 키워드로 쓴다.
# (예: 교육혁신팀, 종합봉사실, 교수학습센터, 입학처)
ORG_UNIT_SUFFIXES = ("팀", "실", "센터", "처", "원", "과", "단")


_ORG_CHART = json.loads(ORG_CHART_PATH.read_text(encoding="utf-8"))


def _walk_org_nodes(node) -> Iterator[dict]:
    """조직도 트리의 모든 노드({name, homepage?, board?, children?})를 순회."""
    if isinstance(node, list):
        for item in node:
            yield from _walk_org_nodes(item)
    elif isinstance(node, dict):
        yield node
        yield from _walk_org_nodes(node.get("children", []))


def _load_org_unit_keywords() -> list[str]:
    keywords: set[str] = set()
    # 최상위 노드는 분류용 그룹 라벨(행정부서, 대학원 등)이라 키워드에서 제외하고
    # 그 하위의 실제 조직 단위만 순회한다.
    for group in _ORG_CHART["organization"]:
        for node in _walk_org_nodes(group.get("children", [])):
            name = node.get("name", "")
            if not name.endswith(ORG_UNIT_SUFFIXES):
                continue
            keywords.add(name)
            # "전인교육원 행정팀" → "행정팀"처럼 마지막 어절도 추가해
            # 각 대학 행정팀(경영대학행정팀 등)을 부분일치로 포괄한다.
            last = name.split()[-1]
            if last != name and last.endswith(ORG_UNIT_SUFFIXES):
                keywords.add(last)
    return sorted(keywords)


ORG_UNIT_KEYWORDS = _load_org_unit_keywords()

CAMPUS_JOB_KEYWORDS = JOB_KEYWORDS + ORG_UNIT_KEYWORDS


@dataclass
class SogangCMSSite:
    """Sogang CMS(boardlist.do / cmsboardlist.do) 기반 게시판 하나에 대한 설정."""

    name: str  # 저장 파일명에 쓰이는 소스 식별자
    label: str  # 사람이 읽는 이름
    base_url: str
    list_endpoint: str  # "/front/boardlist.do" 또는 "/front/cmsboardlist.do"
    view_endpoint: str  # "/front/boardview.do" 또는 "/front/cmsboardview.do"
    params: dict = field(default_factory=dict)  # bbsConfigFK, siteId 등
    keywords: list | None = None  # None이면 전체 수집, 리스트면 제목 키워드 필터
    cookie_env: str | None = None  # 로그인 필요 시 쿠키를 담은 환경변수 이름


# 청년광장 > 함께하는 서강인 > 교내조교모집
# (게시판 전체가 교내 조교/근로 공고이므로 키워드 필터 없음)
SCC_SITE = SogangCMSSite(
    name="scc",
    label="청년광장 교내조교모집",
    base_url="https://scc.sogang.ac.kr",
    list_endpoint="/front/boardlist.do",
    view_endpoint="/front/boardview.do",
    params={"bbsConfigFK": "27"},
    keywords=None,
    cookie_env="SCC_COOKIE",
)

# 서강대 조직(학과·기관) 홈페이지 공지 게시판 — 조직도 JSON의 "board" 노드에서 생성.
# 대상을 추가하려면 조직도 JSON의 해당 조직 노드에 아래 형태의 board를 넣는다.
#   "board": {"label": "...", "site_id": "...", "bbs_config_fk": "..."}
def _board_sites_from_org_chart() -> list[SogangCMSSite]:
    sites = []
    seen_boards: set[tuple[str, str]] = set()
    for node in _walk_org_nodes(_ORG_CHART["organization"]):
        board = node.get("board")
        if not board:
            continue
        base_url = board.get("base_url")
        if not base_url and node.get("homepage"):
            parsed = urlparse(node["homepage"])
            base_url = f"{parsed.scheme}://{parsed.netloc}"
        if not base_url:
            raise ValueError(
                f"조직도 board 설정에 base_url도 homepage도 없습니다: {node.get('name')}"
            )
        # 같은 게시판(호스트+bbsConfigFK)이 여러 조직 노드에 걸려 있으면 한 번만 크롤링
        board_key = (urlparse(base_url).netloc, str(board["bbs_config_fk"]))
        if board_key in seen_boards:
            continue
        seen_boards.add(board_key)

        params = {
            "bbsConfigFK": board["bbs_config_fk"],
            "searchField": "ALL",
            "searchValue": "",
            "searchLowItem": "ALL",
        }
        if board.get("site_id"):
            params["siteId"] = board["site_id"]

        # 소스 이름: source > site_id > 호스트 서브도메인 순으로 결정
        site_id = board.get("site_id") or urlparse(base_url).netloc.split(".")[0]
        name = board.get("source", f"dept_{site_id}")
        if any(s.name == name for s in sites):
            name = f"{name}_{board['bbs_config_fk']}"

        # 자기 게시판 글 제목에는 자기 조직명이 흔히 들어가므로(예: 교육대학원
        # 게시판의 "교육대학원 학사 안내") 자기 조직명 키워드는 매칭에서 제외한다.
        # 실제 근로 공고는 직무 키워드(조교, 근로 등)로 여전히 잡힌다.
        site_keywords = [k for k in CAMPUS_JOB_KEYWORDS if k not in node["name"]]

        board_name = board.get("board_name", "게시판")
        sites.append(
            SogangCMSSite(
                name=name,
                label=board.get("label", f"{node['name']} {board_name}"),
                base_url=base_url,
                list_endpoint=board.get("list_endpoint", "/front/cmsboardlist.do"),
                view_endpoint=board.get("view_endpoint", "/front/cmsboardview.do"),
                params=params,
                keywords=site_keywords,
            )
        )
    return sites


DEPT_SITES: list[SogangCMSSite] = _board_sites_from_org_chart()

# 서담 (로그인 세션 쿠키 필요)
SSODAM_BASE_URL = "https://www.ssodam.com"
SSODAM_BOARD_NO = 10  # 커리어 > 모집공고
SSODAM_COOKIE_ENV = "SSODAM_COOKIE"
