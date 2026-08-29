# AWS 배포 가이드

2026-08-27 ~ 28에 실제로 수행한 배포 절차입니다. 발표(9/4)·수상자 발표(9/11)를 위한
**2주 한정 데모 환경** 기준으로 작성했고, 장기 운영을 전제로 하지 않습니다.

로컬 개발 환경 세팅은 [DEV_SETUP.md](DEV_SETUP.md)를 보세요. 이 문서는 서버에 올리는 것만 다룹니다.

---

## 접속 정보

**데모 URL — http://3.34.82.68**

브라우저로 바로 접속하면 됩니다. 별도 설치나 로컬 서버 실행이 필요 없습니다.

| 항목 | 값 |
|---|---|
| 프론트엔드 | http://3.34.82.68 |
| Swagger (API 테스트) | http://3.34.82.68/docs |
| 배포 브랜치 | `develop` |
| 리전 / 인스턴스 | `ap-northeast-2` / `c7i-flex.large` |
| RDS 엔드포인트 | `stream-db.cbcysqsc2mc9.ap-northeast-2.rds.amazonaws.com:5432` (VPC 내부에서만 접근 가능) |

### 로그인 계정

모든 시드 계정의 비밀번호는 **`stream1234`** 입니다. 전체 명단은
[DEV_SETUP.md 8절](DEV_SETUP.md)에 있습니다.

| 역할 | ID | 이름 |
|---|---|---|
| 학생 (공고 조회·지원 데모) | `20220081` | 안희진 |
| 직원 (근무표 관리 데모) | `STF001` | 박정보 — 로욜라도서관 정보서비스팀 |

> 로그인 화면은 ID가 숫자면 학생, 아니면 직원으로 판별합니다.

> ⚠️ **http라 브라우저에 "안전하지 않음" 경고가 표시됩니다.** 기능에는 지장이 없습니다.

> ⚠️ **시간표 생성은 응답까지 약 30초 걸립니다.** CP-SAT가 시간 제한까지 탐색하기
> 때문이며 정상 동작입니다. 자세한 실측은 10절 참고.

### 서버 접속이 필요한 경우

**SSH(22번)는 닫혀 있습니다.** 자동 배포가 SSM으로 동작하므로 열어둘 이유가 없고,
접속자 IP가 바뀔 때마다 보안 그룹을 고쳐야 하는 문제도 사라집니다.
현재 외부에 열린 포트는 **80·443뿐**입니다.

서버 셸이 필요하면 **Session Manager**를 쓰세요. 키 파일도, IP 등록도 필요 없습니다.

**EC2 → 인스턴스 → `stream-app` → `연결` → `Session Manager` 탭 → `연결`**

접속하면 `ssm-user`로 들어가므로, 작업 전에 계정을 바꿉니다.

```bash
sudo su - ubuntu
```

> SSH가 꼭 필요하면(예: `infra/deploy.sh` 수동 배포) `stream-web` 인바운드에 SSH 규칙을
> 임시로 추가했다가 작업 후 지우면 됩니다. 키 파일 `stream-key.pem`은 리포에 없으니
> 담당자에게 별도로 받으세요.

> **DB 마스터 암호는 이 문서에 적지 않습니다.** 서버의 `/opt/stream/backend/.env`에만
> 있고, 필요하면 담당자에게 문의하세요.

---

## 0. 전체 순서

처음부터 다시 배포한다면 이 순서로 진행합니다. 각 단계는 아래 해당 절에 상세히 있습니다.

| # | 단계 | 절 | 소요 |
|---|---|---|---|
| 0 | AWS 계정 준비 (IAM 사용자·예산 알림·리전) | 1 | 30분 |
| 1 | 보안 그룹 2개 생성 (`stream-web` → `stream-db` 순서) | 4 | 20분 |
| 2 | RDS 생성 | 5 | 30분 (생성 대기 10분 포함) |
| 3 | IAM 역할 생성 | 6 | 5분 |
| 4 | EC2 인스턴스 시작 + 탄력적 IP 연결 | 7 | 15분 |
| 5 | 서버 세팅 (패키지 → DB 확인 → 코드 → venv → `.env` → 시드 → 프론트 빌드) | 8 | 1~2시간 |
| 6 | systemd + nginx | 9 | 20분 |
| 7 | 검증 | 10 | 10분 |

**총 3~4시간** 정도 잡으면 됩니다. 가장 오래 걸리는 구간은 `pip install ortools`(수백 MB)와
`npm ci`입니다.

> 순서를 지켜야 하는 지점이 두 곳 있습니다.
> - **`stream-web`을 `stream-db`보다 먼저** 만들어야 합니다 (DB 규칙이 web 그룹을 참조)
> - **IAM 역할을 EC2보다 먼저** 만들어야 시작 화면에서 선택할 수 있습니다

---

## 1. 사전 준비 (AWS 계정)

### IAM 사용자

루트 계정으로 일상 작업을 하지 않습니다. 작업용 IAM 사용자를 먼저 만드세요.

1. **루트로 로그인한 상태에서** `과금 정보 및 비용 관리 → 계정` 페이지 하단
   **"IAM 사용자/역할의 청구 정보 액세스"** → **활성화**
   (이 설정은 **루트만** 변경할 수 있습니다. 켜두지 않으면 IAM 사용자가 Billing·Cost
   Explorer·Budgets 화면에 접근할 수 없습니다)
