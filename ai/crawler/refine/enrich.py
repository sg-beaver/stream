"""정제 데이터 보강(enrichment) 패스 — Gemini 기반.

1. 조직명 매핑 (`--orgs`): refined 데이터의 organization 표기(고유값)를
   공식 조직도(sogang_org_chart.json)의 가장 가까운 단위로 매핑해
   `data/refined/org_map.json`에 캐시한다. 분석 코드는 이 파일을 읽는다.
   {"raw 표기": "조직도 단위명" 또는 null(조직도에 없는 조직)}

2. 직무 추출 (`--roles`): 교내 근로로 판별된 공고의 제목에서 모집 직무를
   짧은 명사구로 추출해 `data/refined/roles.jsonl`에 쌓는다.
   (RefinedPosting 스키마에 role 필드가 추가되어 새로 정제되는 공고에는
   포함되지만, 그 이전에 정제된 공고를 위한 백필 용도)

두 작업 모두 멱등: 이미 매핑/추출된 항목은 건너뛴다.

사용: python -m crawler enrich            # 둘 다
      python -m crawler enrich --orgs
      python -m crawler enrich --roles
"""

import json
import logging
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from crawler.config import ORG_CHART_PATH, REFINED_DIR
from crawler.refine.gemini import GeminiClient

logger = logging.getLogger(__name__)

ORG_MAP_PATH = REFINED_DIR / "org_map.json"
ROLES_PATH = REFINED_DIR / "roles.jsonl"

ORG_BATCH = 40
ROLE_BATCH = 30


# ---------- 응답 스키마 ----------

class OrgMapItem(BaseModel):
    raw: str = Field(description="입력된 원본 조직명 그대로")
    unit: Optional[str] = Field(
        description="조직도 단위 목록에서 고른 가장 가까운 단위명 (정확히 일치하는 표기). "
        "행정팀/사무실 등 하위 조직은 상위 단위로 귀속한다 "
        "(예: '법학전문대학원 행정팀' → '법학전문대학원'). "
        "조직도에 대응 단위가 없으면(외부 기관, 연구소, 학생회 등) null."
    )


class OrgMapBatch(BaseModel):
    items: list[OrgMapItem]


class RoleItem(BaseModel):
    idx: int = Field(description="입력에 표기된 공고 번호 ([N]의 N)")
    role: Optional[str] = Field(
        description="모집 직무를 짧은 명사구로 (예: '논술 조교', '실험 조교', 'SNS 운영', "
        "'사무보조', '영어 튜터'). 부서·기관명은 포함하지 않는다. 불분명하면 null."
    )


class RoleBatch(BaseModel):
    items: list[RoleItem]


# ---------- 공통 ----------

def _iter_refined():
    for fp in sorted(REFINED_DIR.glob("*.jsonl")):
        if fp.name == ROLES_PATH.name:
            continue
        for line in fp.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                yield json.loads(line)


def _chart_units() -> list[str]:
    chart = json.loads(Path(ORG_CHART_PATH).read_text(encoding="utf-8"))
    lines, seen = [], set()

    def walk(node, section):
        name = node["name"]
        if name not in seen:
            seen.add(name)
            lines.append(f"{section} > {name}")
        for c in node.get("children", []):
            walk(c, section)

    for top in chart["organization"]:
        for c in top.get("children", []):
            walk(c, top["name"])
    return lines


# ---------- 1) 조직명 → 조직도 매핑 ----------

ORG_SYSTEM = """\
당신은 서강대학교 조직 데이터 정제 담당자입니다.
교내 근로 공고에서 추출된 조직명 표기를, 주어진 공식 조직도 단위 목록에서
가장 가까운 단위로 매핑합니다.

규칙:
- unit은 반드시 목록에 있는 단위명을 '부문 > 이름'에서 이름 부분만 정확히 그대로 씁니다.
- 표기 변형(공백, 접미어, 개편 전 명칭)은 같은 단위로 매핑합니다.
  예: '곤자가 국제학사 사감실' → '기숙사' 아래 해당 단위, '언론대학원' → '미디어커뮤니케이션대학원',
  '국어국문학과' → '국어국문학', '입학팀' → '입학처' 산하가 아니라 목록에 있는 표기를 따름.
- 하위 조직(행정팀, 사무실, 조교실, 사감실, 센터 산하 실)은 목록에 그 하위 조직이
  없으면 상위 단위로 귀속합니다.
- 두 조직이 병기된 경우(예: 'A/B') 첫 번째 조직 기준으로 매핑합니다.
- 조직도에 대응 단위가 없는 조직(외부 기관, 총학생회, 개별 연구실, 연계전공 등
  목록에 없는 것)은 unit을 null로 둡니다. 억지로 매핑하지 않습니다.
- 모든 입력 조직명에 대해 하나씩 결과를 반환합니다 (raw는 입력 그대로)."""


