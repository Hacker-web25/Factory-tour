#!/usr/bin/env bash
# VPV nightly backup. Runs from .github/workflows/nightly-backup.yml, and by hand.
#
# It saves three things into the private Cloudflare bucket "vpv-backups":
#   db/     the Supabase database (tables, policies, functions, and the logins)
#   media/  every image and audio file in the production bucket "vpv-media"
#   d1/     the subtitles and translations (Cloudflare D1)
#
# Each part is independent: if one fails the others still run, the job ends with
# an error (GitHub emails you), and nothing old is deleted.
#
# Settings come from environment variables (GitHub Actions secrets). Nothing
# secret is ever printed.
#   required   SUPABASE_DB_URL  Supabase "Session pooler" address, port 5432
#              R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#   optional   LANGUAGE_API_URL + BACKUP_SECRET   (the subtitles database)
#              HEALTHCHECK_URL                    (a dead-man's-switch ping)
#              STEPS="db media d1"                (run only some parts)
#              MEDIA_BUCKET, BACKUP_BUCKET, RETENTION_DAYS (35)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

MEDIA_BUCKET="${MEDIA_BUCKET:-vpv-media}"
BACKUP_BUCKET="${BACKUP_BUCKET:-vpv-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-35}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-20000}"
STEPS="${STEPS:-db media d1}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
MONTH="$(date -u +%Y-%m)"
NOW_EPOCH="$(date -u +%s)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
B="r2:${BACKUP_BUCKET}"

FAILED=""
SUMMARY=""
note() { SUMMARY="${SUMMARY}$1"$'\n'; }
fail() { FAILED="${FAILED} $1"; note "FAILED  $1: $2"; err "$1: $2"; }

# Remembered between runs, for the laptop's freshness check and the size guard.
DB_EPOCH="" ; DB_SNAPSHOT="" ; DB_BYTES=""
MEDIA_EPOCH="" ; MEDIA_COUNT="" ; MEDIA_BYTES=""
D1_EPOCH="" ; D1_SNAPSHOT="" ; D1_ROWS=""

prune() {
  # Delete daily copies older than RETENTION_DAYS, but only when at least three
  # newer snapshots exist, so a wrong clock can never empty the bucket.
  local prefix="$1" recent
  recent="$(rclone lsf --files-only -R --max-age "${RETENTION_DAYS}d" "$prefix" 2>/dev/null | cut -d/ -f1 | sort -u | wc -l | tr -d ' ')"
  if [ "${recent:-0}" -ge 3 ]; then
    rclone delete "$prefix" --min-age "${RETENTION_DAYS}d" >/dev/null 2>&1 || warn "could not prune $prefix"
    rclone rmdirs "$prefix" --leave-root >/dev/null 2>&1 || true
  else
    log "prune: keeping everything under $prefix (fewer than 3 recent snapshots)"
  fi
}

# The first successful copy of each month is also kept forever.
promote_monthly() {
  local kind="$1" snapshot="$2"
  if [ -z "$(rclone lsf "$B/$kind/monthly/$MONTH" 2>/dev/null)" ]; then
    if rclone copy "$B/$snapshot" "$B/$kind/monthly/$MONTH" >/dev/null 2>&1; then
      log "$kind: kept a monthly copy for $MONTH"
    else
      warn "$kind: could not write the monthly copy"
    fi
  fi
}

