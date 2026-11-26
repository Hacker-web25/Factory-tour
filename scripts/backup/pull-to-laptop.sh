#!/usr/bin/env bash
# Pulls the backups down to this laptop, so a second copy lives outside the cloud.
# It only ever ADDS files here; it never deletes anything on your laptop.
#
#   bash scripts/backup/pull-to-laptop.sh
#
# One-time setup: see scripts/backup/README.md ("Second copy on your laptop").
# It reads its settings from ~/.vpv-backup.env (keep that file private: chmod 600):
#
#   R2_ACCOUNT_ID=fffda717e383600b07859e2d6aa308d1
#   R2_ACCESS_KEY_ID=...        the READ-ONLY token made for the laptop
#   R2_SECRET_ACCESS_KEY=...
#   VPV_BACKUP_DIR=$HOME/VPV-Backups     (optional, where the copy lives)
#   PULL_MEDIA=1                         (optional, 0 = skip images and audio)
#   MAX_AGE_HOURS=36                     (optional, warn if a backup is older)
#
# Works with the Mac's built-in bash 3.2.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

ENV_FILE="${VPV_ENV_FILE:-$HOME/.vpv-backup.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  err "no settings file at $ENV_FILE (see scripts/backup/README.md)"
  exit 1
fi

DEST="${VPV_BACKUP_DIR:-$HOME/VPV-Backups}"
PULL_MEDIA="${PULL_MEDIA:-1}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-36}"
BACKUP_BUCKET="${BACKUP_BUCKET:-vpv-backups}"
B="r2:${BACKUP_BUCKET}"

notify() {
  # A visible message on a Mac, so a failed night does not go unnoticed.
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
  fi
}

need rclone "On a Mac: brew install rclone" || exit 1
setup_r2 || exit 1
mkdir -p "$DEST" || { err "cannot create $DEST"; exit 1; }

# One run at a time.
LOCK="$DEST/.pull.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +360 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null; mkdir "$LOCK" 2>/dev/null || { err "another pull is running"; exit 1; }
  else
    log "another pull is already running; nothing to do"
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vpv-pull.XXXXXX")"
trap 'rm -rf "$WORK"; rmdir "$LOCK" 2>/dev/null' EXIT

PROBLEMS=""
problem() { PROBLEMS="$PROBLEMS$1"$'\n'; err "$1"; }

# ── how fresh is the cloud copy? ──────────────────────────────────────────
if ! rclone cat "$B/latest.env" >"$WORK/latest.env" 2>"$WORK/err"; then
  problem "cannot read the backup bucket (wrong key, or no backup has ever run): $(tail -c 200 "$WORK/err")"
else
  NOW="$(date +%s)"
  for part in DB MEDIA D1; do
    ep="$(env_get "${part}_EPOCH" "$WORK/latest.env")"
    if [ -z "$ep" ]; then
      if [ "$part" = D1 ]; then warn "the subtitles database has never been backed up (not set up yet?)"; else problem "$part has never been backed up"; fi
      continue
    fi
    age=$(( (NOW - ep) / 3600 ))
    if [ "$age" -gt "$MAX_AGE_HOURS" ]; then
      problem "the latest $part backup in the cloud is $age hours old (limit $MAX_AGE_HOURS). The nightly job may have stopped: check GitHub > Actions."
    else
      log "$part backup in the cloud is $age hours old: fine"
    fi
  done
  [ "$(env_get LAST_RUN_OK "$WORK/latest.env")" = 1 ] || problem "the last nightly run reported a failure (see GitHub > Actions)"
fi

# ── pull ──────────────────────────────────────────────────────────────────
pull() { # source-subpath, extra rclone args...
  local sub="$1"; shift
  mkdir -p "$DEST/$sub"
  rclone copy "$B/$sub" "$DEST/$sub" --transfers 8 --checkers 16 --retries 3 "$@" 2>"$WORK/err"
  local rc=$?
  # A folder that does not exist yet in the cloud (rclone exit code 3) is not an error.
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 3 ]; then problem "pulling $sub failed: $(tail -c 300 "$WORK/err")"; fi
  return 0
}

log "pulling the database snapshots"
pull db/daily --max-age 8d
pull db/monthly
log "pulling the subtitles snapshots"
pull d1/daily --max-age 8d
pull d1/monthly
if [ "$PULL_MEDIA" = 1 ]; then
  log "pulling images and audio (only files you do not have yet)"
  pull media
else
  log "skipping images and audio (PULL_MEDIA=0)"
fi
cp "$WORK/latest.env" "$DEST/latest.env" 2>/dev/null || true

# ── prove the copy on the laptop is complete and intact ───────────────────
snap="$(env_get DB_SNAPSHOT "$WORK/latest.env")"
if [ -n "$snap" ]; then
  if rclone check "$B/$snap" "$DEST/$snap" --one-way 2>"$WORK/err"; then
    log "newest database snapshot on this laptop matches the cloud: $snap"
  else
    problem "the newest database snapshot on this laptop does not match the cloud: $(tail -c 300 "$WORK/err")"
  fi
fi
snap="$(env_get D1_SNAPSHOT "$WORK/latest.env")"
if [ -n "$snap" ]; then
  rclone check "$B/$snap" "$DEST/$snap" --one-way 2>"$WORK/err" || problem "the newest subtitles snapshot on this laptop does not match the cloud: $(tail -c 300 "$WORK/err")"
fi
if [ "$PULL_MEDIA" = 1 ] && [ "$(env_get MEDIA_COUNT "$WORK/latest.env")" != "0" ] && [ -n "$(env_get MEDIA_EPOCH "$WORK/latest.env")" ]; then
  if rclone check "$B/media" "$DEST/media" --one-way --size-only 2>"$WORK/err"; then
    log "images and audio on this laptop match the cloud"
  else
    problem "some images or audio are missing on this laptop: $(grep -E 'ERROR|not in' "$WORK/err" | head -n 3 | tr '\n' ' ')"
  fi
fi

if [ -n "$PROBLEMS" ]; then
  notify "VPV backup needs attention" "$(printf '%s' "$PROBLEMS" | head -n 1)"
  echo
  echo "NEEDS ATTENTION:"; printf '%s' "$PROBLEMS"
  exit 1
fi
date +%s >"$DEST/LAST_PULL_OK"
log "done. Backups on this laptop: $DEST ($(du -sh "$DEST" 2>/dev/null | cut -f1))"
