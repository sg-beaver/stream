"""분석 지표.

- 정보 충실도: 공고에 핵심 정보(임금·자격 등)가 얼마나 기재됐는가 (공고 단위 0~100점)
- 채용 공개성: 채용이 공개 채널을 통해 이뤄지는가 (조직 단위 게시 이력 등급 A/A-/B/C)
- 그 외: 채널 매트릭스, 휴면, 리드타임, 크로스포스팅
"""

import re

import pandas as pd

from analysis.orgs import load_chart_units, resolve_org, rule_normalize

CH_ORDER = ["청년광장", "서담", "학과·기관 홈페이지"]

# 정보 충실도를 구성하는 핵심 8개 항목: 라벨 → 기재 여부 판정
FIELD_LABELS = {
    "임금": lambda t: t["wage"].notna() | t["hourly_wage_krw"].notna(),
    "근무시간": lambda t: t["work_hours"].notna() | t["weekly_hours"].notna(),
    "근무기간": lambda t: t["work_period"].notna(),
    "모집인원": lambda t: t["headcount"].notna(),
    "지원마감일": lambda t: t["deadline"].notna(),
    "자격요건": lambda t: t["qualification"].notna(),
    "지원방법": lambda t: t["apply_method"].notna(),
    "문의처": lambda t: t["contact"].notna(),
}

# 조직도에 옛/새 이름이 함께 실린 단위의 연결 (조직도 단위 → 이력을 가진 조직도 단위)
# 개편 전 조직명 → 조직도 단위 매핑 자체는 Gemini org_map이 담당한다.
RENAMED = {
    "글로벌한국학": "국제한국학",      # 국제한국학과 → 글로벌한국학부 개편 (조직도에 둘 다 존재)
    "글로벌한국학부": "국제한국학",
}

# 판정 기간: (라벨, 시작일) — None이면 전체
DEFAULT_WINDOWS = [("전체", None), ("2022이후", "2022-01-01"), ("2025이후", "2025-01-01")]

TIER_A = "A. 공개 채널 게시"
TIER_A_SUP = "A-. 상위조직 단위로 게시"
TIER_B = "B. 자기 홈페이지에만"
TIER_C = "C. 게시 이력 없음"


def add_transparency(df: pd.DataFrame) -> pd.DataFrame:
    """공개_<항목> bool 컬럼들과 정보충실도(0~100)를 추가한 사본을 반환."""
    df = df.copy()
    for label, fn in FIELD_LABELS.items():
        df[f"공개_{label}"] = fn(df)
    cols = [f"공개_{k}" for k in FIELD_LABELS]
    df["정보충실도"] = df[cols].mean(axis=1) * 100
    return df


def channel_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """org × 채널 공고 수 매트릭스 (+합계, 사용채널수, 주채널)."""
    d = df[df["org"].notna()]
    mat = (d.pivot_table(index="org", columns="channel", values="post_id", aggfunc="count")
           .fillna(0).astype(int))
    for c in CH_ORDER:
        if c not in mat.columns:
            mat[c] = 0
    mat = mat[CH_ORDER]
    mat["합계"] = mat.sum(axis=1)
    mat["사용채널수"] = (mat[CH_ORDER] > 0).sum(axis=1)
    mat["주채널"] = mat[CH_ORDER].idxmax(axis=1)
    return mat.sort_values("합계", ascending=False)


def _make_matcher(mat: pd.DataFrame):
    """조직도 단위명 → 매트릭스의 org 찾기. Gemini 매핑으로 org가 조직도 표기와
    일치하는 경우가 대부분이고, 규칙 폴백 org를 위해 접미어 변형도 시도한다."""
    key = lambda s: re.sub(r"[\s·]", "", s) if s else None
    pk = {key(o): o for o in mat.index}

    def match_unit(name):
        for cand in (name, name + "학과", name + "학부", name + "부", name + "과", name + "전공"):
            k = key(rule_normalize(cand) or "")
            if k in pk:
                return pk[k]
        if name in RENAMED:
            k = key(RENAMED[name])
            if k in pk:
                return pk[k]
        return None

    return match_unit


