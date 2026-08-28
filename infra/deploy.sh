#!/usr/bin/env bash
#
# STREAM 배포 스크립트 (로컬 → EC2)
#
# 조직 정책으로 GitHub Deploy key가 막혀 있어, 서버가 리포를 직접 당겨오지 않고
# 로컬에서 만든 아티팩트를 밀어넣는 방식이다. 자세한 배경은 docs/DEPLOY.md 참고.
#
# 사용법:
#   ./infra/deploy.sh                 # origin/develop 배포
#   ./infra/deploy.sh feat-something  # 특정 브랜치 배포
#
# 환경 변수로 대상 변경 가능:
#   STREAM_HOST=1.2.3.4 STREAM_KEY=~/keys/stream.pem ./infra/deploy.sh
#
set -euo pipefail

BRANCH="${1:-develop}"
HOST="${STREAM_HOST:-3.34.82.68}"
KEY="${STREAM_KEY:-$HOME/Downloads/stream-key.pem}"
USER="${STREAM_USER:-ubuntu}"
APP_DIR="/opt/stream"
WEB_ROOT="/var/www/stream"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT="$(mktemp -t stream-deploy).tar.gz"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() { rm -f "$ARTIFACT"; }
trap cleanup EXIT

[[ -f "$KEY" ]] || fail "키 파일을 찾을 수 없습니다: $KEY  (STREAM_KEY로 경로 지정 가능)"

# ── 1. 아티팩트 생성 ────────────────────────────────────────────────
log "origin/$BRANCH 최신 내려받는 중"
git -C "$REPO_ROOT" fetch origin "$BRANCH" --quiet \
  || fail "브랜치를 찾을 수 없습니다: origin/$BRANCH"

COMMIT="$(git -C "$REPO_ROOT" rev-parse --short "origin/$BRANCH")"
SUBJECT="$(git -C "$REPO_ROOT" log -1 --format=%s "origin/$BRANCH")"
log "배포 대상: $BRANCH @ $COMMIT — $SUBJECT"

# 추적 파일만 담긴다 (.venv, node_modules, .env는 제외됨)
git -C "$REPO_ROOT" archive --format=tar.gz -o "$ARTIFACT" "origin/$BRANCH"
log "아티팩트 $(du -h "$ARTIFACT" | cut -f1)"

# ── 2. 전송 ────────────────────────────────────────────────────────
log "$HOST 로 전송 중"
scp "${SSH_OPTS[@]}" -q "$ARTIFACT" "$USER@$HOST:/tmp/stream-deploy.tar.gz" \
  || fail "전송 실패 — 보안 그룹 SSH(22) 규칙에 현재 IP가 등록돼 있는지 확인하세요"

# ── 3. 서버에서 반영 ────────────────────────────────────────────────
# 의존성 파일의 해시를 비교해, 바뀐 경우에만 pip/npm을 돌린다.
log "서버에 반영 중"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "COMMIT='$COMMIT' bash -s" <<'REMOTE'
set -euo pipefail
APP_DIR=/opt/stream
WEB_ROOT=/var/www/stream

hash_of() { [[ -f "$1" ]] && md5sum "$1" | cut -d' ' -f1 || echo "none"; }

REQ_BEFORE=$(hash_of "$APP_DIR/backend/requirements.txt")
LOCK_BEFORE=$(hash_of "$APP_DIR/frontend/package-lock.json")
FE_BEFORE=$(cd "$APP_DIR/frontend/src" 2>/dev/null && find . -type f -exec md5sum {} + | sort | md5sum || echo "none")

tar -xzf /tmp/stream-deploy.tar.gz -C "$APP_DIR"

REQ_AFTER=$(hash_of "$APP_DIR/backend/requirements.txt")
LOCK_AFTER=$(hash_of "$APP_DIR/frontend/package-lock.json")
FE_AFTER=$(cd "$APP_DIR/frontend/src" && find . -type f -exec md5sum {} + | sort | md5sum)

if [[ "$REQ_BEFORE" != "$REQ_AFTER" ]]; then
  echo "  requirements.txt 변경 → pip install"
  "$APP_DIR/backend/.venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"
else
  echo "  requirements.txt 변경 없음 → pip 건너뜀"
fi

if [[ "$LOCK_BEFORE" != "$LOCK_AFTER" ]]; then
  echo "  package-lock.json 변경 → npm ci"
  (cd "$APP_DIR/frontend" && npm ci --silent)
fi

if [[ "$LOCK_BEFORE" != "$LOCK_AFTER" || "$FE_BEFORE" != "$FE_AFTER" ]]; then
  echo "  프론트 변경 → 빌드"
  (cd "$APP_DIR/frontend" && npm run build)
  sudo rm -rf "${WEB_ROOT:?}"/*
  sudo cp -r "$APP_DIR/frontend/dist/"* "$WEB_ROOT/"
else
  echo "  프론트 변경 없음 → 빌드 건너뜀"
fi

echo "  백엔드 재시작"
sudo systemctl restart stream

echo "$COMMIT" | sudo tee "$APP_DIR/DEPLOYED_COMMIT" > /dev/null
rm -f /tmp/stream-deploy.tar.gz
REMOTE

# ── 4. 헬스체크 ────────────────────────────────────────────────────
log "헬스체크"
for i in $(seq 1 10); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$HOST/" || true)
  API=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$HOST/api/postings" || true)
  # /api/postings는 인증이 필요하므로 401이 정상 응답(= 백엔드 살아 있음)
  if [[ "$CODE" == "200" && "$API" == "401" ]]; then
    printf '\033[1;32m✓\033[0m 배포 완료 — %s @ %s\n' "$BRANCH" "$COMMIT"
    printf '  http://%s\n' "$HOST"
    exit 0
  fi
  sleep 2
done

fail "헬스체크 실패 (프론트 $CODE / API $API) — 서버 로그: ssh -i $KEY $USER@$HOST 'sudo journalctl -u stream -n 50 --no-pager'"
