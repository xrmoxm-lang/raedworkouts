#!/bin/bash
# Copies the web app from the repo root into native/App/www, which is a folder
# reference in the app bundle. Runs as a pre-build script, so every build — and
# every install — carries the web app that is in the worktree right now.
#
# The list is explicit on purpose. `tests/`, `server/`, `node_modules/`, the
# markdown and the tooling must never reach the phone.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE="$(dirname "$HERE")"
ROOT="$(dirname "$NATIVE")"
DEST="$NATIVE/App/www"

if [ ! -f "$ROOT/index.html" ]; then
  echo "error: $ROOT does not look like the web app root (no index.html)" >&2
  exit 1
fi

FILES=(index.html styles.css app.js data.js locale.js sw.js manifest.webmanifest)
DIRS=(core ui domain fonts img)

mkdir -p "$DEST"

# --delete on the whole destination would also delete the directories we copy
# next, so the sweep is done first and by hand: anything in www that is not on
# the two lists above goes.
KEEP=$(printf '%s\n' "${FILES[@]}" "${DIRS[@]}"; ls "$ROOT" | grep -E '^icon-.*\.(png|svg)$' || true)
if [ -d "$DEST" ]; then
  for existing in "$DEST"/*; do
    [ -e "$existing" ] || continue
    name="$(basename "$existing")"
    if ! printf '%s\n' "$KEEP" | grep -qx "$name"; then rm -rf "$existing"; fi
  done
fi

for f in "${FILES[@]}"; do
  [ -f "$ROOT/$f" ] || { echo "error: missing $ROOT/$f" >&2; exit 1; }
  rsync -a "$ROOT/$f" "$DEST/$f"
done

for d in "${DIRS[@]}"; do
  [ -d "$ROOT/$d" ] || { echo "error: missing $ROOT/$d" >&2; exit 1; }
  rsync -a --delete "$ROOT/$d/" "$DEST/$d/"
done

shopt -s nullglob
for icon in "$ROOT"/icon-*.png "$ROOT"/icon-*.svg; do
  rsync -a "$icon" "$DEST/$(basename "$icon")"
done
shopt -u nullglob

echo "sync-www: $(find "$DEST" -type f | wc -l | tr -d ' ') files in $DEST"
