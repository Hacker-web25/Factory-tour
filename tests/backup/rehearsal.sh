#!/usr/bin/env bash
# A full rehearsal of the backup and the restore, on this machine, with no
# internet and no secrets:
#   * a throwaway PostgreSQL stands in for the Supabase database
#   * folders stand in for the two Cloudflare R2 buckets (rclone "local" remote)
#   * the real language Worker runs on a local port for the subtitles database
# It runs the REAL scripts (backup.sh, restore-db.sh) and compares the restored
# database with the original, table by table.
#
#   bash tests/backup/rehearsal.sh
#
# Two modes:
#   bash tests/backup/rehearsal.sh                       folders stand in for R2 (fast)
#   REHEARSAL_MODE=s3 bash tests/backup/rehearsal.sh     a local S3 look-alike (moto)
#                                                        stands in for R2, so the real
#                                                        S3 code paths of rclone run
#                                                        (needs: pip install "moto[server]")
#
# Needs: PostgreSQL server + client tools (16 or newer), rclone, node, jq, and
# either root (it then runs PostgreSQL as the "postgres" user) or a normal user.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
REPO="$PWD"
T="$REPO/tests/backup"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1)"
[ -x "$BIN/postgres" ] || { echo "SKIP: no PostgreSQL server found"; exit 0; }
command -v rclone >/dev/null || { echo "SKIP: rclone not installed"; exit 0; }

ROOT="$(mktemp -d /tmp/vpv-rehearsal.XXXXXX)"
chmod 755 "$ROOT"
PGDATA="$ROOT/pg"; SOCK="$ROOT/sock"; PORT=54329
mkdir -p "$SOCK" "$ROOT/cloud/vpv-media/panoramas/t1" "$ROOT/cloud/vpv-media/tours/t1" "$ROOT/cloud/vpv-backups"
RUNAS=""
if [ "$(id -u)" = "0" ]; then RUNAS="su postgres -s /bin/bash -c"; chown -R postgres "$ROOT/pg" "$SOCK" 2>/dev/null; fi
pgrun() { if [ -n "$RUNAS" ]; then $RUNAS "$1"; else bash -c "$1"; fi; }
[ -n "$RUNAS" ] && { mkdir -p "$PGDATA" && chown postgres "$PGDATA" "$SOCK"; }

MODE="${REHEARSAL_MODE:-local}"
S3PORT=5001
if [ "$MODE" = s3 ]; then
  command -v moto_server >/dev/null || { echo "SKIP: moto_server not installed (pip install 'moto[server]')"; exit 0; }
  CLOUD_ENV=(R2_ACCOUNT_ID=rehearsal R2_ACCESS_KEY_ID=test R2_SECRET_ACCESS_KEY=test "R2_ENDPOINT=http://127.0.0.1:$S3PORT" AWS_DEFAULT_REGION=us-east-1)
  BK="$ROOT/mirror"
else
  CLOUD_ENV=(RCLONE_CONFIG_R2_TYPE=local)
  BK="$ROOT/cloud/vpv-backups"
fi
# rclone against the pretend cloud, configured exactly as the real job configures R2
rc() { ( export "${CLOUD_ENV[@]}"; . "$REPO/scripts/backup/lib.sh"; setup_r2 && cd "$ROOT/cloud" && rclone "$@" ); }

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

cleanup() {
  [ -n "${D1PID:-}" ] && kill "$D1PID" 2>/dev/null
  [ -n "${MOTOPID:-}" ] && kill "$MOTOPID" 2>/dev/null
  pgrun "$BIN/pg_ctl -D $PGDATA -m immediate stop" >/dev/null 2>&1
  rm -rf "$ROOT"
}
trap cleanup EXIT

