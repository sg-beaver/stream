# AWS 배포 가이드

2026-08-27 ~ 28에 실제로 수행한 배포 절차입니다. 발표(9/4)·수상자 발표(9/11)를 위한
**2주 한정 데모 환경** 기준으로 작성했고, 장기 운영을 전제로 하지 않습니다.

로컬 개발 환경 세팅은 [DEV_SETUP.md](DEV_SETUP.md)를 보세요. 이 문서는 서버에 올리는 것만 다룹니다.

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
4. 생성 후 **콘솔 로그인 URL** 저장 → `https://<계정ID>.signin.aws.amazon.com/console`
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
      │  http://<탄력적 IP>
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
| SSH | 22 | **내 IP** |

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

SSM Parameter Store에 시크릿을 두려면 인라인 정책을 추가합니다. **2주 데모라면 생략하고
`backend/.env` 파일(권한 600)로 충분합니다.**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
      "Resource": "arn:aws:ssm:ap-northeast-2:<계정ID>:parameter/stream/*"
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
ssh -i ~/Downloads/stream-key.pem ubuntu@<탄력적 IP>
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
psql "postgresql://stream_user:<암호>@<엔드포인트>:5432/stream_db" -c "select version()"
```

### 코드 전송

조직 정책으로 **GitHub Deploy key가 비활성화**되어 있어(`Disabled by sg-beaver`),
로컬에서 tarball을 만들어 전송하는 방식을 씁니다.

**로컬(맥북)에서:**

```bash
git fetch origin && git archive --format=tar.gz -o /tmp/stream-develop.tar.gz origin/develop
```

```bash
scp -i ~/Downloads/stream-key.pem /tmp/stream-develop.tar.gz ubuntu@<탄력적 IP>:/tmp/
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
DATABASE_URL=postgresql://stream_user:<암호>@<엔드포인트>:5432/stream_db
SECRET_KEY=<위에서 생성한 64자>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=
GEMINI_API_KEY=
```

```bash
chmod 600 /opt/stream/backend/.env
```

> `CORS_ORIGINS`는 비워둡니다 — nginx가 프론트와 API를 같은 오리진으로 서빙하므로
> CORS가 발생하지 않습니다.

### 시드 데이터

스크립트가 `create_all`로 테이블 생성까지 처리합니다. **`backend/` 안에서 실행하세요**
(스크립트가 `sys.path`를 현재 디렉토리 기준으로 잡습니다).

```bash
cd /opt/stream/backend && .venv/bin/python3 scripts/seed_mock_data.py
```

> ⚠️ 운영 중인 DB에 `--reset`을 붙이지 마세요. 기존 데이터가 전부 삭제됩니다.

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
curl -s -o /dev/null -w "%{http_code}\n" http://<탄력적 IP>/
```

```bash
curl -s -X POST http://<탄력적 IP>/api/auth/login -H 'Content-Type: application/json' -d '{"id":"STF001","password":"stream1234","role":"staff"}'
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

**로컬에서 tarball 재생성 → 전송:**

```bash
git fetch origin && git archive --format=tar.gz -o /tmp/stream-develop.tar.gz origin/develop
```

```bash
scp -i ~/Downloads/stream-key.pem /tmp/stream-develop.tar.gz ubuntu@<탄력적 IP>:/tmp/
```

**서버에서 반영:**

```bash
tar -xzf /tmp/stream-develop.tar.gz -C /opt/stream
```

```bash
sudo systemctl restart stream && sudo systemctl status stream --no-pager
```

백엔드 의존성이 바뀌었으면 `pip install -r requirements.txt`를, 프론트를 고쳤으면
`npm run build` 후 `/var/www/stream`으로 다시 복사해야 합니다.

```bash
cd /opt/stream/frontend && npm run build && sudo cp -r dist/* /var/www/stream/
```

---

## 12. 트러블슈팅

실제로 겪은 것들입니다.

| 증상 | 원인 | 해결 |
|---|---|---|
| RDS 생성 실패: `backup retention period exceeds the maximum available to free tier` | 무료 플랜 상한 | 백업 보존 기간을 **1일**로 |
| 인스턴스 유형 목록에 `t3.medium`이 없음 | 무료 플랜 제약 | `c7i-flex.large` 선택, 또는 유료 플랜 업그레이드 |
| `ap-northeast-2a에서 이 인스턴스 유형이 지원되지 않습니다` | AZ별 배치 차이 | 서브넷을 `2c` 등으로 변경 |
| Session Manager 연결 실패 (`SSM Agent unable to acquire credentials`) | 에이전트가 인스턴스 프로파일 자격 증명을 못 잡음 | 역할에 `AmazonSSMManagedInstanceCore` 확인 → 재부팅. 안 되면 SSH로 우회 |
| `ssh: connect to host ... port 22: Operation timed out` | 보안 그룹 SSH 소스가 현재 IP와 불일치 | `stream-web` 인바운드 규칙 → SSH 소스를 `내 IP`로 재선택 |
| `database "stream_db" does not exist` | RDS 생성 시 초기 DB 이름 누락 | 아래 명령으로 생성 |
| GitHub `Deploy keys — Disabled by sg-beaver` | 조직 정책 | tarball 전송 방식 사용 (8절) |
| `ModuleNotFoundError: No module named 'app'` | `backend/` 밖에서 uvicorn 실행 | `WorkingDirectory=/opt/stream/backend` 확인 |
| 시간표 생성이 504로 끊김 | nginx 프록시 타임아웃 | `proxy_read_timeout` 상향 |

초기 DB 누락 시:

```bash
psql "postgresql://stream_user:<암호>@<엔드포인트>:5432/postgres" -c "CREATE DATABASE stream_db OWNER stream_user"
```

### 포트 연결 진단 요령

외부에서 포트별 응답을 구분하면 원인이 빨리 좁혀집니다.

```bash
nc -vz <탄력적 IP> 80
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
  `apply_schema_patches`로 첫 부팅 시 생성만 하므로, **컬럼 변경·삭제는 반영되지 않습니다**
- **시크릿 관리** — `.env` 평문 파일. SSM Parameter Store로 옮기면 6절의 인라인 정책 사용
- **배포 자동화** — GitHub Actions 워크플로 없음. 손배포
- **동시 생성 제한** — 2 vCPU에서 시간표 생성 요청이 동시에 들어오면 CP-SAT가 코어를
  나눠 쓰게 됩니다. 부서별 락이나 작업 큐가 필요할 수 있습니다
- **로깅** — solver의 objective 값이 journald에 남지 않습니다. uvicorn 기본 로그 설정이
  앱 로거 INFO를 전달하지 않기 때문입니다
