"""Gemini API 기반 정제 에이전트.

raw JSONL의 게시물을 RefinedPosting 스키마로 정형화해 refined JSONL에 쌓는다.
GEMINI_API_KEY 환경변수(ai/.env)가 필요하다.

효율화 포인트:
- 무료 티어의 병목은 일일 요청 수(RPD)이므로 게시물 여러 건(REFINE_BATCH, 기본 8건)을
  한 번의 API 호출로 묶어 정제한다.
- 본문 공백/개행을 정규화해 입력 토큰을 줄인다.
- 429(사용량 초과)는 한 번 대기 후 재시도하고, 계속 실패하면 중단한다.
- 배치 응답에서 누락된 게시물은 단건 정제로 재시도(fallback)한다.
"""

import logging
import os
import re
import time

from google import genai
from google.genai import errors, types
from tqdm import tqdm
from tqdm.contrib.logging import logging_redirect_tqdm

from crawler.models import RawPost
from crawler.refine.schema import RefinedBatch, RefinedPosting
from crawler.storage import JsonlStore, RawStore

logger = logging.getLogger(__name__)

# 무료 티어 flash 등급 모델. 신규 발급 키에서는 gemini-2.5-flash가 막혀 있어
# 현행 flash 모델을 사용한다. (환경변수 REFINE_MODEL로 교체 가능)
MODEL = os.getenv("REFINE_MODEL", "gemini-3.5-flash")

MAX_CONTENT_CHARS = 6000
BATCH_SIZE = max(1, int(os.getenv("REFINE_BATCH", "8")))

# 무료 티어 RPM 제한(분당 10회 수준)을 넘지 않도록 호출 간 대기
REQUEST_DELAY = float(os.getenv("REFINE_DELAY", "6.0"))
# 429 발생 시 대기 후 1회 재시도
RATE_LIMIT_RETRY_DELAY = float(os.getenv("REFINE_RETRY_DELAY", "40.0"))

SYSTEM_PROMPT = """\
당신은 서강대학교 교내 근로 공고 데이터 정제 담당자입니다.
대학 커뮤니티/학과 게시판에서 수집한 게시물 원문을 받아, 교내 근로
(조교, 근로장학생, 행정보조, 연구보조, 튜터, 단기 행사보조 등) 공고인지 판별하고
구조화된 형식으로 추출합니다.

규칙:
- 원문에 명시된 정보만 추출하고, 없는 값은 null로 둡니다. 추측하지 않습니다.
- 필수 자격 요건(qualification)과 우대사항(preferred_qualification)을 구분합니다.
  '우대', '가점', '환영' 등으로 표현된 조건은 우대사항으로 분류합니다.
- 날짜는 YYYY-MM-DD로 정규화합니다. 연도가 없으면 게시일 연도를 따릅니다.
- 시급/주당 근무시간이 명시돼 있으면 hourly_wage_krw, weekly_hours에 숫자로도 넣습니다.
- 교외 아르바이트, 실험/설문 참여자 모집, 동아리/학회 모집, 기업 채용 등 교내 근로 모집과 관련 없는 경우에는
  is_campus_job=false, category='해당없음'으로 분류합니다.
- 여러 게시물이 주어지면 각 게시물을 독립적으로 정제하고, 모든 게시물에 대해
  입력된 [게시물 N] 번호를 post_index로 정확히 붙여 반환합니다."""

_WS_RE = re.compile(r"[ \t ​]+")
_NL_RE = re.compile(r"\n{3,}")


def _clean_text(text: str) -> str:
    """공백·개행 정규화로 입력 토큰을 줄인다 (CMS 본문은 개행이 과도하게 많다)."""
    text = _WS_RE.sub(" ", text)
    lines = [line.strip() for line in text.split("\n")]
    return _NL_RE.sub("\n\n", "\n".join(lines)).strip()


def _post_block(post: RawPost, index: int) -> str:
    content = _clean_text(post.content_text or "")[:MAX_CONTENT_CHARS]
    return f"""[게시물 {index}]
출처: {post.source} ({post.extra.get('board', '')})
게시일: {post.posted_at or '알 수 없음'}
제목: {post.title}
본문:
{content or '(본문 없음 — 제목만으로 판단)'}"""


def build_batch_message(posts: list[RawPost]) -> str:
    blocks = "\n\n=====\n\n".join(_post_block(p, i + 1) for i, p in enumerate(posts))
    return f"다음 게시물 {len(posts)}건을 각각 정제하세요.\n\n{blocks}"