echo "• starting a throwaway PostgreSQL ($($BIN/postgres --version))"
pgrun "$BIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null 2>"$ROOT/initdb.err" || { cat "$ROOT/initdb.err"; exit 1; }
pgrun "$BIN/pg_ctl -D $PGDATA -o '-p $PORT -k $SOCK -c listen_addresses=' -w -l $SOCK/pg.log start" >/dev/null || { cat "$SOCK/pg.log"; exit 1; }
URL_PROD="postgresql://postgres@/prod?host=$SOCK&port=$PORT"
URL_FRESH="postgresql://postgres@/fresh?host=$SOCK&port=$PORT"
URL_BASE="postgresql://postgres@/postgres?host=$SOCK&port=$PORT"
psql "$URL_BASE" -qX -v ON_ERROR_STOP=1 -c "create database prod" -c "create database fresh" || exit 1
psql "$URL_PROD" -qX -v ON_ERROR_STOP=1 -f "$T/seed-roles.sql" -f "$T/seed-supabase-shape.sql" -f "$T/seed-production.sql" >/dev/null || { echo "seeding failed"; exit 1; }
psql "$URL_FRESH" -qX -v ON_ERROR_STOP=1 -f "$T/seed-supabase-shape.sql" >/dev/null || { echo "seeding fresh failed"; exit 1; }

# files in the pretend production media bucket
head -c 3000 /dev/urandom >"$ROOT/cloud/vpv-media/panoramas/t1/pano-one.jpg"
head -c 5000 /dev/urandom >"$ROOT/cloud/vpv-media/panoramas/t1/pano-two.jpg"
head -c 2000 /dev/urandom >"$ROOT/cloud/vpv-media/tours/t1/voice.mp3"

if [ "$MODE" = s3 ]; then
  echo "• starting a local S3 look-alike"
  moto_server -p $S3PORT >"$ROOT/moto.log" 2>&1 &
  MOTOPID=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$S3PORT/" && break; sleep 0.5; done
  # (the job's rclone is told NOT to create buckets, like a token limited to two buckets, so make them here)
  python3 - "$S3PORT" <<'PY' || { echo "cannot create the buckets"; exit 1; }