step_db() {
  need pg_dump "Install PostgreSQL client 17 (see the workflow file)." || return 1
  need psql "Install PostgreSQL client 17 (see the workflow file)." || return 1
  [ -n "${SUPABASE_DB_URL:-}" ] || { err "SUPABASE_DB_URL is not set"; return 1; }

  local dir="$WORK/db"
  mkdir -p "$dir"

  local server_num server_major client_major
  server_num="$(psql "$SUPABASE_DB_URL" -X -Atc 'show server_version_num' 2>"$WORK/psql.err")" || {
    err "cannot connect to the database. SUPABASE_DB_URL must be the Session pooler address (port 5432). $(head -c 200 "$WORK/psql.err" | sed -E 's#(://[^:]*:)[^@]*@#\1***@#')"
    return 1
  }
  server_major=$((server_num / 10000))
  client_major="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
  if [ "$client_major" -lt "$server_major" ]; then
    err "pg_dump is version $client_major but the database is version $server_major; install postgresql-client-$server_major"
    return 1
  fi
  log "db: server $server_major, client $client_major"

  # Row counts first, so a later restore can be checked against them.
  psql "$SUPABASE_DB_URL" -X -At -F $'\t' -c "
    select 'public.' || table_name,
           (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
    union all select 'auth.users', count(*)::text from auth.users
    order by 1" >"$dir/row-counts.tsv" 2>"$WORK/psql.err" || { err "could not count rows: $(head -c 200 "$WORK/psql.err")"; return 1; }

  pg_dump "$SUPABASE_DB_URL" --format=custom --compress=6 --no-owner --schema=public \
    --file="$dir/public.dump" 2>"$WORK/pgdump.err" || { err "pg_dump of the public schema failed: $(head -c 300 "$WORK/pgdump.err")"; return 1; }

  # The logins. Only the tables that hold people and how they sign in; sessions
  # and tokens are not needed (everyone simply signs in again).
  pg_dump "$SUPABASE_DB_URL" --format=custom --compress=6 --no-owner --data-only \
    -t auth.users -t auth.identities -t auth.mfa_factors -t auth.mfa_recovery_code_sets -t auth.mfa_recovery_codes \
    --file="$dir/auth-data.dump" 2>"$WORK/pgdump.err" || { err "pg_dump of the logins failed: $(head -c 300 "$WORK/pgdump.err")"; return 1; }

  # Triggers that live on the auth tables (new login -> new profile row) belong to
  # neither dump above.
  psql "$SUPABASE_DB_URL" -X -At -c "
    select pg_get_triggerdef(t.oid) || ';'
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth' and not t.tgisinternal
     order by t.tgname" >"$dir/auth-triggers.sql" 2>"$WORK/psql.err" || { err "could not read auth triggers: $(head -c 200 "$WORK/psql.err")"; return 1; }

  # The definitions of the storage buckets and the rules on who may read or write
  # files in them. They live in Supabase's "storage" schema, so the dumps above
  # do not contain them. (The files themselves are not here: they are in
  # Cloudflare, or, for the private meeting recordings, still in Supabase.)
  {
    echo "-- Storage buckets and the access rules on storage.objects. Safe to run twice." &&
    psql "$SUPABASE_DB_URL" -X -At -c "
      select format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %L, %L) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;',
                    id, name, public, file_size_limit, allowed_mime_types)
        from storage.buckets order by id" &&
    psql "$SUPABASE_DB_URL" -X -At -c "
      select format('drop policy if exists %I on %I.%I;', policyname, schemaname, tablename) || E'\n' ||
             format('create policy %I on %I.%I as %s for %s to %s%s%s;', policyname, schemaname, tablename, permissive, cmd,
                    (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(roles) r),
                    case when qual is not null then ' using (' || qual || ')' else '' end,
                    case when with_check is not null then ' with check (' || with_check || ')' else '' end)
        from pg_policies where schemaname = 'storage' order by tablename, policyname"
  } >"$dir/storage-config.sql" 2>"$WORK/psql.err" || { err "could not read the storage bucket settings: $(head -c 300 "$WORK/psql.err")"; return 1; }

  # Is what we wrote a real, readable dump?
  local pub_bytes data_entries
  pub_bytes="$(wc -c <"$dir/public.dump" | tr -d ' ')"
  if [ "$pub_bytes" -lt "$MIN_DUMP_BYTES" ]; then
    err "the database dump is only $pub_bytes bytes; something is wrong, not uploading it"
    return 1
  fi
  pg_restore --list "$dir/public.dump" >"$WORK/toc.txt" 2>"$WORK/pgrestore.err" || { err "the dump cannot be read back: $(head -c 200 "$WORK/pgrestore.err")"; return 1; }
  pg_restore --list "$dir/auth-data.dump" >"$WORK/toc-auth.txt" 2>>"$WORK/pgrestore.err" || { err "the logins dump cannot be read back"; return 1; }
  data_entries="$(grep -c ' TABLE DATA ' "$WORK/toc.txt" || true)"
  grep -q ' TABLE DATA auth users ' "$WORK/toc-auth.txt" || { err "the logins dump has no auth.users"; return 1; }
  [ "${data_entries:-0}" -ge 1 ] || { err "the dump holds no table data"; return 1; }

  local tables
  tables="$(grep -c '^public\.' "$dir/row-counts.tsv" || true)"
  cat >"$dir/manifest.json" <<EOF
{
  "kind": "vpv-database-backup",
  "takenAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "serverMajor": $server_major,
  "pgDumpMajor": $client_major,
  "publicTables": ${tables:-0},
  "tableDataEntries": ${data_entries:-0},
  "files": {
    "public.dump": { "bytes": $pub_bytes, "sha256": "$(sha256sum "$dir/public.dump" | cut -d' ' -f1)" },
    "auth-data.dump": { "bytes": $(wc -c <"$dir/auth-data.dump" | tr -d ' '), "sha256": "$(sha256sum "$dir/auth-data.dump" | cut -d' ' -f1)" }
  }
}
EOF

  local before_bytes
  before_bytes="$(env_get DB_BYTES "$WORK/latest.old")"

  rclone copy "$dir" "$B/db/daily/$TS" 2>"$WORK/rclone.err" || { err "upload failed: $(tail -c 300 "$WORK/rclone.err")"; return 1; }
  rclone check "$dir" "$B/db/daily/$TS" --one-way 2>"$WORK/rclone.err" || { err "the uploaded copy does not match what was dumped: $(tail -c 300 "$WORK/rclone.err")"; return 1; }
  promote_monthly db "db/daily/$TS"

  DB_EPOCH="$NOW_EPOCH"; DB_SNAPSHOT="db/daily/$TS"; DB_BYTES="$pub_bytes"
  note "ok      db: $(human_bytes "$pub_bytes") public + logins, $tables tables -> $DB_SNAPSHOT"

  # A dump less than half the size of yesterday's is probably wrong. It is saved
  # (it may be right) but the job is marked failed so someone looks.
  if [ -n "$before_bytes" ] && [ "$before_bytes" -gt "$MIN_DUMP_BYTES" ] && [ $((pub_bytes * 2)) -lt "$before_bytes" ]; then
    err "the database dump shrank from $(human_bytes "$before_bytes") to $(human_bytes "$pub_bytes"); check that nothing was deleted by mistake"
    return 1
  fi
  return 0
}

