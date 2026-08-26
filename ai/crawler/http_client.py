"""요청 세션 유틸 — 재시도, 딜레이, 쿠키 주입."""

import logging
import os
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from crawler.config import REQUEST_DELAY, USER_AGENT

logger = logging.getLogger(__name__)


class CrawlAuthError(RuntimeError):
    """로그인 세션이 필요한 페이지에 인증 없이 접근한 경우."""


def make_session(cookie_env: str | None = None) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        }
    )
    retry = Retry(
        total=3,
        backoff_factor=1.0,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    if cookie_env:
        cookie = os.getenv(cookie_env, "").strip()
        if cookie:
            session.headers["Cookie"] = cookie
    return session


def polite_get(session: requests.Session, url: str, **kwargs) -> requests.Response:
    """딜레이를 두고 GET. 인코딩은 응답 본문 기준으로 보정."""
    time.sleep(REQUEST_DELAY)
    resp = session.get(url, timeout=20, **kwargs)
    resp.raise_for_status()
    if resp.encoding in (None, "ISO-8859-1"):
        resp.encoding = resp.apparent_encoding
    return resp
