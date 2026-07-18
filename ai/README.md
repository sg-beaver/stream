# STREAM AI — 교내 근로 공고 크롤링·정제 파이프라인

역대 교내 근로(조교·근로장학·행정보조 등) 모집 공고를 수집하고,
GEMINI API로 STREAM `job_posting` 스키마에 맞는 정형 데이터로 변환합니다.

## 구성

| 단계 | 모듈 | 설명 |
|---|---|---|
| 수집 | `crawler/sources/sogang_cms.py` | 청년광장 교내조교모집 + 학과·기관 홈페이지 (Sogang CMS 공용) |
| 수집 | `crawler/sources/ssodam.py` | 서담 모집공고 게시판 (교내 근로 키워드 필터) |
| 정제 | `crawler/refine/refiner.py` | Gemini API(기본 gemini-3.5-flash, 무료 티어)로 raw → 정형 JSON (`RefinedPosting` 스키마) |

데이터는 소스별 JSONL로 쌓입니다 (재실행 시 이미 수집/정제한 게시물은 건너뜀).

```
ai/data/
├── raw/        # 크롤링 원본: {source}.jsonl
└── refined/    # 정제 결과: {source}.jsonl
```

## 설치

```bash
cd ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## 환경변수

`ai/.env` 파일 또는 셸 환경변수로 설정합니다.

| 변수 | 필요 시점 | 값 |
|---|---|---|
| `GEMINI_API_KEY` | `refine` 실행 시 | Google AI Studio에서 발급한 Gemini API 키 |
| `SSODAM_COOKIE` | 서담 크롤링 시 | 서담 로그인 후 브라우저 요청의 `Cookie` 헤더 값 전체 |
| `SCC_COOKIE` | 청년광장이 로그인을 요구할 때 | 청년광장 로그인 후 `Cookie` 헤더 값 전체 |
| `CRAWLER_DELAY` | 선택 | 크롤링 요청 간 대기 초 (기본 1.0) |
| `REFINE_DELAY` | 선택 | Gemini 호출 간 대기 초 (기본 6.0 — 무료 티어 분당 요청 제한 대응) |
| `REFINE_MODEL` | 선택 | 정제에 쓸 Gemini 모델 (기본 `gemini-3.5-flash`) |

> 쿠키 얻는 법: 브라우저에서 해당 사이트 로그인 → 개발자도구(F12) → Network 탭 →
> 아무 요청 클릭 → Request Headers의 `Cookie` 값을 통째로 복사.

## 실행

`ai/` 디렉토리에서 실행합니다.

```bash
# 1) 크롤링 (raw 수집)
python -m crawler crawl scc --pages 5        # 청년광장 교내조교모집
python -m crawler crawl ssodam --pages 3     # 서담 모집공고 (SSODAM_COOKIE 필요)
python -m crawler crawl dept --pages 3       # 등록된 학과·기관 게시판 전부
python -m crawler crawl dept --site dept_math
python -m crawler crawl all
python -m crawler crawl all --pages 0       # 전체 페이지 (역대 공고 일괄 수집)

# 2) 정제 (raw → 정형 JSON, GEMINI_API_KEY 필요)
python -m crawler refine --source scc
python -m crawler refine --all --limit 50
python -m crawler refine --all --campus-only   # 교내 근로로 판별된 것만 저장
```

## 정제 결과 스키마

`crawler/refine/schema.py`의 `RefinedPosting`:

- `is_campus_job`, `category` — 교내 근로 여부/분류 (조교, 근로장학, 행정보조 …)
- `title`, `organization`, `description`, `qualification` — `job_posting` 테이블 대응 필드
- `posted_date`, `deadline` — YYYY-MM-DD 정규화
- `wage`, `work_hours`, `work_period`, `headcount`, `apply_method`, `contact` — 확장 필드

## 조직도 문서 (단일 소스)

서강대 공식 조직도를 계층 구조로 정리한
[`crawler/resources/sogang_org_chart.json`](crawler/resources/sogang_org_chart.json)이
크롤러 설정의 단일 소스입니다. 각 노드는 `name`(조직명), `homepage`(홈페이지 URL,
있는 경우), `board`(공지 게시판 크롤링 설정, 있는 경우), `children`(하위 조직)을 가집니다.

크롤러는 이 문서에서 두 가지를 읽습니다.

- **교내 근로 판별 키워드**: 접미사(`ORG_UNIT_SUFFIXES`: 팀/실/센터/처 등)로 끝나는
  조직명을 자동 추출해 직무 키워드(`JOB_KEYWORDS`)와 합칩니다.
  최상위 그룹 라벨(행정부서, 대학원 등)은 분류용이므로 키워드에서 제외됩니다.
- **크롤링 대상 게시판(`DEPT_SITES`)**: `board` 설정이 있는 노드마다 크롤러가 생성됩니다.

## 학과·기관 게시판 추가하기

조직도 JSON에서 대상 조직 노드에 `board`를 추가하면 됩니다.

```json
{
  "name": "수학",
  "homepage": "https://math.sogang.ac.kr/",
  "board": {
    "label": "수학과 공지사항",
    "site_id": "math",
    "bbs_config_fk": "1947"
  }
}
```

- `bbs_config_fk`는 해당 게시판 목록 URL(`cmsboardlist.do?...bbsConfigFK=...`)에서 확인
- `base_url` 생략 시 `homepage`의 호스트를 사용
- 서강대 조직 홈페이지 대부분이 같은 CMS(`/front/cmsboardlist.do`)라 이 두 값이면 동작

## 주의

- 요청 사이에 기본 1초 딜레이를 두어 상대 서버에 부하를 주지 않도록 했습니다.
- 서담 등 로그인 기반 커뮤니티의 데이터는 내부 데이터셋 구축 용도로만 사용하고
  외부에 재배포하지 않습니다.
