# shellcheck shell=bash
# Small helpers shared by the backup scripts. Works on Linux (the nightly job)
# and on a Mac's old bash 3.2 (the laptop script), so: no associative arrays,
# no mapfile, no ${var,,}.

log()  { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::warning::$*"; else echo "WARNING: $*" >&2; fi; }
err()  { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$*"; else echo "ERROR: $*" >&2; fi; }

need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  err "$1 is not installed. $2"
  return 1
}

# Cloudflare R2 as an rclone remote called "r2", configured entirely from
# environment variables: no config file on disk, no key on a command line.
# RCLONE_CONFIG_R2_TYPE=local is for the rehearsal tests only (a folder stands in
# for the bucket).
setup_r2() {
  export RCLONE_CONFIG_R2_TYPE="${RCLONE_CONFIG_R2_TYPE:-s3}"
  if [ "$RCLONE_CONFIG_R2_TYPE" = "s3" ]; then
    local missing=""
    [ -n "${R2_ACCOUNT_ID:-}" ] || missing="$missing R2_ACCOUNT_ID"
    [ -n "${R2_ACCESS_KEY_ID:-}" ] || missing="$missing R2_ACCESS_KEY_ID"
    [ -n "${R2_SECRET_ACCESS_KEY:-}" ] || missing="$missing R2_SECRET_ACCESS_KEY"
    if [ -n "$missing" ]; then
      err "missing:$missing"
      return 1
    fi
    export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
    export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    # R2_ENDPOINT is only for the rehearsal (a local S3 look-alike); normally unset.
    export RCLONE_CONFIG_R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
    export RCLONE_CONFIG_R2_REGION=auto
    # A token limited to two buckets may not create or inspect buckets themselves.
    export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  fi
  # Quiet the "config file not found" notice: there is none on purpose.
  export RCLONE_CONFIG="${RCLONE_CONFIG:-/dev/null}"
}

# value of KEY=... from a simple KEY=VALUE file; empty if absent. The pattern only
# accepts plain characters, so nothing in the file is ever run as a command.
env_get() {
  local key="$1" file="$2"
  [ -f "$file" ] || return 0
  grep -E "^${key}=[A-Za-z0-9:_/.+-]*\$" "$file" 2>/dev/null | tail -n 1 | cut -d= -f2-
}

human_bytes() {
  awk -v b="${1:-0}" 'BEGIN {
    s = "B"
    if (b >= 1024) { b /= 1024; s = "KB" }
    if (b >= 1024) { b /= 1024; s = "MB" }
    if (b >= 1024) { b /= 1024; s = "GB" }
    if (b >= 1024) { b /= 1024; s = "TB" }
    if (s == "B") printf "%d B", b; else printf "%.1f %s", b, s
  }'
}