2. **IAM → 사용자 → 사용자 생성** → 콘솔 액세스 체크 → "IAM 사용자를 생성하고 싶음" 선택
3. 권한: `AdministratorAccess` 직접 연결 (팀이 여럿이면 그룹을 만들어 붙이는 편이 관리하기 쉬움)
4. 생성 후 **콘솔 로그인 URL** 저장 → `https://820273519659.signin.aws.amazon.com/console`
5. 새 사용자로 로그인 → **보안 자격 증명 → MFA 디바이스 할당**
6. 루트 계정에도 MFA를 걸고, 이후 루트는 결제수단 변경 등에만 사용

> 콘솔 작업만 한다면 **액세스 키는 만들지 마세요.** CLI가 필요하면 콘솔 하단의
> **CloudShell**을 쓰면 별도 자격 증명 없이 계정 권한으로 실행됩니다.

### 예산 알림

리소스를 만들기 **전에** 걸어두세요.

**AWS Budgets → 예산 생성 → 비용 예산** → 월 $20 등으로 설정하고 이메일 알림 등록.

### 리전

**모든 리소스를 `ap-northeast-2`(서울)에 만듭니다.** 보안 그룹·EC2·RDS는 리전별로
분리되어 있어서, 리전이 섞이면 서로 연결되지 않습니다. IAM만 글로벌입니다.

계정 ID는 콘솔 우측 상단 계정 메뉴에서 확인할 수 있습니다.

---

## 2. 구성

```
사용자 브라우저
      │  http://3.34.82.68
      ▼
┌─────────────────────────────────────┐
│ EC2 (Ubuntu 24.04, c7i-flex.large)  │
│                                     │
│  nginx :80                          │
│   ├─ /        → /var/www/stream     │  프론트 정적 빌드 (Vite dist)
│   ├─ /api/    → 127.0.0.1:8000      │  리버스 프록시
│   └─ /docs    → 127.0.0.1:8000      │  Swagger UI
│                                     │
│  uvicorn :8000 (systemd: stream)    │  FastAPI + CP-SAT
└──────────────┬──────────────────────┘
               │ 5432 (보안 그룹 참조)
               ▼
     RDS PostgreSQL 16 (퍼블릭 액세스 차단)
```

**프론트와 API를 같은 오리진에서 서빙하는 것이 이 구성의 핵심입니다.**
프론트가 `fetch('/api...')`로 상대경로를 호출하기 때문에(`frontend/src/api/client.js`),
정적 파일과 API가 같은 호스트에 있어야 CORS 설정 없이 동작합니다.
프론트를 S3/CloudFront로 분리하려면 `client.js`를 `VITE_API_BASE` 방식으로 고쳐야 합니다.

---

## 3. 리소스 스펙

| 리소스 | 스펙 | 비고 |
|---|---|---|
| 리전 | `ap-northeast-2` (서울) | |
| EC2 | `c7i-flex.large` (2 vCPU / 4 GiB), Ubuntu Server 24.04 LTS (x86) | Ubuntu **Pro** 아님 — Pro는 추가 과금 |
| EBS | 20 GiB gp3 | 기본 8GiB로는 ortools + node_modules가 안 들어감 |
| 탄력적 IP | 1개 | 인스턴스 중지/시작 시 IP 고정용 |
| RDS | `db.t4g.micro`, PostgreSQL 16, 20 GiB gp3, 단일 AZ | 퍼블릭 액세스 **차단** |
| 보안 그룹 | `stream-web`, `stream-db` | 아래 4절 |
| IAM 역할 | `stream-ec2-role` | SSM 접속용 |

### 무료 플랜(Free Plan) 제약

신규 계정의 무료 플랜에서는 아래가 막힙니다. 유료 플랜으로 업그레이드하면 풀립니다
(크레딧은 그대로 유지됨).

| 제약 | 증상 | 대응 |
|---|---|---|
| RDS 자동 백업 보존 기간 상한 | 7일 지정 시 `The specified backup retention period exceeds the maximum available to free tier customers` | **1일**로 설정 |
| 인스턴스 유형 제한 | `t3.medium` 등이 선택 목록에 없음 | 선택 가능한 것은 `t3.micro`(1GB) / `t3.small`(2GB) / `c7i-flex.large`(4GB) / `m7i-flex.large`(8GB) |

> ⚠️ **`t3.micro`(1GB)는 쓸 수 없습니다.** `pip install ortools`가 메모리 부족으로 실패합니다.
> 최소 `t3.small` + 스왑, 권장 `c7i-flex.large`.

---

## 4. 보안 그룹

**`stream-web`을 먼저** 만듭니다. `stream-db`가 이를 소스로 참조하기 때문입니다.

**EC2 → 네트워크 및 보안 → 보안 그룹 → 보안 그룹 생성** (설명란은 영문만 입력됨)

### `stream-web`

| 유형 | 포트 | 소스 |
|---|---|---|
| HTTP | 80 | `0.0.0.0/0` |
| HTTPS | 443 | `0.0.0.0/0` |
| SSH | 22 | **내 IP** — 초기 구축에만 필요. 자동 배포(11절) 구성 후 삭제함 |

### `stream-db`

| 유형 | 포트 | 소스 |
|---|---|---|
| PostgreSQL | 5432 | **`stream-web` 보안 그룹**(IP 아님) |

