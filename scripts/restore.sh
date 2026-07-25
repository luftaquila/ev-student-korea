#!/usr/bin/env bash
#
# EV 허브 데이터 복원
#
# 사용법:
#   ./scripts/restore.sh backups/ev-backup-20260725-120000.zip
#
# 실행 중인 컨테이너를 먼저 멈춰야 한다 — 열린 DB 파일을 덮어쓰면 WAL과 어긋나
# 손상된다. 스크립트가 확인을 받고 직접 멈춘 뒤 복원하고 다시 띄운다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIPFILE="${1:-}"
PROFILE="${PROFILE:-production}"

if [ -z "$ZIPFILE" ] || [ ! -f "$ZIPFILE" ]; then
  echo "사용법: ./scripts/restore.sh <백업파일.zip>" >&2
  exit 1
fi

if ! command -v unzip &>/dev/null; then
  echo "error: unzip이 필요합니다." >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

unzip -q "$ZIPFILE" -d "$TMPDIR"

if [ ! -d "$TMPDIR/db" ]; then
  echo "error: 백업 파일에 db/ 디렉터리가 없습니다." >&2
  exit 1
fi

echo "=== 복원 대상 ==="
ls -1 "$TMPDIR/db"
echo ""
echo "현재 데이터를 덮어씁니다. 계속하려면 'yes'를 입력하세요."
read -r answer
[ "$answer" = "yes" ] || { echo "취소했습니다."; exit 1; }

# 서비스 이름 → DB 경로 (backup.sh의 SQLITE_DBS와 동일하게 유지한다)
declare -A DB_PATHS=(
  [auth]="auth/data/auth.db"
  [queue]="queue/data/queue.db"
)

echo "컨테이너 정지…"
(cd "$ROOT" && podman compose --profile "$PROFILE" down) || true

for src in "$TMPDIR"/db/*.db; do
  name="$(basename "$src" .db)"
  target="${DB_PATHS[$name]:-}"
  if [ -z "$target" ]; then
    echo "  skip: $name (알 수 없는 서비스)"
    continue
  fi
  echo "  restore: $name → $target"
  mkdir -p "$ROOT/$(dirname "$target")"
  # -wal/-shm을 남기면 복원한 DB와 어긋난 저널이 적용되어 데이터가 되돌아간다
  rm -f "$ROOT/$target" "$ROOT/$target-wal" "$ROOT/$target-shm"
  cp "$src" "$ROOT/$target"
done

echo "컨테이너 재기동…"
(cd "$ROOT" && podman compose --profile "$PROFILE" up -d)

echo ""
echo "=== 복원 완료 ==="