import sys, boto3
s3 = boto3.client("s3", endpoint_url=f"http://127.0.0.1:{sys.argv[1]}", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
for b in ("vpv-media", "vpv-backups"):
    s3.create_bucket(Bucket=b)
PY
  rc copy "$ROOT/cloud/vpv-media" r2:vpv-media || exit 1
fi

BACKUP_SECRET="rehearsal-backup-secret-0123456789"
PORT_D1=8799
( cd "$REPO" && PORT=$PORT_D1 BACKUP_SECRET=$BACKUP_SECRET exec npx tsx "$T/d1-server.ts" >"$ROOT/d1.log" 2>&1 ) &
D1PID=$!
for _ in $(seq 1 60); do grep -q ready "$ROOT/d1.log" 2>/dev/null && break; sleep 0.5; done
grep -q ready "$ROOT/d1.log" || { echo "language Worker did not start"; cat "$ROOT/d1.log"; exit 1; }

run_backup() { # extra env as arguments
  ( cd "$ROOT/cloud" && env "${CLOUD_ENV[@]}" SUPABASE_DB_URL="$URL_PROD" LANGUAGE_API_URL="http://127.0.0.1:$PORT_D1" BACKUP_SECRET="$BACKUP_SECRET" MIN_DUMP_BYTES=2000 "$@" bash "$REPO/scripts/backup/backup.sh" ) >"$ROOT/backup.out" 2>&1
  local rc=$?
  # In s3 mode, bring the bucket's contents down to a folder so the checks below can look at them.
  [ "$MODE" = s3 ] && rc sync r2:vpv-backups "$BK" >/dev/null 2>&1
  return $rc
}

echo "• backup #1"
run_backup; rc=$?
check "backup exits 0" "[ $rc = 0 ]" || sed 's/^/      /' "$ROOT/backup.out"
SNAP="$(ls -d "$BK"/db/daily/*/ 2>/dev/null | head -n 1)"
check "database snapshot has every file" "[ -s \"$SNAP/public.dump\" ] && [ -s \"$SNAP/auth-data.dump\" ] && [ -s \"$SNAP/auth-triggers.sql\" ] && [ -s \"$SNAP/storage-config.sql\" ] && [ -s \"$SNAP/row-counts.tsv\" ] && [ -s \"$SNAP/manifest.json\" ]"
check "manifest is valid JSON with the dump checksum" "jq -e '.files[\"public.dump\"].sha256 | length == 64' \"$SNAP/manifest.json\" >/dev/null"
check "checksum in the manifest matches the file" "[ \"\$(jq -r '.files[\"public.dump\"].sha256' \"$SNAP/manifest.json\")\" = \"\$(sha256sum \"$SNAP/public.dump\" | cut -d' ' -f1)\" ]"
check "a monthly copy was kept" "[ -s \"$BK/db/monthly/$(date -u +%Y-%m)/public.dump\" ]"
check "row counts recorded (users 11, leads 300)" "grep -q -P '^auth.users\t11\$' \"$SNAP/row-counts.tsv\" && grep -q -P '^public.leads\t300\$' \"$SNAP/row-counts.tsv\" && grep -q -P '^public.empty_table\t0\$' \"$SNAP/row-counts.tsv\""
check "auth trigger captured" "grep -q 'on_auth_user_created' \"$SNAP/auth-triggers.sql\""
check "the sessions table is NOT in the logins dump" "! pg_restore --list \"$SNAP/auth-data.dump\" | grep -q 'auth sessions'"
check "schema_migrations is NOT in the logins dump" "! pg_restore --list \"$SNAP/auth-data.dump\" | grep -q schema_migrations"
check "all 3 media files copied" "[ \$(find \"$BK/media\" -type f | wc -l) = 3 ]"
check "media bytes identical" "diff -r \"$ROOT/cloud/vpv-media\" \"$BK/media\""
D1SNAP="$(ls -d "$BK"/d1/daily/*/ 2>/dev/null | head -n 1)"
check "subtitles dump is valid gzip SQL with the rows" "gzip -t \"$D1SNAP/vpv-language.sql.gz\" && zcat \"$D1SNAP/vpv-language.sql.gz\" | grep -q 'INSERT OR REPLACE INTO translations'"
check "latest.env says all good" "grep -q '^LAST_RUN_OK=1\$' \"$BK/latest.env\" && grep -q '^D1_ROWS=tour_language:1+translations:40+transcripts:1\$' \"$BK/latest.env\" && grep -q '^MEDIA_COUNT=3\$' \"$BK/latest.env\""

echo "• restore into a brand-new empty project"
"$REPO/scripts/backup/restore-db.sh" "$SNAP" "$URL_FRESH" >"$ROOT/restore.out" 2>&1; rc=$?
check "restore exits 0" "[ $rc = 0 ]" || sed 's/^/      /' "$ROOT/restore.out"
check "restore reports all tables matching" "grep -q 'all .* tables match' \"$ROOT/restore.out\""

# Compare the two databases object by object.
same() { # name, sql run on both
  local a b; a="$(psql "$URL_PROD" -X -At -c "$2" 2>&1)"; b="$(psql "$URL_FRESH" -X -At -c "$2" 2>&1)"
  if [ "$a" = "$b" ] && [ -n "$a" ]; then ok "identical: $1"; else bad "differs: $1"; echo "      prod : $(echo "$a" | head -c 300)"; echo "      fresh: $(echo "$b" | head -c 300)"; fi
}
for t in profiles organisations leads empty_table padding; do
  same "all rows of public.$t" "select count(*) || ' ' || coalesce(md5(string_agg(x::text, '|' order by x::text)), '-') from public.$t x"
done
same "all rows of public.\"Mixed Case Table\"" "select count(*) || ' ' || coalesce(md5(string_agg(x::text, '|' order by x::text)), '-') from public.\"Mixed Case Table\" x"
same "auth.users (ids, password hashes, metadata)" "select count(*) || ' ' || md5(string_agg(id::text || email || encrypted_password || raw_user_meta_data::text || coalesce(confirmed_at::text, ''), '|' order by id)) from auth.users"
same "auth.identities" "select count(*) || ' ' || md5(string_agg(x::text, '|' order by x::text)) from auth.identities x"
same "auth.mfa_factors" "select count(*) || ' ' || md5(string_agg(x::text, '|' order by x::text)) from auth.mfa_factors x"
same "table definitions (columns, types, defaults, generated)" "select md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || coalesce(column_default, '') || ':' || is_generated || ':' || is_nullable, '|' order by table_name, ordinal_position)) from information_schema.columns where table_schema = 'public'"
same "constraints (keys, checks, foreign keys)" "select md5(string_agg(conrelid::regclass::text || conname || pg_get_constraintdef(oid), '|' order by conrelid::regclass::text, conname)) from pg_constraint where connamespace = 'public'::regnamespace"
same "indexes" "select md5(string_agg(indexdef, '|' order by indexname)) from pg_indexes where schemaname = 'public'"
same "views" "select md5(string_agg(viewname || definition, '|' order by viewname)) from pg_views where schemaname = 'public'"
same "functions" "select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) from pg_proc p where pronamespace = 'public'::regnamespace"
same "row level security switches" "select string_agg(relname || relrowsecurity::text, '|' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'"
same "row level security policies" "select md5(string_agg(tablename || policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname)) from pg_policies where schemaname = 'public'"
same "table permissions (who may read or write what)" "select md5(string_agg(grantee || table_name || privilege_type, '|' order by grantee, table_name, privilege_type)) from information_schema.role_table_grants where table_schema = 'public'"
same "storage buckets (public or private, size limits, allowed types)" "select md5(string_agg(x::text, '|' order by id)) from (select id, name, public, file_size_limit, allowed_mime_types from storage.buckets) x"
same "storage access rules (who may read or write files)" "select count(*) || ' ' || md5(string_agg(policyname || permissive || roles::text || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)) from pg_policies where schemaname = 'storage'"
same "the trigger on auth.users" "select string_agg(tgname, ',') from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal"
same "identity column keeps counting from the right place" "select last_value::text from pg_sequences where schemaname = 'public' and sequencename like 'leads_id_seq'"
# the restored trigger really works
NEW_ID="99999999-0000-4000-8000-000000000001"
psql "$URL_FRESH" -qX -c "insert into auth.users (id, email) values ('$NEW_ID', 'new@example.com')" >/dev/null 2>&1
check "a new login on the restored database still creates its profile (trigger works)" "[ \"\$(psql \"$URL_FRESH\" -X -At -c \"select email from public.profiles where id = '$NEW_ID'\")\" = new@example.com ]"
# the restored security policy really works: a plain member sees only themselves, the owner sees everyone
rls_count() { psql "$1" -X -At -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$2'; select count(*) from public.profiles; rollback;" 2>&1 | grep -E '^[0-9]+$' | head -n 1; }
check "row level security works on the restored database (a member sees 1 profile)" "[ \"\$(rls_count '$URL_FRESH' 00000000-0000-4000-8000-000000000005)\" = 1 ]"
check "...and the owner sees all 12 (11 logins + the one added above)" "[ \"\$(rls_count '$URL_FRESH' 00000000-0000-4000-8000-000000000001)\" = 12 ]"
check "...exactly as on the original (member 1, owner 11)" "[ \"\$(rls_count '$URL_PROD' 00000000-0000-4000-8000-000000000005)\" = 1 ] && [ \"\$(rls_count '$URL_PROD' 00000000-0000-4000-8000-000000000001)\" = 11 ]"

echo "• safety checks"
"$REPO/scripts/backup/restore-db.sh" "$SNAP" "$URL_FRESH" >"$ROOT/restore2.out" 2>&1; rc=$?
check "restoring into a database that already has data is refused" "[ $rc -ne 0 ] && grep -q 'already has' \"$ROOT/restore2.out\""
"$REPO/scripts/backup/restore-db.sh" "$SNAP" "$URL_PROD" >"$ROOT/restore3.out" 2>&1; rc=$?
check "restoring onto the live database is refused" "[ $rc -ne 0 ] && grep -q 'already has' \"$ROOT/restore3.out\""
check "the live database was not touched by the refusals" "[ \"\$(psql \"$URL_PROD\" -X -At -c 'select count(*) from public.leads')\" = 300 ]"

echo "• a corrupt snapshot must not restore"
psql "$URL_BASE" -qX -c "create database fresh2" >/dev/null && psql "$URL_BASE" -qX -d "postgresql://postgres@/fresh2?host=$SOCK&port=$PORT" -f "$T/seed-supabase-shape.sql" >/dev/null 2>&1
cp -r "$SNAP" "$ROOT/broken"; head -c 3000 "$SNAP/public.dump" >"$ROOT/broken/public.dump"
"$REPO/scripts/backup/restore-db.sh" "$ROOT/broken" "postgresql://postgres@/fresh2?host=$SOCK&port=$PORT" >"$ROOT/restore4.out" 2>&1; rc=$?
check "a truncated dump is refused" "[ $rc -ne 0 ]"

echo "• backup #2 (media deleted from the live bucket, then a failing database)"
rm "$ROOT/cloud/vpv-media/panoramas/t1/pano-one.jpg"
[ "$MODE" = s3 ] && rc deletefile r2:vpv-media/panoramas/t1/pano-one.jpg
run_backup SUPABASE_DB_URL="postgresql://postgres@/nonexistent?host=$SOCK&port=$PORT"; rc=$?
check "a database failure makes the job fail" "[ $rc != 0 ]"
check "...but the images and subtitles were still backed up" "grep -q 'ok      media' \"$ROOT/backup.out\" && grep -q 'ok      d1' \"$ROOT/backup.out\""
check "a file deleted from the live bucket is still in the backup (copy, not sync)" "[ -s \"$BK/media/panoramas/t1/pano-one.jpg\" ]"
check "the database failure kept the old success time (not overwritten)" "grep -q '^DB_SNAPSHOT=db/daily/' \"$BK/latest.env\" && grep -q '^LAST_RUN_OK=0\$' \"$BK/latest.env\""
check "nothing was pruned after a failure" "grep -q 'nothing old was deleted' \"$ROOT/backup.out\""

echo "• retention"
if [ "$MODE" = local ]; then
  OLD="$BK/db/daily/20200101T000000Z"; mkdir -p "$OLD"; echo old >"$OLD/public.dump"; touch -d '90 days ago' "$OLD/public.dump" "$OLD"
  sleep 1; run_backup; rc=$?
  check "backup #3 succeeds" "[ $rc = 0 ]" || sed 's/^/      /' "$ROOT/backup.out"
  check "with fewer than 3 recent snapshots nothing old is deleted" "[ -d \"$OLD\" ] && grep -q 'fewer than 3 recent' \"$ROOT/backup.out\""
  sleep 1; run_backup; sleep 1; run_backup
  check "with 3 recent snapshots the 90-day-old one is deleted" "[ ! -d \"$OLD\" ]"
else
  # a bucket cannot be given an old date here, so only check that pruning never removes recent snapshots
  sleep 1; run_backup; rc=$?
  check "backup #3 succeeds" "[ $rc = 0 ]" || sed 's/^/      /' "$ROOT/backup.out"
  sleep 1; run_backup; sleep 1; run_backup
fi
check "recent snapshots and the monthly copy are kept" "[ \$(ls \"$BK/db/daily\" | wc -l) -ge 3 ] && [ -s \"$BK/db/monthly/$(date -u +%Y-%m)/public.dump\" ]"

echo "• a database that shrank suddenly is flagged"
psql "$URL_PROD" -qX -c "create table public.padding2 as select i, md5(i::text) || md5((i * 3)::text) || md5((i * 5)::text) as filler from generate_series(1, 30000) i" >/dev/null
run_backup MIN_DUMP_BYTES=2000
psql "$URL_PROD" -qX -c "drop table public.padding2; drop table public.padding" >/dev/null
run_backup MIN_DUMP_BYTES=2000; rc=$?
check "the job fails when the dump is less than half of yesterday's" "[ $rc != 0 ] && grep -q 'shrank' \"$ROOT/backup.out\""

echo "• a database that cannot be read completely fails the job but still reports"
psql "$URL_BASE" -qX -c "create database nostorage template prod" >/dev/null && psql "postgresql://postgres@/nostorage?host=$SOCK&port=$PORT" -qX -c "drop schema storage cascade" >/dev/null
run_backup STEPS=db SUPABASE_DB_URL="postgresql://postgres@/nostorage?host=$SOCK&port=$PORT"; rc=$?
check "missing storage schema fails the job with a clear message (and does not exit silently)" "[ $rc != 0 ] && grep -q 'could not read the storage bucket settings' \"$ROOT/backup.out\" && grep -q 'backup summary' \"$ROOT/backup.out\""
check "...and the broken snapshot was not uploaded" "[ \$(ls \"$BK/db/daily\" | wc -l) = \$(grep -c '^' <<< \"\$(ls \"$BK/db/daily\")\") ] && ! grep -q 'ok      db' \"$ROOT/backup.out\""

echo "• a wrong secret for the subtitles fails loudly"
run_backup BACKUP_SECRET="wrong-secret-wrong-secret-wrong1"; rc=$?
check "subtitles failure fails the job" "[ $rc != 0 ] && grep -q 'D1 backup failed: 401' \"$ROOT/backup.out\""

echo "• the subtitles step is skipped (with a warning) when not configured"
run_backup LANGUAGE_API_URL= BACKUP_SECRET=; rc=$?
check "skipped, with a warning" "grep -q 'NOT being backed up' \"$ROOT/backup.out\" && grep -q 'SKIPPED d1' \"$ROOT/backup.out\""

echo "• the laptop copy"
: >"$ROOT/empty.env"
LAPTOP="$ROOT/laptop"
pull() { ( cd "$ROOT/cloud" && env "${CLOUD_ENV[@]}" VPV_ENV_FILE="$ROOT/empty.env" VPV_BACKUP_DIR="$LAPTOP" "$@" bash "$REPO/scripts/backup/pull-to-laptop.sh" ) >"$ROOT/pull.out" 2>&1; }
run_backup; rc=$?   # (the previous step ended on a deliberately failing run; make the cloud copy good again)
check "a good nightly run to pull from" "[ $rc = 0 ]"
pull; rc=$?
check "pull succeeds" "[ $rc = 0 ]" || sed 's/^/      /' "$ROOT/pull.out"
check "the newest database snapshot is on the laptop, intact" "[ -s \"$LAPTOP/\$(grep '^DB_SNAPSHOT=' \"$BK/latest.env\" | cut -d= -f2)/public.dump\" ]"
check "the images are on the laptop, identical to the cloud copy" "diff -r \"$BK/media\" \"$LAPTOP/media\""
check "the subtitles snapshot and the monthly copy are on the laptop" "[ -n \"\$(find \"$LAPTOP/d1/daily\" -name '*.sql.gz')\" ] && [ -s \"$LAPTOP/db/monthly/$(date -u +%Y-%m)/public.dump\" ]"
check "the laptop records when it last succeeded" "[ -s \"$LAPTOP/LAST_PULL_OK\" ]"
# the laptop copy restores on its own, without the cloud
psql "$URL_BASE" -qX -c "create database fresh3" >/dev/null && psql "postgresql://postgres@/fresh3?host=$SOCK&port=$PORT" -qX -f "$T/seed-supabase-shape.sql" >/dev/null 2>&1
LSNAP="$LAPTOP/$(grep '^DB_SNAPSHOT=' "$BK/latest.env" | cut -d= -f2)"
"$REPO/scripts/backup/restore-db.sh" "$LSNAP" "postgresql://postgres@/fresh3?host=$SOCK&port=$PORT" >"$ROOT/restore5.out" 2>&1; rc=$?
check "the snapshot from the LAPTOP restores into a new project (no cloud needed)" "[ $rc = 0 ] && grep -q 'all .* tables match' \"$ROOT/restore5.out\""
pull; rc=$?
check "pulling again is quiet and still succeeds" "[ $rc = 0 ]"
# a stale cloud copy is reported
sed -i 's/^DB_EPOCH=.*/DB_EPOCH=1600000000/' "$BK/latest.env"
if [ "$MODE" = s3 ]; then rc copyto "$BK/latest.env" r2:vpv-backups/latest.env; fi   # (in local mode $BK is the bucket itself)
pull; rc=$?
check "a stale database backup makes the laptop script fail loudly" "[ $rc != 0 ] && grep -q 'hours old' \"$ROOT/pull.out\""
# a wrong key is reported
if [ "$MODE" = s3 ]; then
  pull R2_SECRET_ACCESS_KEY=wrong; rc=$?
  check "a wrong key is reported, not silently ignored" "[ $rc != 0 ] && grep -q 'NEEDS ATTENTION' \"$ROOT/pull.out\""
fi
# an image damaged or lost on the laptop is repaired by the next pull
run_backup >/dev/null; pull >/dev/null
head -c 10 /dev/urandom >"$LAPTOP/media/tours/t1/voice.mp3"
rm "$LAPTOP/media/panoramas/t1/pano-two.jpg"
pull; rc=$?
check "a damaged and a deleted image on the laptop are repaired by the next pull" "[ $rc = 0 ] && diff -r \"$BK/media\" \"$LAPTOP/media\""

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
