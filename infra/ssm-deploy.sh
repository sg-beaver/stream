#!/usr/bin/env bash
#
# 서버에서 실행되는 배포 스크립트 (SSM Run Command로 root 권한 실행).
#
# 이 파일 앞에 워크플로가 BUCKET / KEY / REGION 변수를 붙여서 전달한다.
# 직접 실행할 일은 없고, .github/workflows/deploy.yml 이 호출한다.
#
# 로컬에서 손으로 배포할 때는 infra/deploy.sh 를 쓴다.
#
set -euo pipefail
export PATH=/snap/bin:/usr/local/bin:$PATH

APP_DIR=/opt/stream
WEB_ROOT=/var/www/stream

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "▸ 아티팩트 수령: s3://$BUCKET/$KEY"
aws s3 cp "s3://$BUCKET/$KEY" "$TMP/artifact.tar.gz" --region "$REGION" --quiet
mkdir -p "$TMP/unpack"
tar -xzf "$TMP/artifact.tar.gz" -C "$TMP/unpack"

# ── 백엔드 ─────────────────────────────────────────────────────────
# .venv 와 .env 는 서버에만 있는 자산이므로 --delete 대상에서 제외한다.
REQ_BEFORE=$(md5sum "$APP_DIR/backend/requirements.txt" 2>/dev/null | cut -d' ' -f1 || echo none)

rsync -a --delete \
  --exclude '.venv' \
  --exclude '.env' \
  --exclude '__pycache__' \
  --exclude 'output' \
  "$TMP/unpack/backend/" "$APP_DIR/backend/"

REQ_AFTER=$(md5sum "$APP_DIR/backend/requirements.txt" | cut -d' ' -f1)
if [ "$REQ_BEFORE" != "$REQ_AFTER" ]; then
  echo "▸ requirements.txt 변경 → pip install"
  "$APP_DIR/backend/.venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"
else
  echo "▸ requirements.txt 변경 없음 → pip 건너뜀"
fi

# SSM은 root로 실행되므로, 서비스 실행 계정(ubuntu)이 쓸 수 있게 소유권을 되돌린다.
chown -R ubuntu:ubuntu "$APP_DIR"

# ── 프론트엔드 (CI에서 이미 빌드된 산출물) ──────────────────────────
echo "▸ 정적 파일 교체"
rm -rf "${WEB_ROOT:?}"/*
cp -r "$TMP/unpack/dist/." "$WEB_ROOT/"

# ── 재시작 ─────────────────────────────────────────────────────────
echo "▸ 백엔드 재시작"
systemctl restart stream
sleep 3

if ! systemctl is-active --quiet stream; then
  echo "✗ 서비스가 올라오지 않았습니다"
  journalctl -u stream -n 40 --no-pager
  exit 1
fi

echo "$KEY" > "$APP_DIR/DEPLOYED_COMMIT"
echo "✓ 배포 완료"
