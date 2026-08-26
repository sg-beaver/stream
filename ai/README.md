# STREAM AI — 교내 근로 공고 크롤링·정제 파이프라인

역대 교내 근로(조교·근로장학·행정보조 등) 모집 공고를 수집하고,
GEMINI API로 STREAM `job_posting` 스키마에 맞는 정형 데이터로 변환합니다.

## 구성

| 단계 | 모듈 | 설명 |
|---|---|---|
| 수집 | `crawler/sources/sogang_cms.py` | 청년광장 교내조교모집 + 학과·기관 홈페이지 (Sogang CMS 공용) |
| 수집 | `crawler/sources/ssodam.py` | 서담 모집공고 게시판 (교내 근로 키워드 필터) |
| 수집 | `crawler/sources/dept_html.py` | 비표준 게시판을 쓰는 이공계 학과 홈페이지 (그누보드·자체 php) |
| 정제 | `crawler/refine/refiner.py` | Gemini API(무료 티어)로 raw → 정형 JSON (`RefinedPosting` 스키마, 직무 `role` 포함) |
| 보강 | `crawler/refine/enrich.py` | Gemini로 조직명→조직도 매핑(`org_map.json`), 기존 공고 직무 백필(`roles.jsonl`) |
| 분석 | `analysis/` 패키지 | 조직명 정규화·채널 매트릭스·채용 공개성 등급·정보 충실도 등 전 지표 (`python -m analysis`) |
| 시각화 | `notebooks/posting_channel_analysis.ipynb` | `analysis` 패키지를 import해 차트·해설만 담당 |

데이터는 소스별 JSONL로 쌓입니다 (재실행 시 이미 수집/정제한 게시물은 건너뜀).

```
ai/data/
├── raw/        # 크롤링 원본: {source}.jsonl
├── refined/    # 정제 결과: {source}.jsonl + org_map.json(조직명 매핑) + roles.jsonl(직무 백필)
└── analysis/   # 분석 CSV (python -m analysis 로 재생성)
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
| `REFINE_BATCH` | 선택 | 한 번의 API 호출로 정제할 게시물 수 (기본 8 — 무료 티어 일일 요청 한도 절약) |

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

# 3) 본문 재수집 — 이미 수집된 게시물의 본문이 깨졌을 때 (현재 ssodam만 지원)
python -m crawler refetch ssodam               # 본문이 비었거나 메뉴 텍스트인 것만
python -m crawler refetch ssodam --all         # 전부 다시 (원본은 .jsonl.bak으로 백업)

# 4) 보강 — Gemini로 조직명 매핑·직무 추출 (멱등, 새 항목만 처리)
python -m crawler enrich                       # 둘 다 (--orgs / --roles로 선택 가능)

# 5) 분석 CSV 재생성
python -m analysis
```

## 정제 결과 스키마

`crawler/refine/schema.py`의 `RefinedPosting`:

- `is_campus_job`, `category` — 교내 근로 여부/분류 (조교, 근로장학, 행정보조 …)
- `title`, `organization`, `description`, `qualification` — `job_posting` 테이블 대응 필드
- `preferred_qualification` — 우대사항 (필수 자격과 구분)
- `posted_date`, `deadline`, `application_start` — YYYY-MM-DD 정규화
- `hourly_wage_krw`, `weekly_hours` — 시급(원)·주당 근무시간 숫자 정규화 (필터/매칭용)
- `wage`, `work_hours`, `work_period`, `work_location`, `headcount` — 근무 조건 원문 필드
- `apply_method`, `documents_required`, `selection_method`, `contact` — 지원 절차 필드

정제는 `REFINE_BATCH`(기본 8)건씩 한 번의 API 호출로 묶어 처리하며, 배치 응답에서
누락된 게시물은 자동으로 단건 재시도합니다. `--campus-only`로 제외된 게시물은
`excluded: true` 레코드로 남아 다음 실행에서 다시 정제하지 않습니다
(소비 시 `excluded` 레코드는 걸러서 사용).

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

## 공고 채널·공개성 분석

정제 데이터 전체를 근거 수치로 바꾸는 분석입니다. STREAM의 문제 정의
("공고가 흩어져 있고, 정보가 불충분하고, 일부는 아예 공개되지 않는다")를 뒷받침하는
데 바로 인용할 수 있도록 구성했습니다.

- **로직**: [`analysis/`](analysis/) 패키지 — `loading.py`(로드·직무 병합),
  `orgs.py`(조직명 정규화: Gemini 매핑 우선, 규칙 폴백), `metrics.py`(전 지표)
- **CSV 재생성**: `python -m analysis`
- **시각화**: [`notebooks/posting_channel_analysis.ipynb`](notebooks/posting_channel_analysis.ipynb)
  — 패키지를 import해 차트·해설만 담당 (Jupyter에서 전체 재실행)

### 분석 내용 (11개 섹션)

