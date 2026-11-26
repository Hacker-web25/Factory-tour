#!/usr/bin/env bash
# Restore a VPV database backup into a NEW, EMPTY Supabase project.
#
#   scripts/backup/restore-db.sh <backup-folder> <target-database-url>
#
#   <backup-folder>        a folder holding public.dump, auth-data.dump,
#                          auth-triggers.sql, storage-config.sql and
#                          row-counts.tsv. That is one
#                          snapshot under db/daily/... or db/monthly/... in the
#                          vpv-backups bucket, or the same folder on your laptop.
#   <target-database-url>  the NEW project's Session pooler address (port 5432),
#                          from Supabase > Connect.
#
# It refuses to run on a database that already has tables, so it can never
# overwrite the live site by mistake. Everything is loaded in a single
# transaction per step: if something fails, nothing is left half done and you can
# simply run it again.
#
# Needs PostgreSQL client tools of version 17 or newer (pg_restore, psql).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

DIR="${1:-}"
URL="${2:-}"
if [ -z "$DIR" ] || [ -z "$URL" ]; then
  sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
fi

need psql "Install the PostgreSQL 17 client tools." || exit 1
need pg_restore "Install the PostgreSQL 17 client tools." || exit 1
for f in public.dump auth-data.dump auth-triggers.sql row-counts.tsv; do
  [ -s "$DIR/$f" ] || { err "$DIR/$f is missing or empty. Is this a snapshot folder?"; exit 1; }
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
q() { psql "$URL" -X -At -v ON_ERROR_STOP=1 -c "$1"; }

# ── 1. is the target safe to restore into? ────────────────────────────────
q 'select 1' >/dev/null 2>"$WORK/e" || { err "cannot connect to the target database: $(head -c 200 "$WORK/e" | sed -E 's#(://[^:]*:)[^@]*@#\1***@#')"; exit 1; }

tables="$(q "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")"
if [ "$tables" != "0" ]; then
  err "the target already has $tables tables in its public schema. This script only restores into an EMPTY project, so it cannot damage a live one. Create a new project and use its address."
  exit 1
fi
has_users="$(q "select count(*) from information_schema.tables where table_schema = 'auth' and table_name = 'users'")"
if [ "$has_users" != "1" ]; then
  err "the target has no auth.users table, so it does not look like a Supabase project"
  exit 1
fi
users="$(q 'select count(*) from auth.users')"
if [ "$users" != "0" ]; then
  err "the target already has $users logins. Restore into a project nobody has signed up to."
  exit 1
fi
other="$(q "select coalesce(string_agg(t.tgname, ', '), '') from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal")"
if [ -n "$other" ]; then
  err "the target already has triggers on auth.users ($other). They would run while the logins load and create duplicate rows. Remove them first."
  exit 1
fi

# ── 2. logins first, so the profile rows that point at them can follow ─────
log "restoring logins (auth.users and friends)"
pg_restore --data-only --no-owner --single-transaction --exit-on-error -d "$URL" "$DIR/auth-data.dump" 2>"$WORK/e" \
  || { err "restoring the logins failed (nothing was changed): $(tail -c 500 "$WORK/e")"; exit 1; }

# ── 3. the public schema: tables, data, policies, functions, grants ────────
log "restoring the public schema"
# Every Supabase project already has a public schema; skip only the line that creates it.
pg_restore --list "$DIR/public.dump" | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' >"$WORK/list.txt"
pg_restore --no-owner --single-transaction --exit-on-error --use-list="$WORK/list.txt" -d "$URL" "$DIR/public.dump" 2>"$WORK/e" \
  || { err "restoring the public schema failed. The logins are in; delete them with  delete from auth.users;  or start from a fresh project. Detail: $(tail -c 600 "$WORK/e")"; exit 1; }

# ── 4. triggers that live on the auth tables ───────────────────────────────
log "re-creating triggers on the auth tables"
psql "$URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$DIR/auth-triggers.sql" 2>"$WORK/e" \
  || { err "could not create the auth triggers: $(tail -c 400 "$WORK/e")"; exit 1; }

# ── 5. storage buckets and their access rules ─────────────────────────────
if [ -s "$DIR/storage-config.sql" ]; then
  log "re-creating the storage buckets and their access rules"
  psql "$URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$DIR/storage-config.sql" 2>"$WORK/e" \
    || { err "could not create the storage buckets or rules: $(tail -c 400 "$WORK/e")"; exit 1; }
else
  warn "this snapshot has no storage-config.sql; create the buckets (panoramas, tours, recordings, voice-samples) and their rules from supabase/*.sql by hand"
fi

q 'analyze' >/dev/null 2>&1 || true

# ── 6. prove it: row counts must match what was recorded at backup time ────
log "checking row counts against the backup"
psql "$URL" -X -At -F $'\t' -c "
  select 'public.' || table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
  union all select 'auth.users', count(*)::text from auth.users
  order by 1" >"$WORK/now.tsv" 2>"$WORK/e" || { err "could not count the restored rows: $(tail -c 200 "$WORK/e")"; exit 1; }

bad=0
total=0
while IFS=$'\t' read -r name want; do
  [ -n "$name" ] || continue
  total=$((total + 1))
  got="$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' "$WORK/now.tsv")"
  if [ -z "$got" ]; then
    err "$name: missing after the restore"
    bad=$((bad + 1))
  elif [ "$got" -lt "$want" ]; then
    err "$name: backup recorded $want rows, restored $got"
    bad=$((bad + 1))
  elif [ "$got" -gt "$want" ]; then
    warn "$name: restored $got rows, the count recorded before the dump was $want (rows were added while the backup ran; that is normal)"
  fi
done <"$DIR/row-counts.tsv"

if [ "$bad" -ne 0 ]; then
  err "$bad of $total tables do not match. Do not use this database."
  exit 1
fi
log "restore complete: all $total tables match the backup"
echo
echo "Next: point the website at this database (Vercel environment variables"
echo "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY),"
echo "restore the subtitles (see RESTORE.md), and redeploy. Images are not in the"
echo "database: they stay in Cloudflare and need no restore."
