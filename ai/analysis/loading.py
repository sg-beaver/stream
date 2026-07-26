"""정제 데이터 로드 → 분석용 DataFrame."""

import json
from pathlib import Path

import pandas as pd

from analysis.orgs import org_type, resolve_org

AI_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = AI_DIR / "data"
ROLES_PATH = DATA_DIR / "refined" / "roles.jsonl"

CHANNEL_OF = {
    "scc": "청년광장",
    "ssodam": "서담",
}

_FIELDS = [
    "is_campus_job", "category", "title", "organization", "role", "description",
    "qualification", "work_location", "wage", "hourly_wage_krw", "work_hours",
    "weekly_hours", "work_period", "headcount", "posted_date", "deadline",
    "application_start", "apply_method", "documents_required",
    "selection_method", "contact",
]


def _load_roles() -> dict:
    """(source, post_id) → role. enrich 백필 결과가 없으면 빈 dict."""
    roles = {}
    if ROLES_PATH.exists():
        for line in ROLES_PATH.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                roles[(r["source"], str(r["post_id"]))] = r.get("role")
    return roles


def load_postings(campus_only: bool = True) -> pd.DataFrame:
    """refined JSONL 전체를 flat DataFrame으로.

    반환 컬럼: source, channel, post_id, url, org(정규화 조직명), org_type,
    role, year + RefinedPosting 필드들. campus_only=True면 교내 근로만.
    """
    rows = []
    for fp in sorted((DATA_DIR / "refined").glob("*.jsonl")):
        if fp.name in ("roles.jsonl",):
            continue
        for line in fp.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            r = rec.get("refined") or {}
            row = {k: r.get(k) for k in _FIELDS}
            row["source"] = rec["source"]
            row["channel"] = CHANNEL_OF.get(rec["source"], "학과·기관 홈페이지")
            row["post_id"] = str(rec.get("post_id"))
            row["url"] = rec.get("url")
            rows.append(row)
    df = pd.DataFrame(rows)
    df["is_campus_job"] = df["is_campus_job"].fillna(False).astype(bool)
    if campus_only:
        df = df[df["is_campus_job"]].copy()

    df["posted_date"] = pd.to_datetime(df["posted_date"], errors="coerce")
    df["deadline"] = pd.to_datetime(df["deadline"], errors="coerce")
    # 미래 게시일은 추출 오류(근무 시작일 등을 게시일로 오인) → 결측 처리
    future = df["posted_date"] > pd.Timestamp.now() + pd.Timedelta(days=1)
    df.loc[future, "posted_date"] = pd.NaT

    # 서담은 refined에 게시일이 거의 없으므로 raw의 posted_at(YYYY/MM/DD)으로 백필
    ssodam_raw = DATA_DIR / "raw" / "ssodam.jsonl"
    if ssodam_raw.exists():
        posted = {}
        for line in ssodam_raw.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                r = json.loads(line)
                posted[str(r["post_id"])] = r.get("posted_at")
        m = df["source"].eq("ssodam") & df["posted_date"].isna()
        df.loc[m, "posted_date"] = pd.to_datetime(
            df.loc[m, "post_id"].map(posted), format="%Y/%m/%d", errors="coerce"
        )
    df["year"] = df["posted_date"].dt.year

    # 조직명 정규화 (Gemini 매핑 우선, 규칙 폴백) + 직무 백필 병합
    df["org"] = df["organization"].map(resolve_org)
    df["org_type"] = df["org"].map(org_type)
    roles = _load_roles()
    backfill = df.apply(lambda r: roles.get((r["source"], r["post_id"])), axis=1)
    df["role"] = df["role"].fillna(backfill)
    return df