step_media() {
  need rclone "See the workflow file." || return 1
  local src_count
  src_count="$(rclone size "r2:$MEDIA_BUCKET" --json 2>"$WORK/rclone.err" | sed -E 's/.*"count":([0-9]+).*/\1/')"
  case "$src_count" in ''|*[!0-9]*) err "cannot read the bucket $MEDIA_BUCKET: $(tail -c 300 "$WORK/rclone.err")"; return 1 ;; esac
  if [ "$src_count" -eq 0 ]; then
    note "ok      media: bucket $MEDIA_BUCKET is empty, nothing to copy"
    MEDIA_EPOCH="$NOW_EPOCH"; MEDIA_COUNT=0; MEDIA_BYTES=0
    return 0
  fi
  # copy, never sync: a file deleted from the live bucket stays in the backup.
  rclone copy "r2:$MEDIA_BUCKET" "$B/media" --fast-list --transfers 8 --checkers 16 --retries 3 2>"$WORK/rclone.err" \
    || { err "media copy failed: $(tail -c 400 "$WORK/rclone.err")"; return 1; }
  rclone check "r2:$MEDIA_BUCKET" "$B/media" --one-way --size-only --fast-list 2>"$WORK/rclone.err" \
    || { err "some media files are missing from the backup: $(grep -E 'ERROR|not in' "$WORK/rclone.err" | head -n 5 | tr '\n' ' ')"; return 1; }
  local size
  size="$(rclone size "$B/media" --json 2>/dev/null)"
  MEDIA_COUNT="$(echo "$size" | sed -E 's/.*"count":([0-9]+).*/\1/')"
  MEDIA_BYTES="$(echo "$size" | sed -E 's/.*"bytes":([0-9]+).*/\1/')"
  MEDIA_EPOCH="$NOW_EPOCH"
  note "ok      media: $src_count files in $MEDIA_BUCKET all present; backup holds $MEDIA_COUNT files ($(human_bytes "$MEDIA_BYTES"))"
  return 0
}