| 주제 | 내용 |
|---|---|
| 조직명 정규화 | 표기 변형 350여 개 → Gemini가 조직도와 대조해 매핑 (`enrich --orgs`), 규칙 폴백 |
| 직무 분포 | 공고별 모집 직무(`role`) 추출 — '입학처 논술 조교 모집' → 부서 '입학처' + 직무 '논술 조교' |
| 채널 사용 현황 | 부서 × 채널(청년광장/서담/홈페이지) 매트릭스, 단일 채널 의존도, 서담 전용 부서 |
| 시기별 변화 | 연도별 채널 비중 이동, 월별 모집 시즌(8월·2월·12월 집중), 주채널 전환 부서 |

| 휴면·이탈 | 부서별 마지막 게시일, 채널별 게시 중단 시점(청년광장 이탈 부서) |
| **채용 공개성** | 채용이 공개 경로로 이뤄지는가 — 조직도 대비 게시 이력 등급, 학과 공개율 지수 |
| 정보 충실도 | 공고당 핵심 8개 항목(임금·근무시간·기간·인원·마감·자격·지원방법·문의) 기재율 → 0-100점 |
| 리드타임 | 게시일→마감일 간격 (공고 발견 기회의 지표) |
| 크로스포스팅 | 복수 채널 게시 비율 — 제목 완전일치(하한)와 직무·7일 윈도우(상한) 두 정의로 추정 |

**게시 이력 등급**은 조직 단위마다 `A. 공개 채널 게시 / A-. 상위조직 단위로 게시 /
B. 자기 홈페이지에만 / C. 게시 이력 없음`으로 판정하며, **판정 기간 3개(전체 /
2022년 이후 / 2025년 이후)** 를 나란히 계산해 "예전엔 올렸지만 최근에 끊긴" 부서를
드러냅니다. 청년광장·서담은 전수 수집이므로 B·C 판정(공개 채널 부재)은 확정적입니다.

### 산출 CSV (`data/analysis/`)

| 파일 | 내용 |
|---|---|
| `dept_posting_gaps.csv` | 조직도 전 단위의 게시 이력 등급 (판정 기간 3개 × 채널별 공고 수) |
| `dept_tier_by_window.csv` | 학부 학과·전공의 기간별 등급 비교표 (전체/2022 이후/2025 이후) |
| `role_counts.csv` | 추출된 직무별 공고 수 |
| `dept_last_posting.csv` | 부서별 첫/마지막 공고일, 채널별 마지막 게시일, 경과 개월 |
| `dept_channel_matrix.csv` | 부서 × 채널 공고 수 (역대), 주채널, 사용 채널 수 |
| `dept_channel_matrix_2023_2026.csv` | 최근 3년 부서 × 채널 매트릭스 |
| `dept_completeness.csv` | 부서별 정보 충실도 + 항목별 기재율 |
| `channel_field_disclosure.csv` | 채널별 핵심 정보 기재율 |

### 데이터 이력·주의사항

- **서담 본문 재수집(2026-07-25)**: 초기 크롤링은 셀렉터 버그로 본문 대신 사이트 메뉴
  텍스트를 저장했습니다. 셀렉터 수정 후 `refetch ssodam`으로 본문 1,153건(95%)을
  재수집·재정제했습니다. 그 이전의 서담 정제 데이터로 낸 분석 결과는 무효입니다.
- **이공계 학과 크롤 확장(2026-07-26)**: 생명과학·기계·전자·시스템반도체·반도체·화공생명
  6개 학과 8개 게시판을 `dept_html.py`로 추가 수집했습니다. 화학과는 자체 게시판이
  없어 홈페이지 수집이 불가능하고, 경제·경영은 신형 CMS(new-cms SPA)라 미수집입니다
  (두 곳 모두 청년광장 게시 이력이 있어 등급 판정에는 영향 없음).
- 필드 기재율은 Gemini 정제 결과 기준이므로 절대값보다 **채널·부서 간 상대 비교**로
  해석하는 것이 안전합니다.

## 학과·기관 게시판 추가하기

**표준 Sogang CMS 게시판**은 조직도 JSON에서 대상 조직 노드에 `board`를 추가하면 됩니다.

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

**비표준 게시판**(그누보드, 자체 php 등 — 주로 이공계 학과)은
`crawler/sources/dept_html.py`의 `HTML_SITES` 목록에 명세를 추가합니다.
목록 URL 패턴(`{page}` 포함), 상세 링크 식별 문자열, 게시물 id 파라미터,
본문 컨테이너 CSS 셀렉터를 지정하면 됩니다 (기존 항목 참고).

## 주의

- 요청 사이에 기본 1초 딜레이를 두어 상대 서버에 부하를 주지 않도록 했습니다.
- 서담 등 로그인 기반 커뮤니티의 데이터는 내부 데이터셋 구축 용도로만 사용하고
  외부에 재배포하지 않습니다.
