#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-auto}"
ROOT="${RAEDSYNC_HOME:-$HOME/raedsync}"
DB="${RAEDSYNC_DB:-$ROOT/data.db}"
BACKUP_ROOT="${RAEDSYNC_BACKUP_DIR:-$ROOT/backups}"
PI_TARGET="${RAEDSYNC_PI_TARGET:-raed@100.90.161.44:~/backups/raedsync}"

mkdir -p "$BACKUP_ROOT/hourly" "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly"

make_backup() {
  local tier="$1"
  local outdir="$BACKUP_ROOT/$tier"
  local stamp
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  local raw="$outdir/data-$stamp.db"
  local gz="$raw.gz"

  python3 - "$DB" "$raw" <<'PY'
import sqlite3
import sys

src, dst = sys.argv[1], sys.argv[2]
with sqlite3.connect(src) as source:
    with sqlite3.connect(dst) as target:
        source.backup(target)
PY
  gzip -f "$raw"
  printf '%s\n' "$gz"
}

prune_keep_newest() {
  local dir="$1"
  local keep="$2"
  python3 - "$dir" "$keep" <<'PY'
from pathlib import Path
import sys

directory = Path(sys.argv[1])
keep = int(sys.argv[2])
files = sorted(directory.glob("data-*.db.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
for path in files[keep:]:
    path.unlink(missing_ok=True)
PY
}

should_daily() {
  [ ! -e "$BACKUP_ROOT/.daily-date" ] || [ "$(cat "$BACKUP_ROOT/.daily-date")" != "$(date -u +%Y-%m-%d)" ]
}

should_weekly() {
  [ "$(date -u +%u)" = "1" ] && { [ ! -e "$BACKUP_ROOT/.weekly-date" ] || [ "$(cat "$BACKUP_ROOT/.weekly-date")" != "$(date -u +%G-W%V)" ]; }
}

if [ ! -f "$DB" ]; then
  echo "DB not found: $DB" >&2
  exit 1
fi

case "$MODE" in
  hourly)
    make_backup hourly >/dev/null
    ;;
  daily)
    make_backup daily >/dev/null
    date -u +%Y-%m-%d > "$BACKUP_ROOT/.daily-date"
    ;;
  weekly)
    newest="$(make_backup weekly)"
    date -u +%G-W%V > "$BACKUP_ROOT/.weekly-date"
    ssh "${PI_TARGET%%:*}" "mkdir -p ${PI_TARGET#*:}" || true
    scp "$newest" "$PI_TARGET/" || true
    ssh "${PI_TARGET%%:*}" "find ${PI_TARGET#*:} -type f -name 'data-*.db.gz' -print0 | xargs -0 ls -1t 2>/dev/null | awk 'NR>8' | xargs -r rm -f" || true
    ;;
  auto)
    make_backup hourly >/dev/null
    if should_daily; then
      make_backup daily >/dev/null
      date -u +%Y-%m-%d > "$BACKUP_ROOT/.daily-date"
    fi
    if should_weekly; then
      newest="$(make_backup weekly)"
      date -u +%G-W%V > "$BACKUP_ROOT/.weekly-date"
      ssh "${PI_TARGET%%:*}" "mkdir -p ${PI_TARGET#*:}" || true
      scp "$newest" "$PI_TARGET/" || true
      ssh "${PI_TARGET%%:*}" "find ${PI_TARGET#*:} -type f -name 'data-*.db.gz' -print0 | xargs -0 ls -1t 2>/dev/null | awk 'NR>8' | xargs -r rm -f" || true
    fi
    ;;
  *)
    echo "usage: $0 [auto|hourly|daily|weekly]" >&2
    exit 2
    ;;
esac

prune_keep_newest "$BACKUP_ROOT/hourly" 48
prune_keep_newest "$BACKUP_ROOT/daily" 30
prune_keep_newest "$BACKUP_ROOT/weekly" 8