def classify_tiers(mat: pd.DataFrame) -> dict:
    """조직도 단위명 → 등급(A/A-/B/C).

    상위 조직 대행 게시(A-)는 상위 공고 5건 이상일 때만 인정한다
    (예: '공과대학' 명의 공고 2건이 전자공학과의 게시 이력을 대신하지 않음).
    """
    match_unit = _make_matcher(mat)
    out = {}
    for section, parent, name in load_chart_units():
        if name in out:
            continue
        o = match_unit(name)
        if o is not None:
            row = mat.loc[o]
            out[name] = TIER_A if row["청년광장"] + row["서담"] > 0 else TIER_B
        else:
            po = match_unit(parent)
            out[name] = (TIER_A_SUP if po is not None and mat.loc[po, "합계"] >= 5
                         else TIER_C)
    return out


def posting_gaps(df: pd.DataFrame, windows=DEFAULT_WINDOWS) -> pd.DataFrame:
    """조직도 전 단위의 게시 이력 등급 — 판정 기간별 컬럼 + 역대 채널별 공고 수."""
    d = df[df["org"].notna()]
    mat_all = channel_matrix(d)

    tiers = {}
    for label, start in windows:
        dsub = d if start is None else d[d["posted_date"] >= start]
        tiers[label] = classify_tiers(channel_matrix(dsub))

    match_all = _make_matcher(mat_all)
    rows = []
    for section, parent, name in load_chart_units():
        o = match_all(name)
        counts = [int(mat_all.loc[o, c]) for c in CH_ORDER] if o is not None else [0, 0, 0]
        rows.append([section, parent, name, o]
                    + [tiers[label][name] for label, _ in windows] + counts)
    tier_cols = ["등급" if label == "전체" else f"등급_{label}" for label, _ in windows]
    gap = pd.DataFrame(rows, columns=["부문", "상위조직", "조직명", "매칭조직",
                                      *tier_cols, *CH_ORDER])
    return gap.drop_duplicates(subset=["조직명"])


def dept_gap_table(gap: pd.DataFrame) -> pd.DataFrame:
    """학부 학과·전공 단위만 추린 등급표 (모든 학과는 조교를 쓴다 → C등급 = 강한 신호)."""
    return gap[(gap["부문"] == "대학") &
               ~gap["조직명"].str.contains("대학$|학부대학|행정팀|자유전공", regex=True)].copy()


TIER_SHORT = {TIER_A: "A 공개채널", TIER_A_SUP: "A- 상위조직",
              TIER_B: "B 홈페이지만", TIER_C: "C 없음"}


def dept_tier_comparison(gap: pd.DataFrame) -> pd.DataFrame:
    """학과 × 판정 기간 등급 비교표 (짧은 라벨)."""
    depts = dept_gap_table(gap)
    tier_cols = [c for c in depts.columns if c.startswith("등급")]
    cmp = depts.set_index("조직명")[tier_cols].replace(TIER_SHORT)
    cmp.columns = ["전체" if c == "등급" else c.replace("등급_", "") for c in tier_cols]
    return cmp.sort_values(list(cmp.columns)[::-1])


def last_posting(df: pd.DataFrame) -> pd.DataFrame:
    """부서별 첫/마지막 공고일, 채널별 마지막 게시일, 경과 개월."""
    d = df[df["org"].notna() & df["posted_date"].notna()]
    asof = d["posted_date"].max()
    out = d.groupby("org").agg(
        공고수=("post_id", "size"),
        첫공고=("posted_date", "min"),
        마지막공고=("posted_date", "max"),
    )
    by_ch = d.pivot_table(index="org", columns="channel", values="posted_date", aggfunc="max")
    by_ch.columns = [f"마지막_{c}" for c in by_ch.columns]
    out = out.join(by_ch)
    out["경과개월"] = ((asof - out["마지막공고"]).dt.days / 30.4).round(1)
    out.attrs["asof"] = asof
    return out.sort_values("공고수", ascending=False)