소스 입력칸을 클릭하면 뜨는 목록에서 `sg-xxxx (stream-web)`을 고릅니다. 이렇게 하면
"`stream-web`이 붙은 인스턴스만 DB에 접근 가능"이라는 뜻이 되어, EC2를 다시 만들거나
IP가 바뀌어도 규칙을 고칠 필요가 없습니다.

> ⚠️ 아웃바운드 규칙(기본 전체 허용)은 건드리지 마세요. `apt`·`pip`·LLM API 호출이 막힙니다.
> ⚠️ SSH 소스 "내 IP"는 **네트워크를 옮기면 막힙니다.** 그때는 인바운드 규칙 편집에서
> 소스를 다시 `내 IP`로 선택하면 됩니다.

---

## 5. RDS

**RDS → 데이터베이스 생성 → 표준 생성** (손쉬운 생성은 퍼블릭 액세스·보안 그룹을 못 고름)

| 항목 | 값 |
|---|---|
| 엔진 | PostgreSQL 16.x (로컬 `infra/docker-compose.yml`의 `postgres:16`과 일치) |
| 템플릿 | 개발/테스트 |
| 가용성 | 단일 DB 인스턴스 |
| 식별자 | `stream-db` |
| 마스터 사용자 | `stream_user` |
| 자격 증명 관리 | 셀프 관리 |
| 인스턴스 클래스 | `db.t4g.micro` |
| 스토리지 | gp3 20 GiB, **자동 조정 해제** |
| 퍼블릭 액세스 | **아니요** |
| VPC 보안 그룹 | `stream-db` 만 (`default`는 제거) |
| **초기 데이터베이스 이름** | **`stream_db`** |
| 백업 보존 | **1일** (무료 플랜 상한) |
| 로그 내보내기 | 체크 안 함 (CloudWatch Logs 과금) |
| 성능 개선 도우미 | 끄기 |
| 삭제 방지 | 켜기 |

> ⚠️ **마스터 암호는 영숫자로만 만드세요.** `@ : / # ?`가 들어가면 `DATABASE_URL`의
> 구분자와 충돌해 URL 인코딩이 필요합니다.
>
> ⚠️ **`초기 데이터베이스 이름`을 비우면 `stream_db`가 생성되지 않습니다.**
> `추가 구성` 안에 접혀 있어 놓치기 쉽습니다. 누락 시 백엔드가
> `FATAL: database "stream_db" does not exist`로 죽습니다. 사후 조치는 12절 참고.

엔드포인트는 **데이터베이스 → `stream-db` → 연결 및 보안 탭**에서 확인합니다.
CloudShell에서는 아래로도 됩니다.

```bash
aws rds describe-db-instances --query 'DBInstances[].Endpoint.Address' --output text
```

---

## 6. IAM 역할 (EC2용)

**IAM → 역할 → 역할 생성 → AWS 서비스 → EC2**

- 권한 정책: **`AmazonSSMManagedInstanceCore`** (Session Manager 브라우저 접속용)
- 역할 이름: `stream-ec2-role`

