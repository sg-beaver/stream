"""교내 근로 공고 채널·투명성 분석 패키지.

`data/refined/*.jsonl`(정제 결과)과 `crawler/resources/sogang_org_chart.json`(조직도),
있다면 `data/refined/org_map.json`(Gemini 조직명 매핑)·`data/refined/roles.jsonl`(직무)을
입력으로 분석용 DataFrame과 지표를 만든다.

- `python -m analysis` — data/analysis/*.csv 전부 재생성
- 노트북(notebooks/posting_channel_analysis.ipynb)은 이 패키지를 import해 시각화만 담당
"""

from analysis.loading import load_postings
from analysis.orgs import load_chart_units, org_type, resolve_org
from analysis.metrics import (
    FIELD_LABELS,
    add_transparency,
    channel_matrix,
    classify_tiers,
    cross_posting_stats,
    cross_posting_role_window,
    dedup_recruitments,
    last_posting,
    lead_times,
    posting_gaps,
)

CH_ORDER = ["청년광장", "서담", "학과·기관 홈페이지"]
