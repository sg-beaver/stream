"""분석 CSV 일괄 재생성: python -m analysis

data/refined/*.jsonl → data/analysis/*.csv
(선행: python -m crawler enrich  — 조직명 매핑·직무 추출, 없으면 규칙 폴백으로 동작)
"""

import logging

import pandas as pd

from analysis import CH_ORDER
from analysis.loading import DATA_DIR, load_postings
from analysis.metrics import (
    FIELD_LABELS,
    add_dormancy_flags,
    add_transparency,
    channel_matrix,
    dept_gap_table,
    dept_tier_comparison,
    last_posting,
    posting_gaps,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUT_DIR = DATA_DIR / "analysis"


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    df = add_transparency(load_postings())
    logger.info("교내 근로 공고 %d건 로드 (부서 식별 %d건)", len(df), df["org"].notna().sum())

    # 1) 부서 × 채널 매트릭스 (역대 / 최근 3년)
    mat = channel_matrix(df)
    mat.to_csv(OUT_DIR / "dept_channel_matrix.csv", encoding="utf-8-sig")
    recent = channel_matrix(df[df["posted_date"] >= "2023-01-01"])
    recent.to_csv(OUT_DIR / "dept_channel_matrix_2023_2026.csv", encoding="utf-8-sig")

    # 2) 게시 이력 등급 (조직도 전 단위 × 판정 기간 3개)
    gap = posting_gaps(df)
    gap.to_csv(OUT_DIR / "dept_posting_gaps.csv", index=False, encoding="utf-8-sig")
    tier_cmp = dept_tier_comparison(gap)
    tier_cmp.to_csv(OUT_DIR / "dept_tier_by_window.csv", encoding="utf-8-sig")
    n_out = (~tier_cmp["2025이후"].str.startswith("A")).sum()
    logger.info("조직도 단위 %d개 등급 판정 — 학과 %d개 중 2025년 이후 공개 채널 밖 %d개",
                len(gap), len(tier_cmp), n_out)

    # 3) 부서별 마지막 게시일 + 기준별(1/3/5건) 휴면 플래그
    last = add_dormancy_flags(last_posting(df))
    last.to_csv(OUT_DIR / "dept_last_posting.csv", encoding="utf-8-sig")

    # 4) 부서별 정보 충실도 (서담 포함 전 채널)
    ind_cols = [f"공개_{k}" for k in FIELD_LABELS]
    dept_tr = (df[df["org"].notna()].groupby("org")
               .agg(공고수=("post_id", "size"), 정보충실도=("정보충실도", "mean"),
                    **{k: (f"공개_{k}", "mean") for k in FIELD_LABELS}))
    for k in FIELD_LABELS:
        dept_tr[k] = (dept_tr[k] * 100).round(1)
    dept_tr["정보충실도"] = dept_tr["정보충실도"].round(1)
    dept_tr = dept_tr.join(mat[["주채널", "사용채널수"]])
    dept_tr.sort_values("공고수", ascending=False).to_csv(
        OUT_DIR / "dept_completeness.csv", encoding="utf-8-sig")

    # 5) 채널별 기재율
    ch = df.groupby("channel")[ind_cols].mean() * 100
    ch.columns = list(FIELD_LABELS)
    ch = ch.loc[[c for c in CH_ORDER if c in ch.index]]
    ch["평균(정보충실도)"] = df.groupby("channel")["정보충실도"].mean()
    ch.round(1).to_csv(OUT_DIR / "channel_field_disclosure.csv", encoding="utf-8-sig")

    # 6) 직무(role) 분포
    roles = (df[df["role"].notna()].groupby("role")
             .agg(공고수=("post_id", "size"))
             .sort_values("공고수", ascending=False))
    roles.to_csv(OUT_DIR / "role_counts.csv", encoding="utf-8-sig")
    logger.info("직무 추출 커버리지 %.0f%% (고유 직무 %d개)",
                df["role"].notna().mean() * 100, len(roles))

    logger.info("CSV %d개 재생성 완료 → %s", len(list(OUT_DIR.glob("*.csv"))), OUT_DIR)


if __name__ == "__main__":
    main()
