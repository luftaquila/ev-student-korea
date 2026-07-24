#!/usr/bin/env bash
#
# EV 허브 데이터 백업
#
# 사용법:
#   ./scripts/backup.sh                   # ./backups/ 에 저장
#   ./scripts/backup.sh /path/to/dir      # 지정 디렉터리에 저장
#
# SQLite online backup API(.backup)를 쓴다 — WAL 모드에서 서비스를 멈추지 않고도
# 일관된 스냅샷을 얻는다. 파일을 그냥 cp하면 -wal에 남은 커밋이 빠져 깨질 수 있다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_NAME="ev-backup-$TIMESTAMP"
TMPDIR="$(mktemp -d)"

trap 'rm -rf "$TMPDIR"' EXIT

if ! command -v sqlite3 &>/dev/null; then
  echo "error: sqlite3 CLI가 필요합니다. (apt install sqlite3 / brew install sqlite)" >&2
  exit 1
fi

# 서비스를 추가하면 여기에 "이름:DB경로" 한 줄만 더한다
SQLITE_DBS=(
  "auth:auth/data/auth.db"
  # "queue:queue/data/queue.db"
)

echo "=== EV 백업 시작: $BACKUP_NAME ==="
mkdir -p "$TMPDIR/db"

for entry in "${SQLITE_DBS[@]}"; do
  name="${entry%%:*}"
  dbpath="$ROOT/${entry#*:}"

  if [ ! -f "$dbpath" ]; then
    echo "  skip: $name (DB 없음)"
    continue
  fi

  echo "  backup: $name"
  sqlite3 "$dbpath" ".backup '$TMPDIR/db/$name.db'"
done

if [ -z "$(ls -A "$TMPDIR/db")" ]; then
  echo "error: 백업할 DB가 없습니다." >&2
  exit 1
fi

mkdir -p "$DEST"
ZIPFILE="$DEST/$BACKUP_NAME.zip"
(cd "$TMPDIR" && zip -qr "$ZIPFILE" .)

SIZE=$(du -h "$ZIPFILE" | cut -f1)
echo ""
echo "=== 백업 완료: $ZIPFILE ($SIZE) ==="