자동 배포(11절)를 쓴다면 아티팩트 버킷 읽기 권한도 인라인 정책으로 추가합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::stream-deploy-artifacts-820273519659-ap-northeast-2-an/*"
    }
  ]
}
```

SSM Parameter Store에 시크릿을 두려면 아래 인라인 정책을 추가합니다. **2주 데모라면 생략하고
`backend/.env` 파일(권한 600)로 충분합니다.**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
      "Resource": "arn:aws:ssm:ap-northeast-2:820273519659:parameter/stream/*"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": { "StringEquals": { "kms:ViaService": "ssm.ap-northeast-2.amazonaws.com" } }
    }
  ]
}
```

---

## 7. EC2 인스턴스

**EC2 → 인스턴스 시작**

| 항목 | 값 |
|---|---|
| AMI | Ubuntu Server 24.04 LTS (x86) — **Pro 아님** |
| 인스턴스 유형 | `c7i-flex.large` |
| 키 페어 | 신규 생성 (`stream-key.pem`) |
| 서브넷 | `c7i-flex`를 지원하는 AZ (예: `ap-northeast-2c`) |
| 퍼블릭 IP 자동 할당 | 활성화 |
| 방화벽 | 기존 보안 그룹 → `stream-web` |
| 스토리지 | 20 GiB gp3 |
| 고급 → IAM 인스턴스 프로파일 | `stream-ec2-role` |

> ⚠️ **AMI를 바꾸면 보안 그룹·스토리지 설정이 초기화됩니다.** AMI를 먼저 확정한 뒤
> 나머지를 채우고, 시작 직전에 두 항목을 다시 확인하세요.
>
> ⚠️ `c7i-flex.large`는 일부 AZ에서 지원되지 않습니다. "이 인스턴스 유형이 지원되지
> 않습니다"가 뜨면 서브넷을 다른 AZ로 바꾸면 됩니다. **RDS와 AZ를 맞출 필요는 없습니다** —
> AZ 간 전송료는 이 규모에서 수 센트 수준입니다.

인스턴스 생성 후 **탄력적 IP를 할당해 연결**합니다(EC2 → 탄력적 IP). 연결하면 주소가
바뀌므로, **연결 후의 주소**를 발표 자료에 씁니다.

### 서버 접속

```bash
chmod 400 ~/Downloads/stream-key.pem
```

```bash
ssh -i ~/Downloads/stream-key.pem ubuntu@3.34.82.68
```

사용자명은 `ubuntu`입니다(`ec2-user` 아님).

---

## 8. 서버 세팅

### 패키지

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo apt install -y python3.12-venv python3-pip git nginx postgresql-client
```

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
```

### DB 연결 먼저 확인

코드를 올리기 전에 확인합니다. 여기서 막히면 뒤 작업이 전부 헛수고입니다.

```bash
psql "postgresql://stream_user:<암호>@stream-db.cbcysqsc2mc9.ap-northeast-2.rds.amazonaws.com:5432/stream_db" -c "select version()"
```

### 코드 전송

조직 정책으로 **GitHub Deploy key가 비활성화**되어 있어(`Disabled by sg-beaver`),
로컬에서 tarball을 만들어 전송하는 방식을 씁니다.

**로컬(맥북)에서:**

```bash
git fetch origin && git archive --format=tar.gz -o /tmp/stream-develop.tar.gz origin/develop
```

```bash
scp -i ~/Downloads/stream-key.pem /tmp/stream-develop.tar.gz ubuntu@3.34.82.68:/tmp/
```

**서버에서:**

```bash
sudo mkdir -p /opt/stream && sudo chown ubuntu:ubuntu /opt/stream
```

```bash
tar -xzf /tmp/stream-develop.tar.gz -C /opt/stream
```

> 서버에 `.git`이 없으므로 `git pull`은 쓸 수 없습니다. 업데이트는 11절 참고.
> 서버에서 git을 쓰려면 `gh` CLI를 설치해 `gh auth login`(device flow)으로 인증하는
> 방법이 있으나, 조직이 deploy key를 막아둔 만큼 OAuth 앱 승인이 필요할 수 있습니다.

### 백엔드

```bash
cd /opt/stream/backend && python3 -m venv .venv && .venv/bin/pip install --upgrade pip
```

```bash
cd /opt/stream/backend && .venv/bin/pip install -r requirements.txt
```

`ortools` 다운로드가 수백 MB라 몇 분 걸립니다.

### 환경 변수

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

`/opt/stream/backend/.env`를 만듭니다. 백엔드가 이 경로를 명시적으로 로드하므로
(`app/main.py`, `app/database.py`) 위치를 바꾸면 안 됩니다.

```
DATABASE_URL=postgresql://stream_user:<암호>@stream-db.cbcysqsc2mc9.ap-northeast-2.rds.amazonaws.com:5432/stream_db
SECRET_KEY=<위에서 생성한 64자>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=
GEMINI_API_KEY=
STREAM_ENV=production
```

```bash
chmod 600 /opt/stream/backend/.env
```

> AI 검토·챗봇이 쓰는 Gemini 모델은 `.env`에 적지 않습니다 — 코드 기본값
> (`gemini-3.7-flash`, #177)을 따릅니다. 특정 서버만 다른 모델로 돌려야 할 때만
> `REVIEW_MODEL`·`CHAT_MODEL`을 추가합니다.

> `CORS_ORIGINS`는 비워둡니다 — nginx가 프론트와 API를 같은 오리진으로 서빙하므로
> CORS가 발생하지 않습니다.

> `STREAM_ENV=production`은 `seed_mock_data.py --reset`(시드 테이블 11개 TRUNCATE)을
> 스크립트 차원에서 거부하게 하는 가드입니다. **이 값이 없으면 아무것도 막아주지
> 않습니다.** 운영 DB에서는 반드시 넣어 두세요.

### 시드 데이터

스크립트가 `create_all`로 테이블 생성까지 처리합니다. **`backend/` 안에서 실행하세요**
(스크립트가 `sys.path`를 현재 디렉토리 기준으로 잡습니다).

```bash
cd /opt/stream/backend && .venv/bin/python3 scripts/seed_mock_data.py
```

> ⚠️ 운영 중인 DB에 `--reset`을 붙이지 마세요. 기존 데이터가 전부 삭제됩니다.

> 이건 **최초 구축 때 한 번** 하는 작업입니다. 이후 `seed_data/*.csv`를 고쳤을 때
> 서버 DB에 반영하는 절차는 11절 [시드 데이터 갱신](#시드-데이터-갱신-자동-배포에-포함되지-않음)에 있습니다 —
> 자동 배포는 DB를 건드리지 않습니다.

### 프론트엔드 빌드

```bash
cd /opt/stream/frontend && npm ci && npm run build
```

```bash
sudo mkdir -p /var/www/stream && sudo cp -r /opt/stream/frontend/dist/* /var/www/stream/
```

빌드 시 "chunks larger than 500 kB" 경고가 뜨는데, gzip 후 약 274KB라 무시해도 됩니다.

---

## 9. systemd + nginx

### systemd

```bash
sudo tee /etc/systemd/system/stream.service > /dev/null <<'EOF'
[Unit]
Description=STREAM FastAPI backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/stream/backend
ExecStart=/opt/stream/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now stream
```

> `--workers 1`인 이유: 워커마다 ortools를 따로 메모리에 올리고, CP-SAT는 가용 코어를
> 전부 쓰기 때문에 2 vCPU에서 워커를 늘리면 서로 코어를 뺏습니다. 엔드포인트가 전부
> 동기 `def`라 FastAPI가 스레드풀에서 처리하므로 워커 1개로도 동시 요청은 받습니다.

### nginx

```bash
sudo tee /etc/nginx/sites-available/stream > /dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    root /var/www/stream;
    index index.html;

    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }

    location ~ ^/(docs|redoc|openapi.json) {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

```bash
sudo rm -f /etc/nginx/sites-enabled/default && sudo ln -sf /etc/nginx/sites-available/stream /etc/nginx/sites-enabled/stream
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

설정 의도:

| 항목 | 이유 |
|---|---|
| `proxy_read_timeout 180s` | CP-SAT 시간표 생성이 30초+ 걸림. nginx 기본 60초로는 부족할 수 있음 |
| `try_files $uri $uri/ /index.html` | React Router 경로(`/postings/3` 등) 새로고침 시 404 방지 |
| `location /api/`에 URI 없는 `proxy_pass` | 백엔드 라우터가 `/api` 접두사를 포함해 정의돼 있어 rewrite하면 안 됨 |
| `/docs` 프록시 | Swagger UI 확인용. 외부에 노출하고 싶지 않으면 이 블록만 삭제 |

---

## 10. 검증

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://3.34.82.68/
```

```bash
curl -s -X POST http://3.34.82.68/api/auth/login -H 'Content-Type: application/json' -d '{"id":"STF001","password":"stream1234","role":"staff"}'
```

토큰과 `"name":"박정보"`, `"department_id":2`가 나오면 nginx → uvicorn → RDS → JWT
전 구간이 정상입니다.

### 2026-08-28 실측 결과

| 항목 | 결과 |
|---|---|
| `GET /` (프론트) | 200 |
| `GET /postings` (SPA 폴백) | 200 |
| `GET /docs` | 200 |
| 로그인 (`STF001` / `20220081`) | 토큰 발급 성공 |
| `GET /api/postings` (인증) | 공고 6건 |
| 인증 없는 호출 | 401 |

**`POST /api/schedule/generate`** — `department_id: 2`, `start_date: 2026-08-31`,
`num_days: 14`, `time_limit_seconds: 30`, `semester_pattern: false`

| 항목 | 결과 |
|---|---|
| HTTP / 왕복 시간 | 200 / 30.20초 |
| Solver status | **`FEASIBLE`** (시간 제한 도달) |
| solve_time | 30.0초 |
| 배정 / 미충원 | 69건 / **0건** |
| 페널티 | preference_match 579 · meal_break 420 · preferred_staffing 320 · contiguity 276 · fair_hours 132 |
| uvicorn 메모리 피크 | 152 MB (전체 3813MB 중 713MB 사용) |
| vCPU | 2 |

LOG.md의 로컬 2주 샘플 기록(`FEASIBLE, 30.04s`)과 동일한 양상입니다. 두 환경 모두
30초 제한에서 조기 종료되므로, 코어 수 차이로 결과가 갈리는 문제는 나타나지 않았습니다.

> **시연 시 유의** — 생성 요청은 실제로 30초간 응답이 없습니다. 라이브로 돌리기보다
> 미리 생성해둔 draft 배치의 결과 화면부터 보여주는 편이 안전합니다. 같은 부서·기간의
> draft는 재실행 시 교체되므로 배치가 쌓이지 않습니다(confirmed 배치는 보존).

---

## 11. 코드 업데이트

### 자동 배포 (기본 경로)

`develop`에 푸시되면 **GitHub Actions가 자동으로 배포**합니다.
설정은 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

```
git push (develop)
      │
      ▼
GitHub Actions
  ├─ npm ci && npm run build          ← 프론트는 CI에서 빌드 (서버에서 빌드하지 않음)
  ├─ backend + dist 를 tarball로 패키징
  ├─ OIDC로 AWS 역할 assume            ← 저장된 액세스 키 없음
  ├─ aws s3 cp → 아티팩트 버킷
  └─ aws ssm send-command ────────────┐
                                      │  (인바운드 포트 개방 불필요)
      ┌───────────────────────────────┘
      ▼
EC2: infra/ssm-deploy.sh 실행
  → S3에서 아티팩트 수령 → rsync 배치 → (변경 시) pip install
  → 정적 파일 교체 → systemctl restart stream → 헬스체크
```

설계 원칙 세 가지:

| 원칙 | 구현 |
|---|---|
| 서버가 코드를 당겨오지 않는다 | CI가 빌드한 아티팩트를 S3 경유로 전달. 서버에 리포 자격 증명이 필요 없음 |
| 장기 자격 증명을 저장하지 않는다 | GitHub Secrets에 AWS 키를 두지 않고 **OIDC**로 실행 시점에 역할을 빌림 |
| 배포에 인바운드 포트를 열지 않는다 | SSH 대신 **SSM Run Command**. 서버가 아웃바운드로 명령을 받아감 |

관련 AWS 리소스:

| 리소스 | 이름 |
|---|---|
| 아티팩트 버킷 | `stream-deploy-artifacts-820273519659-ap-northeast-2-an` |
| OIDC 공급자 | `token.actions.githubusercontent.com` (Audience `sts.amazonaws.com`) |
| Actions 역할 | `stream-deploy` — 신뢰 정책이 `repo:sg-beaver/stream:ref:refs/heads/develop` 로 제한됨 |
| EC2 역할 | `stream-ec2-role` — `AmazonSSMManagedInstanceCore` + 아티팩트 버킷 `s3:GetObject` |

`rsync --delete`는 서버에만 있는 자산(`.venv`, `.env`, `output`)을 제외합니다.
SSM은 root로 실행되므로 배포 후 `chown -R ubuntu:ubuntu`로 소유권을 되돌립니다.

### 수동 배포 (Actions를 못 쓸 때)

로컬에서 SSH로 직접 배포합니다. 브랜치를 골라 배포할 수 있어 검증용으로도 씁니다.

```bash
./infra/deploy.sh                 # origin/develop
```

```bash
./infra/deploy.sh feat-something  # 특정 브랜치
```

대상 서버나 키 경로가 다르면 환경 변수로 바꿉니다.

```bash
STREAM_HOST=1.2.3.4 STREAM_KEY=~/keys/stream.pem ./infra/deploy.sh
```

의존성·프론트 소스의 해시를 비교해 **바뀐 경우에만** `pip install` / `npm run build`를
수행하고, 끝나면 헬스체크까지 합니다.

> ⚠️ **이 경로는 SSH를 쓰는데 22번 포트는 현재 닫혀 있습니다.** 쓰려면 `stream-web`
> 인바운드에 SSH(소스 `내 IP`) 규칙을 임시로 추가하고, 작업이 끝나면 다시 지우세요.

### 시드 데이터 갱신 (자동 배포에 포함되지 않음)

**자동 배포는 코드만 옮깁니다.** `infra/ssm-deploy.sh`가 하는 일은 `backend/` rsync ·
정적 파일 교체 · `systemctl restart` 셋뿐이고, 마이그레이션도 시드도 없습니다.
DB는 EC2 밖 RDS에 있는 별도 자산이라 배포와 수명주기가 다릅니다.

| 대상 | 갱신 주체 | `develop` 푸시로 갱신되나 |
|---|---|---|
| 프론트 정적 파일 | GitHub Actions | ✅ |
| 백엔드 코드 | GitHub Actions | ✅ |
| `.env` · `.venv` | 서버 로컬 (수동) | ❌ (rsync `--exclude` 대상) |
| **DB 데이터 (RDS)** | **수동 시드 / psql** | ❌ |

그래서 `backend/scripts/seed_data/*.csv`에 계정을 추가하고 `develop`에 머지해도
**서버에 올라가는 건 CSV 파일일 뿐 DB 행이 되지 않습니다.** 새 계정으로 배포 서버에
로그인하면 401이 납니다.

#### 절차

Session Manager로 접속해(위 [서버 접속이 필요한 경우](#서버-접속이-필요한-경우))
먼저 현재 상태를 확인합니다.

```bash
sudo -u ubuntu bash -c 'cd /opt/stream/backend && .venv/bin/python3 -c "from app.database import SessionLocal, DATABASE_URL; from app import models; print(DATABASE_URL.split(\"@\")[-1]); db=SessionLocal(); print(\"dept6:\", db.query(models.Department).filter_by(department_id=6).first()); print(\"students:\", db.query(models.Student).count())"'
```

부서가 없든, 있는데 인원이 옛 시드에 멈춰 있든 같은 명령입니다. `--only`는
**빠진 행만 채웁니다** — 이미 있는 행은 건드리지 않으므로 몇 번을 돌려도 안전합니다.

```bash
sudo -u ubuntu bash -c 'cd /opt/stream/backend && .venv/bin/python3 scripts/seed_mock_data.py --only aat-dept'
```

무엇을 채웠는지 그대로 찍힙니다. 예:

```
아트&테크놀로지학과-test(부서 7) 채움 — 학생 2 · 지원서 2 · 가능시간 8 · 수업시간 10. 기존 행은 건드리지 않았습니다.
아트&테크놀로지학과-test(부서 7) 부서 값 갱신 — headcount_to, course_ta_enabled (시드 CSV 기준으로 맞췄습니다)
```

이미 맞으면 `— 이미 최신 시드와 같습니다. 바꾼 것이 없습니다.`가 나옵니다.
**시드 CSV를 고쳐 `develop`에 머지할 때마다 이 명령을 돌리면 서버가 따라옵니다.**

> `sudo -u ubuntu`를 붙이는 이유 — Session Manager는 `ssm-user`로 붙는데 서비스 실행
> 계정은 `ubuntu`입니다. 그냥 실행하면 `__pycache__`가 root 소유로 남습니다.

#### 무엇을 덮고 무엇을 안 덮나

| 대상 | 동작 |
|---|---|
| `department` 행의 시드 소유 값 (이름·상한·정원·`course_ta_enabled`) | **CSV 기준으로 맞춤** — 검증용 부서를 정의하는 값이 CSV다 |
| `department_policy` (개관 시간·근무 슬롯·중요도·AI 규칙) | 없을 때만 생성. **담당자가 화면에서 고치는 값이라 덮지 않는다** |
| 직원·학생·공고·지원서 | 없는 것만 추가. 이미 있는 행의 내용은 그대로 |
| 가능시간·수업시간·날짜 예외 | 그 학생이 **한 행도 없을 때만** 넣는다. 자연 키가 없어 다시 넣으면 중복이 되고, 학생이 직접 낸 시간을 덮게 된다 |
| 개설 과목·과목 TA | `(학기, 과목번호, 분반)`·`(과목, 학생)` 기준으로 없는 것만 |

#### 주의

- **운영 DB에 `--reset`을 쓰지 마세요.** 시드 테이블 11개를 `TRUNCATE`하며, 복구 수단은
  RDS 자동 백업(보존 1일)뿐입니다. `.env`에 `STREAM_ENV=production`이 있어야 스크립트
  가드가 걸립니다 — 없으면 아무것도 막아주지 않습니다 (8절 환경 변수 참고).
- **`--only`는 검증용 부서(`test-dept`·`aat-dept`·`grad-edu-dept`)만 지원합니다.**
  부서 1~5에 학생을 추가한 경우 멱등 경로가 없습니다 — `psql`로 직접 INSERT하거나
  `TEST_DEPARTMENTS`에 항목을 추가해야 합니다.
- **모델에 컬럼을 추가했다면 값도 확인하세요.** `schema_patches`가 컬럼은 자동으로
  붙이지만 **기본값으로 붙습니다.** 시드가 채우는 값이면 위 명령을 함께 돌려야 하고,
  아니면 `psql`로 채워야 합니다. 실제로 `course_ta_enabled`가 전 부서 `false`로 남아
  수업 조교 메뉴가 어느 부서에서도 안 보인 적이 있습니다 (2026-08-29).

#### 검증

```bash
curl -s -X POST http://3.34.82.68/api/auth/login -H 'Content-Type: application/json' -d '{"id":"20261005","password":"stream1234","role":"student"}'
```

`"name":"김찬우"` · `"department_id":6` · `"is_team_lead":true`가 나오면 반영된 것입니다.
공고 목록에 7번(`2026학년도 정보서비스팀-test 근로학생 모집`)이 보이는지도 함께 확인하세요.

> **실제 사례 (2026-08-29)** — 부서 6 시드가 커밋 `eab3e82`에서 추가됐지만 서버 수동
> 시드가 누락돼, 배포는 계속 성공하는데 `20261005`·`STF010` 로그인만 401이 났습니다.
> 공고 목록에 7번이 없는 것으로 원인을 확인했고 위 절차로 해소했습니다.

---

## 12. 트러블슈팅

실제로 겪은 것들입니다.

| 증상 | 원인 | 해결 |
|---|---|---|
| RDS 생성 실패: `backup retention period exceeds the maximum available to free tier` | 무료 플랜 상한 | 백업 보존 기간을 **1일**로 |
| 인스턴스 유형 목록에 `t3.medium`이 없음 | 무료 플랜 제약 | `c7i-flex.large` 선택, 또는 유료 플랜 업그레이드 |
| `ap-northeast-2a에서 이 인스턴스 유형이 지원되지 않습니다` | AZ별 배치 차이 | 서브넷을 `2c` 등으로 변경 |
| Session Manager 연결 실패 (`SSM Agent unable to acquire credentials`) | 역할은 붙어 있으나 **`AmazonSSMManagedInstanceCore` 정책이 없음** | 아래 진단 참고 |
| Actions 실패: `Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity` | 역할 ARN 오타·역할 부재, OIDC 공급자 미생성, 또는 `sub` 조건 불일치 | AWS는 셋을 구분해주지 않는다. **역할이 실제로 존재하는지 이름부터 확인**하고, 신뢰 정책의 `sub`를 `repo:sg-beaver/stream:*`로 잠시 넓혀 브랜치 조건을 배제해본다 |
| `ssh: connect to host ... port 22: Operation timed out` | 보안 그룹 SSH 소스가 현재 IP와 불일치 | `stream-web` 인바운드 규칙 → SSH 소스를 `내 IP`로 재선택 |
| `database "stream_db" does not exist` | RDS 생성 시 초기 DB 이름 누락 | 아래 명령으로 생성 |
| GitHub `Deploy keys — Disabled by sg-beaver` | 조직 정책 | tarball 전송 방식 사용 (8절) |
| SSM 실행 실패: `set: Illegal option -o pipefail` | **SSM은 명령을 `sh`(dash)로 실행한다.** bash 문법을 쓴 스크립트가 그대로 전달되면 죽는다 | 스크립트를 base64로 실어 보낸 뒤 `bash`로 명시 실행 (`deploy.yml` 참고) |
| `ModuleNotFoundError: No module named 'app'` | `backend/` 밖에서 uvicorn 실행 | `WorkingDirectory=/opt/stream/backend` 확인 |
| 시간표 생성이 504로 끊김 | nginx 프록시 타임아웃 | `proxy_read_timeout` 상향 |
| 배포는 성공하는데 새로 추가한 시드 계정만 로그인 401 | **배포는 코드만 옮긴다.** DB 시드는 자동화돼 있지 않음 | 11절 [시드 데이터 갱신](#시드-데이터-갱신-자동-배포에-포함되지-않음) 절차로 서버에서 수동 시드 |

초기 DB 누락 시:

```bash
psql "postgresql://stream_user:<암호>@stream-db.cbcysqsc2mc9.ap-northeast-2.rds.amazonaws.com:5432/postgres" -c "CREATE DATABASE stream_db OWNER stream_user"
```

### SSM 연결 실패 진단

콘솔 에러 메시지("instance management role is not configured")는 원인을 가리지 못합니다.
**서버의 에이전트 로그를 직접 보는 게 가장 빠릅니다.**

```bash
sudo tail -20 /var/log/amazon/ssm/amazon-ssm-agent.log
```

실제로 나왔던 줄:

```
is not authorized to perform: ssm:UpdateInstanceInformation
because no identity-based policy allows the ssm:UpdateInstanceInformation action
```

역할은 정상적으로 붙어 있었고(IMDS가 `stream-ec2-role` 반환), **그 역할에
`AmazonSSMManagedInstanceCore`가 없었던 것**이 원인이었습니다. 정책을 붙인 뒤
에이전트를 재시작하면 즉시 연결됩니다(그냥 두면 약 30분 주기로 재시도).

```bash
sudo snap restart amazon-ssm-agent
```

자격 증명 자체가 오는지 확인하려면:

```bash
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60") && curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

역할 이름이 나오면 프로파일 연결은 정상이므로, 문제는 **정책 쪽**입니다.

### 포트 연결 진단 요령

외부에서 포트별 응답을 구분하면 원인이 빨리 좁혀집니다.

```bash
nc -vz 3.34.82.68 80
```

- **`Connection refused`** — 패킷이 인스턴스까지 도달함. 보안 그룹·라우팅·퍼블릭 IP는 정상이고,
  해당 포트에 아무것도 리스닝하지 않는 것뿐
- **무응답(timeout)** — 보안 그룹이 드롭 중. 인바운드 규칙을 확인

---

## 13. 비용과 정리

16일(8/27~9/11) 기준 대략치입니다.

| 항목 | 비용 |
|---|---|
| `c7i-flex.large` (24시간 가동) | ~$37 |
| RDS `db.t4g.micro` + 스토리지 | ~$9 |
| 탄력적 IP + EBS 20GB | ~$3 |
| **합계** | **~$49** |

> 계정 예산 알림(AWS Budgets)을 먼저 걸어두세요.

### 발표 종료 후 정리 체크리스트

1. EC2 인스턴스 **종료(Terminate)** — 중지가 아님
2. RDS: 수동 스냅샷 → `수정`에서 **삭제 방지 해제** → 삭제
3. **탄력적 IP 릴리스** — 인스턴스를 지워도 EIP가 남아 있으면 미사용 요금이 붙습니다
4. EBS 볼륨·스냅샷 확인 후 삭제
5. 다음 날 Cost Explorer에서 $0에 수렴하는지 확인

---

## 14. 미적용 항목

2주 데모 범위를 벗어나 의도적으로 넣지 않은 것들입니다. 서비스를 계속 운영한다면
아래를 먼저 검토해야 합니다.

- **HTTPS** — 현재 http. 도메인 + Let's Encrypt(certbot) 필요
- **DB 마이그레이션** — Alembic 미도입. 현재는 `Base.metadata.create_all` +
  `apply_schema_patches`로 첫 부팅 시 생성만 하므로, **컬럼 변경·삭제는 반영되지 않습니다**.
  제약 해제·컬럼 이름 변경이 필요해지면서 `schema_patches._STATEMENTS`에 멱등 DDL을
  손으로 쌓기 시작했는데(#156), 버전 추적도 롤백도 없어 늘어나면 관리가 어렵습니다
- **학생팀장 초기 지정** — `student.is_team_lead`는 기본값 `false`로 추가되고 백필이
  없습니다. 배포 직후에는 학생팀장이 한 명도 없으므로, 직원 계정으로
  `PATCH /api/students/{학번}/team-lead`를 한 번 호출해 지정해야 합니다 (#156)
- **운영 DB 시드 주의** — `seed_mock_data.py --reset`은 시드 테이블 11개를 통째로
  TRUNCATE합니다. `STREAM_ENV=production`이면 거부하도록 막아뒀지만, 서버
  `.env`에 그 값이 없으면 가드가 걸리지 않습니다. 검증용 부서를 붙일 때는 기존
  데이터를 건드리지 않는 `--only` 를 쓰세요 (부서 하나씩, **빠진 행만 채우므로 여러 번
  돌려도 안전**합니다 — 자세한 규칙은 11절 [시드 데이터 갱신](#시드-데이터-갱신-자동-배포에-포함되지-않음)):

  ```bash
  cd /opt/stream/backend && .venv/bin/python3 scripts/seed_mock_data.py --only test-dept
  ```

  | `--only` 값 | 부서 |
  |---|---|
  | `test-dept` | 정보서비스팀-test (6) — 운영 시트 전사 데이터 |
  | `aat-dept` | 아트&테크놀로지학과-test (7) — 수업 조교, 교비 22명 |
  | `grad-edu-dept` | 교육대학원 행정팀-test (8) — 야간 운영, 교비 10명 |
- **시크릿 관리** — `.env` 평문 파일. SSM Parameter Store로 옮기면 6절의 인라인 정책 사용
- **동시 생성 제한** — 2 vCPU에서 시간표 생성 요청이 동시에 들어오면 CP-SAT가 코어를
  나눠 쓰게 됩니다. 부서별 락이나 작업 큐가 필요할 수 있습니다
- **로깅** — solver의 objective 값이 journald에 남지 않습니다. uvicorn 기본 로그 설정이
  앱 로거 INFO를 전달하지 않기 때문입니다