step_d1() {
  if [ -z "${LANGUAGE_API_URL:-}" ] || [ -z "${BACKUP_SECRET:-}" ]; then
    warn "d1: LANGUAGE_API_URL / BACKUP_SECRET are not set, so the subtitles database is NOT being backed up yet"
    note "SKIPPED d1: not configured yet (set LANGUAGE_API_URL and BACKUP_SECRET)"
    return 0
  fi
  need node "See the workflow file." || return 1
  local dir="$WORK/d1"
  mkdir -p "$dir"
  node "$HERE/d1-dump.mjs" --out "$dir/vpv-language.sql.gz" --summary "$dir/summary.json" || return 1
  gzip -t "$dir/vpv-language.sql.gz" || { err "the subtitles dump is not a valid gzip file"; return 1; }
  rclone copy "$dir" "$B/d1/daily/$TS" 2>"$WORK/rclone.err" || { err "upload failed: $(tail -c 300 "$WORK/rclone.err")"; return 1; }
  rclone check "$dir" "$B/d1/daily/$TS" --one-way 2>"$WORK/rclone.err" || { err "the uploaded subtitles copy does not match: $(tail -c 300 "$WORK/rclone.err")"; return 1; }
  promote_monthly d1 "d1/daily/$TS"
  D1_EPOCH="$NOW_EPOCH"; D1_SNAPSHOT="d1/daily/$TS"
  # e.g. tour_language:2+translations:47+transcripts:2 (no commas: see env_get)
  D1_ROWS="$(tr -d ' \n"' <"$dir/summary.json" | sed -E 's/.*counts:\{([^}]*)\}.*/\1/' | tr ',' '+')"
  note "ok      d1: subtitles and translations ($D1_ROWS) -> $D1_SNAPSHOT"
  return 0
}

main() {
  setup_r2 || exit 1
  need rclone "See the workflow file." || exit 1

  rclone cat "$B/latest.env" >"$WORK/latest.old" 2>/dev/null || : >"$WORK/latest.old"
  # Carry the previous success times forward; a failing part keeps its old time.
  DB_EPOCH="$(env_get DB_EPOCH "$WORK/latest.old")"; DB_SNAPSHOT="$(env_get DB_SNAPSHOT "$WORK/latest.old")"; DB_BYTES="$(env_get DB_BYTES "$WORK/latest.old")"
  MEDIA_EPOCH="$(env_get MEDIA_EPOCH "$WORK/latest.old")"; MEDIA_COUNT="$(env_get MEDIA_COUNT "$WORK/latest.old")"; MEDIA_BYTES="$(env_get MEDIA_BYTES "$WORK/latest.old")"
  D1_EPOCH="$(env_get D1_EPOCH "$WORK/latest.old")"; D1_SNAPSHOT="$(env_get D1_SNAPSHOT "$WORK/latest.old")"; D1_ROWS="$(env_get D1_ROWS "$WORK/latest.old")"

  local s
  for s in $STEPS; do
    case "$s" in
      db)    log "== database";  step_db    || fail db    "see the messages above" ;;
      media) log "== media";     step_media || fail media "see the messages above" ;;
      d1)    log "== subtitles"; step_d1    || fail d1    "see the messages above" ;;
      *)     fail "$s" "unknown step" ;;
    esac
  done

  # The freshness file the laptop checks. Plain KEY=VALUE, one per line.
  {
    echo "LAST_RUN_EPOCH=$NOW_EPOCH"
    echo "LAST_RUN_OK=$([ -z "$FAILED" ] && echo 1 || echo 0)"
    echo "DB_EPOCH=$DB_EPOCH"; echo "DB_SNAPSHOT=$DB_SNAPSHOT"; echo "DB_BYTES=$DB_BYTES"
    echo "MEDIA_EPOCH=$MEDIA_EPOCH"; echo "MEDIA_COUNT=$MEDIA_COUNT"; echo "MEDIA_BYTES=$MEDIA_BYTES"
    echo "D1_EPOCH=$D1_EPOCH"; echo "D1_SNAPSHOT=$D1_SNAPSHOT"; echo "D1_ROWS=$D1_ROWS"
  } >"$WORK/latest.env"
  rclone copyto "$WORK/latest.env" "$B/latest.env" 2>"$WORK/rclone.err" || fail latest "could not write latest.env: $(tail -c 200 "$WORK/rclone.err")"

  if [ -z "$FAILED" ]; then
    prune "$B/db/daily"
    prune "$B/d1/daily"
  else
    warn "something failed, so nothing old was deleted"
  fi

  echo
  echo "── backup summary ($TS) ──"
  printf '%s' "$SUMMARY"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    { echo "### Backup $TS"; echo '```'; printf '%s' "$SUMMARY"; echo '```'; } >>"$GITHUB_STEP_SUMMARY"
  fi

  if [ -n "${HEALTHCHECK_URL:-}" ] && command -v curl >/dev/null 2>&1; then
    if [ -z "$FAILED" ]; then curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL" || warn "could not ping the health check"
    else curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL/fail" || true; fi
  fi

  [ -z "$FAILED" ]
}

main "$@"