DORMANT_MONTHS = 18
DORMANT_THRESHOLDS = (1, 3, 5)  # 역대 공고 수 기준 — 숫자가 클수록 "관행적 공개 모집" 부서로 한정


def add_dormancy_flags(last: pd.DataFrame, months: int = DORMANT_MONTHS,
                       thresholds=DORMANT_THRESHOLDS) -> pd.DataFrame:
    """last_posting 결과에 기준별 휴면 여부 컬럼(휴면_N건)을 추가한 사본."""
    last = last.copy()
    for n in thresholds:
        last[f"휴면_{n}건"] = (last["공고수"] >= n) & (last["경과개월"] >= months)
    return last


def lead_times(df: pd.DataFrame, max_days: int = 90) -> pd.DataFrame:
    """게시일→마감일 리드타임(일). 둘 다 있는 공고만, 이상치(0~max_days 밖) 제거."""
    lt = df[df["posted_date"].notna() & df["deadline"].notna()].copy()
    lt["리드타임"] = (lt["deadline"] - lt["posted_date"]).dt.days
    return lt[lt["리드타임"].between(0, max_days)]


def _norm_title(t: str) -> str:
    return re.sub(r"[\s\[\]()【】〔〕<>《》\-_/·.,!?~:;\"'']+", "", str(t)).lower()


def cross_posting_stats(df: pd.DataFrame) -> dict:
    """같은 공고(부서+제목 완전일치)가 복수 채널에 게시된 비율.

    보수적 하한값: 채널마다 제목을 조금이라도 다르게 쓰면 다른 공고로 센다.
    직무 기반 상한 추정은 cross_posting_role_window() 참조.
    """
    cp = df[df["org"].notna() & df["title"].notna()].copy()
    key = cp["org"] + "|" + cp["title"].map(_norm_title)
    grp = cp.groupby(key)["channel"].nunique()
    return {
        "unique_postings": len(grp),
        "cross_channel": int((grp >= 2).sum()),
        "cross_ratio": float((grp >= 2).mean()),
    }


def cross_posting_role_window(df: pd.DataFrame, window_days: int = 7) -> dict:
    """같은 부서·같은 직무(role)의 공고가 window_days 이내 간격으로 이어지면
    하나의 '모집 건'으로 묶고, 복수 채널에 게시된 모집 건의 비율을 계산한다.

    제목 완전일치 방식보다 느슨한 정의 — 채널별로 제목을 바꿔 낸 경우도 잡히지만,
    같은 직무를 우연히 같은 주에 두 번 모집한 경우도 하나로 묶일 수 있다(상한 추정).
    role이 추출된 공고만 대상으로 한다.
    """
    d = df[df["org"].notna() & df["role"].notna() & df["posted_date"].notna()].copy()
    d["role_key"] = d["role"].map(lambda s: re.sub(r"\s+", "", str(s)).lower())

    clusters: list[set] = []
    for _, g in d.sort_values("posted_date").groupby(["org", "role_key"]):
        channels: set = set()
        last = None
        for _, r in g.iterrows():
            if last is not None and (r["posted_date"] - last).days > window_days:
                clusters.append(channels)
                channels = set()
            channels.add(r["channel"])
            last = r["posted_date"]
        clusters.append(channels)

    n = len(clusters)
    cross = sum(1 for c in clusters if len(c) >= 2)
    return {
        "coverage": float(len(d) / max(1, df["org"].notna().sum())),
        "unique_recruitments": n,
        "cross_channel": cross,
        "cross_ratio": cross / max(1, n),
    }
