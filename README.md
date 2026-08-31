# STREAM

> **서강대학교 교내근로장학생 통합관리 시스템, STREAM** <br>
> **S**ogang **T**otal **R**ecruitment & **E**fficient **A**dministration **M**anagement

**STREAM**은 서강대학교의 **교내근로장학 업무를 하나의 시스템으로 통합한 웹 서비스**입니다.

공고 등록부터 지원·선발, 근무표 편성, 대타 처리까지 교내근로 업무 전반을 한 곳에서 처리하며,<br>
서강대학교 ERP 시스템인 **SAINT와 연계 가능한 서브시스템**을 가정하여 설계·개발했습니다.

---

## 핵심 구조

STREAM은 담당자가 근무표를 반복해서 수작업으로 편성·수정해야 하는 부담을 줄입니다.

학생의 **근무 가능 시간·수업 시간표**와 부서의 **운영 규칙**을 제약조건으로 변환하면<br>
**CP-SAT Solver**가 조건을 만족하는 근무표를 생성합니다.

담당자는 생성된 근무표를 **AI 챗봇과 자연어로 대화하며 조정**할 수 있고,<br>
LLM은 최종 근무표가 부서 규칙과 담당자의 요구사항에 맞는지 검토합니다.

> **CP-SAT은 근무표를 생성하고, AI는 요청을 해석하고 결과를 검토합니다.**<br>
> 최종 확정은 항상 담당자가 수행하는 **Human-in-the-loop** 구조입니다.

---

## 주요 기능

### 📋 공고 · 지원 · 선발

부서가 근로 공고를 등록하고, 학생은 공통 지원서로 지원합니다.<br>
담당자는 지원자를 비교하고 선발할 수 있습니다.

### 📅 근무표 자동 편성

학생의 가능 시간·수업 시간표와 부서의 운영시간, 슬롯별 필요 인원, 주간 근로시간 상한 등을 제약조건으로 설정합니다.

**Google OR-Tools CP-SAT**이 해당 조건을 만족하는 근무표를 자동 생성합니다.

### 💬 대화형 근무표 조정

생성된 근무표를 보면서 자연어로 수정 요청을 할 수 있습니다.

> "수요일 조수현 근무를 모두 빼줘."<br>
> "금요일 오전에는 최소 2명을 배치해줘."

AI가 요청을 해석하고 기존 필수 제약조건을 유지하면서 근무표를 다시 조정합니다.

### 🤖 AI 근무표 검토

부서가 자연어로 입력한 운영 규칙과 담당자의 요구사항을 기준으로 근무표를 검토합니다.

규칙이 모호하거나 판단에 필요한 정보가 부족한 경우에는 담당자에게 추가 정보를 요청합니다.

### 🔄 대타 요청 · 승인

학생은 자신의 근무 일부에 대해 동료에게 대타를 요청할 수 있습니다.

담당자가 최종 승인하며, AI가 **근무 가능 시간·주간 근로시간 상한 등 적합성**을 함께 검토합니다.

> 외부 LLM에 전달되는 프롬프트에서는 학번·이름 등 식별정보를 비식별화합니다.

---

## 데모

> **배포 주소:** http://3.34.82.68

별도의 로컬 세팅 없이 브라우저에서 바로 사용할 수 있습니다.

| 역할 | ID         | 이름                  |
| -- | ---------- | ------------------- |
| 학생 | `20220081` | 안희진 · 지원 현황 데모(합격·검토중·불합격 등 5건, 확정 근무 없음) |
| 학생 | `20220042` | 김현서 · 로욜라도서관 정보서비스팀 |
| 학생팀장 | `20261005` | 김찬우 · 정보서비스팀-test |
| 직원 | `STF001`   | 박정보 · 로욜라도서관 정보서비스팀 |
| 직원 | `STF010`   | 이정보 · 정보서비스팀-test |
| 직원 | `STF011`   | 윤아텍 · 아트&테크놀로지학과-test |
| 직원 | `STF012`   | 한교육 · 교육대학원 행정팀-test |

비밀번호는 모두 `stream1234`입니다.

> 현재 HTTPS가 적용되지 않은 데모 환경입니다. 실제 개인정보는 입력하지 마세요.

---

## 기술 스택

| 영역            | 스택                                            |
| -------------- | ---------------------------------------------- |
| Backend        | Python 3.11+ · FastAPI · SQLAlchemy · Pydantic |
| Scheduler      | Google OR-Tools · CP-SAT                       |
| AI             | Google Gemini                                  |
| Frontend       | React · Vite · React Router                    |
| Database       | PostgreSQL                                     |
| Auth           | JWT (PyJWT · passlib)                          |
| Test           | pytest                                         |
| Infrastructure | AWS EC2 · RDS · S3 · nginx                     |
| CI/CD          | GitHub Actions · OIDC · AWS SSM                |

---

## 로컬 실행

상세한 개발 환경 설정은 [docs/DEV_SETUP.md](docs/DEV_SETUP.md)를 참고하세요.

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

```bash
# Frontend
cd frontend
npm install
npm run dev
```

* Frontend: `http://localhost:5173`
* Backend: `http://localhost:8000`
* API Docs: `http://localhost:8000/docs`

스케줄러의 제약조건과 목적함수는 [docs/SCHEDULER_SPEC.md](docs/SCHEDULER_SPEC.md)에서 확인할 수 있습니다.

---

## 프로젝트 정보

[**2026 서강대학교 생성형 AI 기반 아이디어 공모전** - *AI로 만들어가는 Sogang Next Standard*](https://contest.sogang.ac.kr/)

* **주최:** 서강대학교 디지털정보처 · RISE 사업단 · AI중심대학사업단
* **협력기업:** 마인드로직
* **멘토링:** 브랜드넛
* **프로젝트 기간:** 2026.05 ~ 2026.09

### Team Beaver 🦫

* 김현서 · 국어국문학과 4학년 · Leader
* 권지영 · 경영학과 3학년
* 안희진 · 국어국문학과 4학년
* 오규원 · 경영학과 4학년
* 조수현 · 경영학과 4학년