def run_org_mapping() -> int:
    org_map: dict = {}
    if ORG_MAP_PATH.exists():
        org_map = json.loads(ORG_MAP_PATH.read_text(encoding="utf-8"))

    names = set()
    for rec in _iter_refined():
        r = rec.get("refined") or {}
        if not r.get("is_campus_job"):
            continue
        o = (r.get("organization") or "").strip()
        if o:
            names.add(o)
    pending = sorted(n for n in names if n not in org_map)
    if not pending:
        logger.info("[enrich:orgs] 새로 매핑할 조직명이 없습니다 (%d개 캐시됨)", len(org_map))
        return 0

    units = _chart_units()
    unit_names = {u.split(" > ", 1)[1] for u in units}
    unit_block = "\n".join(units)
    client = GeminiClient()

    done = 0
    for start in range(0, len(pending), ORG_BATCH):
        batch = pending[start : start + ORG_BATCH]
        contents = (
            f"## 공식 조직도 단위 목록 ({len(units)}개)\n{unit_block}\n\n"
            f"## 매핑할 조직명 {len(batch)}개\n" + "\n".join(f"- {n}" for n in batch)
        )
        try:
            resp = client.generate(ORG_SYSTEM, contents, OrgMapBatch)
            parsed = client.parse(resp, OrgMapBatch)
        except Exception as e:
            logger.error("[enrich:orgs] 배치 실패 (%d~): %s", start, e)
            continue
        got = {i.raw: i.unit for i in parsed.items}
        for name in batch:
            unit = got.get(name)
            if unit is not None and unit not in unit_names:
                logger.warning("[enrich:orgs] 목록에 없는 단위 응답 무시: %r → %r", name, unit)
                unit = None
            org_map[name] = unit
            done += 1
        ORG_MAP_PATH.write_text(
            json.dumps(org_map, ensure_ascii=False, indent=1, sort_keys=True),
            encoding="utf-8",
        )
        logger.info("[enrich:orgs] %d/%d 매핑", min(start + ORG_BATCH, len(pending)), len(pending))

    mapped = sum(1 for v in org_map.values() if v)
    logger.info(
        "[enrich:orgs] 완료 — 총 %d개 중 조직도 매핑 %d개, 조직도 외 %d개 → %s",
        len(org_map), mapped, len(org_map) - mapped, ORG_MAP_PATH,
    )
    return done


# ---------- 2) 제목 → 직무(role) 백필 ----------

ROLE_SYSTEM = """\
당신은 서강대학교 교내 근로 공고 데이터 정제 담당자입니다.
공고 제목(과 부서명)에서 모집하는 직무를 짧은 명사구로 추출합니다.

규칙:
- 직무만 추출하고 부서·기관명, 모집 시기, 인원은 제외합니다.
  예: '[입학처] 2026 논술 전형 조교 모집' → '논술 조교'
      '교육혁신팀 SNS 근로 조교 모집' → 'SNS 운영 조교'
      '도서관 근로장학생 모집 (대출실)' → '대출실 근로장학생'
- 원문에 드러난 수준까지만 구체화하고 추측하지 않습니다.
  제목이 '근로장학생 모집'뿐이면 '근로장학생'으로 둡니다.
- 직무를 알 수 없으면 null.
- 모든 입력 공고에 대해 번호(idx)를 정확히 붙여 하나씩 반환합니다."""


def run_role_extraction() -> int:
    done_keys = set()
    if ROLES_PATH.exists():
        for line in ROLES_PATH.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                done_keys.add((r["source"], str(r["post_id"])))

    pending = []
    for rec in _iter_refined():
        r = rec.get("refined") or {}
        if not r.get("is_campus_job"):
            continue
        key = (rec["source"], str(rec["post_id"]))
        if key in done_keys:
            continue
        # 이미 role이 정제 단계에서 채워진 레코드는 그대로 복사
        if r.get("role"):
            with ROLES_PATH.open("a", encoding="utf-8") as f:
                f.write(json.dumps(
                    {"source": key[0], "post_id": key[1], "role": r["role"]},
                    ensure_ascii=False) + "\n")
            done_keys.add(key)
            continue
        pending.append((key, r.get("title") or "", r.get("organization") or ""))

    if not pending:
        logger.info("[enrich:roles] 새로 추출할 공고가 없습니다 (%d건 캐시됨)", len(done_keys))
        return 0

    client = GeminiClient()
    done = 0
    for start in range(0, len(pending), ROLE_BATCH):
        batch = pending[start : start + ROLE_BATCH]
        lines = [f"[{i + 1}] {title}" + (f" (부서: {org})" if org else "")
                 for i, (_, title, org) in enumerate(batch)]
        try:
            resp = client.generate(ROLE_SYSTEM, "\n".join(lines), RoleBatch)
            parsed = client.parse(resp, RoleBatch)
        except Exception as e:
            logger.error("[enrich:roles] 배치 실패 (%d~): %s", start, e)
            continue
        got = {i.idx: i.role for i in parsed.items}
        with ROLES_PATH.open("a", encoding="utf-8") as f:
            for i, (key, _, _) in enumerate(batch):
                f.write(json.dumps(
                    {"source": key[0], "post_id": key[1], "role": got.get(i + 1)},
                    ensure_ascii=False) + "\n")
                done += 1
        logger.info("[enrich:roles] %d/%d 추출", min(start + ROLE_BATCH, len(pending)), len(pending))

    logger.info("[enrich:roles] 완료 — %d건 → %s", done, ROLES_PATH)
    return done
