"""Gemini API 기반 정제 에이전트.

raw JSONL의 게시물을 RefinedPosting 스키마로 정형화해 refined JSONL에 쌓는다.
GEMINI_API_KEY 환경변수(ai/.env)가 필요하다.
"""

import logging
import os
import time

from google import genai
from google.genai import errors, types

from crawler.models import RawPost
from crawler.refine.schema import RefinedPosting
from crawler.storage import JsonlStore, RawStore

logger = logging.getLogger(__name__)

# 무료 티어 flash 등급 모델. 신규 발급 키에서는 gemini-2.5-flash가 막혀 있어
# 현행 flash 모델을 사용한다. (환경변수 REFINE_MODEL로 교체 가능)
MODEL = os.getenv("REFINE_MODEL", "gemini-3.5-flash")
MAX_CONTENT_CHARS = 8000

# 무료 티어 RPM 제한(분당 10회 수준)을 넘지 않도록 호출 간 대기
REQUEST_DELAY = float(os.getenv("REFINE_DELAY", "6.0"))

SYSTEM_PROMPT = """\
당신은 서강대학교 교내 근로 공고 데이터 정제 담당자입니다.
대학 커뮤니티/학과 게시판에서 수집한 게시물 원문을 받아, 교내 근로
(조교, 근로장학생, 행정보조, 연구보조, 튜터 등) 공고인지 판별하고
구조화된 형식으로 추출합니다.

규칙:
- 원문에 명시된 정보만 추출하고, 없는 값은 null로 둡니다. 추측하지 않습니다.
- 날짜는 YYYY-MM-DD로 정규화합니다. 연도가 없으면 게시일 연도를 따릅니다.
- 교외 아르바이트, 실험/설문 참여자 모집, 동아리/학회 모집, 기업 채용은
  is_campus_job=false, category='해당없음'으로 분류합니다."""


def build_user_message(post: RawPost) -> str:
    content = (post.content_text or "")[:MAX_CONTENT_CHARS]
    return f"""다음 게시물을 정제하세요.

[출처] {post.source} ({post.extra.get('board', '')})
[게시일] {post.posted_at or '알 수 없음'}
[제목] {post.title}

[본문]
{content or '(본문 없음 — 제목만으로 판단)'}"""


class Refiner:
    def __init__(self, model: str = MODEL):
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY 환경변수가 없습니다. ai/.env에 추가한 뒤 다시 실행하세요."
            )
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def refine_post(self, post: RawPost) -> RefinedPosting:
        response = self.client.models.generate_content(
            model=self.model,
            contents=build_user_message(post),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=RefinedPosting,
            ),
        )
        parsed = response.parsed
        if parsed is None:
            # 스키마 파싱 실패 시 원문 텍스트로 재검증
            parsed = RefinedPosting.model_validate_json(response.text)
        return parsed

    def run(
        self,
        raw_store: RawStore,
        refined_store: JsonlStore,
        source: str,
        limit: int | None = None,
        campus_only: bool = False,
    ) -> int:
        done_ids = refined_store.existing_ids(source, id_key="post_id")
        count = 0
        for post in raw_store.iter_posts(source):
            if post.post_id in done_ids:
                continue
            if limit is not None and count >= limit:
                break
            if count > 0:
                time.sleep(REQUEST_DELAY)
            try:
                refined = self.refine_post(post)
            except errors.APIError as e:
                logger.error("[refine:%s] API 오류 (%s): %s", source, post.post_id, e.message)
                if e.code == 429:
                    logger.error("[refine:%s] 무료 티어 사용량 초과 — 잠시 후 다시 실행하세요.", source)
                    break
                continue
            except Exception as e:
                logger.error("[refine:%s] 정제 실패 (%s): %s", source, post.post_id, e)
                continue
            record = {
                "source": post.source,
                "post_id": post.post_id,
                "url": post.url,
                "crawled_at": post.crawled_at,
                "refined": refined.model_dump(),
            }
            if campus_only and not refined.is_campus_job:
                logger.info("[refine:%s] 교내 근로 아님, 제외: %s", source, post.title)
                done_ids.add(post.post_id)
                continue
            refined_store.append(source, record)
            done_ids.add(post.post_id)
            count += 1
            logger.info(
                "[refine:%s] %s -> %s / %s",
                source,
                post.title[:40],
                refined.category,
                refined.deadline or "-",
            )
        logger.info("[refine:%s] 신규 %d건 정제 완료", source, count)
        return count
