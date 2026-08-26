"""Gemini API 공통 클라이언트 — 정제(refiner)와 보강(enrich)이 함께 쓴다.

무료 티어 대응:
- 호출 사이에 REFINE_DELAY(기본 6초) 대기 (분당 요청 제한)
- 429는 REFINE_RETRY_DELAY(기본 40초) 대기 후 1회 재시도
"""

import logging
import os
import time

from google import genai
from google.genai import errors, types

logger = logging.getLogger(__name__)

# 무료 티어 flash 등급 모델 (환경변수 REFINE_MODEL로 교체 가능)
MODEL = os.getenv("REFINE_MODEL", "gemini-3.5-flash")

REQUEST_DELAY = float(os.getenv("REFINE_DELAY", "6.0"))
RATE_LIMIT_RETRY_DELAY = float(os.getenv("REFINE_RETRY_DELAY", "40.0"))


class GeminiClient:
    """호출 간 대기 + 429 재시도를 얹은 structured-output 클라이언트."""

    def __init__(self, model: str = MODEL):
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY 환경변수가 없습니다. ai/.env에 추가한 뒤 다시 실행하세요."
            )
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self._first_call = True

    def generate(self, system_instruction: str, contents: str, schema):
        if not self._first_call:
            time.sleep(REQUEST_DELAY)
        self._first_call = False

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
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

    def parse(self, response, schema_model):
        """response.parsed가 비면 텍스트로 재파싱."""
        return response.parsed or schema_model.model_validate_json(response.text)