class Refiner:
    def __init__(self, model: str = MODEL):
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY 환경변수가 없습니다. ai/.env에 추가한 뒤 다시 실행하세요."
            )
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self._first_call = True

    # ---------- API 호출 ----------

    def _generate(self, contents: str, schema):
        """호출 간 대기 + 429 1회 재시도를 얹은 generate_content."""
        if not self._first_call:
            time.sleep(REQUEST_DELAY)
        self._first_call = False

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=schema,
        )
        try:
            return self.client.models.generate_content(
                model=self.model, contents=contents, config=config
            )
        except errors.APIError as e:
            if e.code != 429:
                raise
            logger.warning("429 사용량 제한 — %.0f초 대기 후 재시도", RATE_LIMIT_RETRY_DELAY)
            time.sleep(RATE_LIMIT_RETRY_DELAY)
            return self.client.models.generate_content(
                model=self.model, contents=contents, config=config
            )

    def refine_post(self, post: RawPost) -> RefinedPosting:
        """단건 정제 (배치 누락분 fallback용)."""
        response = self._generate(_post_block(post, 1), RefinedPosting)
        parsed = response.parsed
        if parsed is None:
            parsed = RefinedPosting.model_validate_json(response.text)
        return parsed

    def refine_batch(self, posts: list[RawPost]) -> dict[int, RefinedPosting]:
        """여러 게시물을 한 호출로 정제. {게시물 인덱스(0-base): 결과} 반환.

        응답에서 빠졌거나 번호가 어긋난 게시물은 단건 정제로 한 번 더 시도한다.
        """
        if len(posts) == 1:
            return {0: self.refine_post(posts[0])}

        results: dict[int, RefinedPosting] = {}
        try:
            response = self._generate(build_batch_message(posts), RefinedBatch)
            batch = response.parsed
            if batch is None:
                batch = RefinedBatch.model_validate_json(response.text)
            for item in batch.items:
                idx = item.post_index - 1
                if 0 <= idx < len(posts) and idx not in results:
                    results[idx] = item.posting
        except errors.APIError:
            raise
        except Exception as e:
            logger.warning("배치 응답 파싱 실패, 단건으로 전환: %s", e)

        missing = [i for i in range(len(posts)) if i not in results]
        if missing:
            logger.info("배치에서 %d건 누락 — 단건 정제로 재시도", len(missing))
        for i in missing:
            try:
                results[i] = self.refine_post(posts[i])
            except errors.APIError as e:
                logger.error("단건 정제 실패 (%s): %s", posts[i].post_id, e.message)
        return results

    # ---------- 파이프라인 ----------

    def run(
        self,
        raw_store: RawStore,
        refined_store: JsonlStore,
        source: str,
        limit: int | None = None,
        campus_only: bool = False,
    ) -> int:
        done_ids = refined_store.existing_ids(source, id_key="post_id")
        pending = [p for p in raw_store.iter_posts(source) if p.post_id not in done_ids]
        if limit is not None:
            pending = pending[:limit]
        if not pending:
            logger.info("[refine:%s] 정제할 신규 게시물이 없습니다", source)
            return 0

        n_batches = (len(pending) + BATCH_SIZE - 1) // BATCH_SIZE
        logger.info(
            "[refine:%s] %d건을 %d개 배치(배치당 %d건)로 정제 시작",
            source, len(pending), n_batches, BATCH_SIZE,
        )

        count = excluded = 0
        pbar = tqdm(total=len(pending), desc=f"refine:{source}", unit="건", dynamic_ncols=True)
        with logging_redirect_tqdm():
            for start in range(0, len(pending), BATCH_SIZE):
                batch_posts = pending[start : start + BATCH_SIZE]
                try:
                    results = self.refine_batch(batch_posts)
                except errors.APIError as e:
                    logger.error("[refine:%s] API 오류: %s", source, e.message)
                    if e.code == 429:
                        logger.error(
                            "[refine:%s] 사용량 초과가 계속됩니다 — 중단. 잠시 후 다시 실행하세요.", source
                        )
                        break
                    pbar.update(len(batch_posts))
                    continue

                for i, post in enumerate(batch_posts):
                    refined = results.get(i)
                    if refined is None:
                        continue
                    record = {
                        "source": post.source,
                        "post_id": post.post_id,
                        "url": post.url,
                        "crawled_at": post.crawled_at,
                        "refined": refined.model_dump(),
                    }
                    if campus_only and not refined.is_campus_job:
                        # 다음 실행에서 재정제(쿼터 낭비)하지 않도록 제외 표시로 기록한다.
                        # 소비 측에서는 excluded=true 레코드를 걸러 쓰면 된다.
                        record["excluded"] = True
                        refined_store.append(source, record)
                        excluded += 1
                        continue
                    refined_store.append(source, record)
                    count += 1
                    logger.info(
                        "[refine:%s] %s -> %s / %s",
                        source, post.title[:40], refined.category, refined.deadline or "-",
                    )
                pbar.update(len(batch_posts))
                pbar.set_postfix(저장=count, 제외=excluded)
        pbar.close()
        logger.info("[refine:%s] 신규 %d건 정제 완료 (제외 %d건)", source, count, excluded)
        return count
