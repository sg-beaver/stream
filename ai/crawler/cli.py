"""크롤링·정제 파이프라인 CLI.

사용 예 (ai/ 디렉토리에서):
    python -m crawler crawl scc --pages 5
    python -m crawler crawl ssodam --pages 3
    python -m crawler crawl dept --site dept_math --pages 3
    python -m crawler crawl all
    python -m crawler refine --source scc --limit 20
    python -m crawler refine --all
"""

import argparse
import logging
import sys

from crawler.config import DEPT_SITES, RAW_DIR, REFINED_DIR, SCC_SITE
from crawler.http_client import CrawlAuthError
from crawler.storage import JsonlStore, RawStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def build_crawlers(target: str, site: str | None):
    from crawler.sources.dept_html import HTML_SITES, DeptHtmlCrawler
    from crawler.sources.sogang_cms import SogangCMSCrawler
    from crawler.sources.ssodam import SsodamCrawler

    crawlers = []
    if target in ("scc", "all"):
        crawlers.append(SogangCMSCrawler(SCC_SITE))
    if target in ("ssodam", "all"):
        crawlers.append(SsodamCrawler())
    if target in ("dept", "all"):
        cms = DEPT_SITES if site is None else [s for s in DEPT_SITES if s.name == site]
        html = HTML_SITES if site is None else [s for s in HTML_SITES if s.name == site]
        if site is not None and not cms and not html:
            names = ", ".join([s.name for s in DEPT_SITES] + [s.name for s in HTML_SITES])
            sys.exit(f"알 수 없는 site '{site}'. 사용 가능: {names}")
        crawlers.extend(SogangCMSCrawler(s) for s in cms)
        crawlers.extend(DeptHtmlCrawler(s) for s in html)
    return crawlers


def cmd_crawl(args) -> None:
    store = RawStore(RAW_DIR)
    pages = None if args.pages == 0 else args.pages
    total = 0
    for crawler in build_crawlers(args.target, args.site):
        try:
            total += crawler.run(store, pages=pages)
        except CrawlAuthError as e:
            logger.error("%s", e)
        except Exception:
            logger.exception("[%s] 크롤링 중 오류", crawler.source_name)
    logger.info("전체 신규 수집 %d건 (저장 위치: %s)", total, RAW_DIR)


def cmd_refetch(args) -> None:
    from crawler.sources.ssodam import SsodamCrawler

    store = RawStore(RAW_DIR)
    try:
        SsodamCrawler().refetch_details(store, only_broken=not args.all)
    except CrawlAuthError as e:
        logger.error("%s", e)
        sys.exit(1)


def cmd_discover(args) -> None:
    from crawler.discover import run_discovery

    run_discovery(overwrite=args.overwrite)


def cmd_refine(args) -> None:
    from crawler.refine.refiner import Refiner

    raw_store = RawStore(RAW_DIR)
    refined_store = JsonlStore(REFINED_DIR)

    if args.all:
        sources = sorted(p.stem for p in RAW_DIR.glob("*.jsonl"))
    elif args.source:
        sources = [args.source]
    else:
        sys.exit("--source <이름> 또는 --all 을 지정하세요.")

    refiner = Refiner()
    total = 0
    for source in sources:
        try:
            total += refiner.run(
                raw_store,
                refined_store,
                source=source,
                limit=args.limit,
                campus_only=args.campus_only,
            )
        except RuntimeError as e:
            sys.exit(str(e))
    logger.info("전체 신규 정제 %d건 (저장 위치: %s)", total, REFINED_DIR)


def cmd_enrich(args) -> None:
    from crawler.refine import enrich

    run_orgs = args.orgs or not (args.orgs or args.roles)
    run_roles = args.roles or not (args.orgs or args.roles)
    try:
        if run_orgs:
            enrich.run_org_mapping()
        if run_roles:
            enrich.run_role_extraction()
    except RuntimeError as e:
        sys.exit(str(e))


def main() -> None:
    parser = argparse.ArgumentParser(prog="crawler", description="교내 근로 공고 수집·정제 파이프라인")
    sub = parser.add_subparsers(dest="command", required=True)

    p_crawl = sub.add_parser("crawl", help="게시판 크롤링 (raw JSONL 저장)")
    p_crawl.add_argument("target", choices=["scc", "ssodam", "dept", "all"])
    p_crawl.add_argument(
        "--pages", type=int, default=3, help="목록 페이지 수 (기본 3, 0이면 전체 페이지)"
    )
    p_crawl.add_argument("--site", help="dept 대상 중 특정 사이트만 (예: dept_math)")
    p_crawl.set_defaults(func=cmd_crawl)

    p_refetch = sub.add_parser(
        "refetch", help="이미 수집한 게시물의 본문을 다시 가져와 raw를 갱신 (현재 ssodam만)"
    )
    p_refetch.add_argument("target", choices=["ssodam"])
    p_refetch.add_argument(
        "--all", action="store_true",
        help="본문이 정상인 게시물까지 전부 재수집 (기본: 본문이 비었거나 메뉴 텍스트인 것만)",
    )
    p_refetch.set_defaults(func=cmd_refetch)

    p_discover = sub.add_parser(
        "discover", help="조직도 홈페이지들에서 공지 게시판을 자동 탐색해 조직도 JSON에 반영"
    )
    p_discover.add_argument(
        "--overwrite", action="store_true", help="이미 board가 있는 노드도 다시 탐색"
    )
    p_discover.set_defaults(func=cmd_discover)

    p_refine = sub.add_parser("refine", help="raw 게시물을 Gemini API로 정형화")
    p_refine.add_argument("--source", help="정제할 소스 이름 (예: scc, ssodam, dept_math)")
    p_refine.add_argument("--all", action="store_true", help="raw에 있는 모든 소스 정제")
    p_refine.add_argument("--limit", type=int, help="이번 실행에서 정제할 최대 건수")
    p_refine.add_argument(
        "--campus-only",
        action="store_true",
        help="교내 근로로 판별된 공고만 refined에 저장",
    )
    p_refine.set_defaults(func=cmd_refine)

    p_enrich = sub.add_parser(
        "enrich", help="정제 데이터 보강: 조직명→조직도 매핑(org_map.json), 직무 추출(roles.jsonl)"
    )
    p_enrich.add_argument("--orgs", action="store_true", help="조직명 매핑만")
    p_enrich.add_argument("--roles", action="store_true", help="직무 추출만")
    p_enrich.set_defaults(func=cmd_enrich)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
