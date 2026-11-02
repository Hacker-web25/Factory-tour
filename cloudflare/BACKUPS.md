# Nightly database backups (R2 + a private Worker)

Supabase Free has no automatic backups — if the database is lost or something is
deleted by mistake, there is nothing to go back to. This is the stand-in: every
night, every table is copied out and stored privately on Cloudflare R2, the same
service tour pictures already use (`cloudflare/media-worker.js`), but in its own
bucket and its own Worker, kept **completely separate** so a problem with one
never touches the other. **Off** until the Vercel setting in step 4 is added.

## How it fits together

```
Vercel Cron, nightly ──▶ /api/system/backup ──▶ reads every table (service-role key)
                                               ──▶ gzip ──▶ PUT, with a secret ──▶ backup Worker ──▶ R2 bucket "vpv-backups"
                                               ──▶ deletes backups older than the newest 35
```

- Nothing in this bucket is ever public — unlike tour pictures, a backup holds every
  customer's data, so the Worker refuses every request, including reads, without the
  secret.
- This is a **logical** backup (every row of every table, as JSON), not a `pg_dump`:
  the app has no database password to make a real one with. The database's
  structure itself is not lost either way — it is the `supabase/*.sql` migrations
  already in the repo, applied in order.
- About 35 nights are kept (a little over a month). Older ones are deleted
  automatically each night.

## One-time setup (about 10 minutes)

1. **Create a new, separate bucket.** Cloudflare → R2 Object Storage → Create
   bucket → name it `vpv-backups` (not the `vpv-media` bucket tour pictures use).
   Leave it private (the default).
2. **Create a new, separate Worker.** Workers & Pages → Create → Start with
   Hello World → name it `vpv-backup` → Deploy → Edit code → delete everything,
   paste the whole of `cloudflare/backup-worker.js` → Deploy.
3. **Connect the bucket and the secret.** Worker `vpv-backup` → Settings:
   - Bindings → Add → R2 bucket → variable name `BUCKET`, bucket `vpv-backups`.
   - Variables and secrets → Add → Secret `UPLOAD_SECRET`: a long random text
     (32+ characters), **different from** the media Worker's `UPLOAD_SECRET`.
     Keep a copy for step 4.
4. **Switch it on in Vercel.** factory-tour → Settings → Environment Variables,
   for Production:
   - `BACKUP_BASE_URL` = this Worker's address (like
     `https://vpv-backup.<your-name>.workers.dev`), no slash at the end
   - `BACKUP_UPLOAD_SECRET` = the same text as step 3's `UPLOAD_SECRET`

   Then redeploy. The next nightly run (2:15 am UTC / 7:45 am IST) is the
   first real backup; nothing needs to be triggered by hand.
5. **Check it once, the next morning.** `node scripts/restoreBackup.mjs list`
   (with `BACKUP_BASE_URL` / `BACKUP_UPLOAD_SECRET` in your shell) should show
   one file. `inspect` it to see every table's row count.

## If a backup fails, or is not set up

The nightly job never fails loudly where nobody would see it — instead it writes
a row to `billing_alerts` and e-mails the owner (`alertFounders`, the same path a
payment problem uses), for: not configured yet, the upload itself failing, or a
table coming back incomplete (an error, or hitting its size/time cap).

## Restoring something

`scripts/restoreBackup.mjs` (run from a developer machine or Vercel's shell, never
by the app itself):

```
node scripts/restoreBackup.mjs list
node scripts/restoreBackup.mjs inspect backups/2026-11-02T021500-000Z.json.gz
node scripts/restoreBackup.mjs inspect backups/2026-11-02T021500-000Z.json.gz campaign_codes
node scripts/restoreBackup.mjs restore backups/2026-11-02T021500-000Z.json.gz campaign_codes --really
```

`restore` without `--really` is a dry run: it prints the row count and the first
row, and writes nothing. Restoring upserts by primary key, so re-running it is
safe. It restores one table at a time on purpose — a whole-database restore after
real data loss is the one time it is worth a careful, table-by-table look rather
than one big automatic script.

## Limits worth knowing

- Every table in `lib/server/backupTables.ts` is copied. **A new migration that
  adds a table must add its name there too**, or it is silently left out.
- A single table is capped at 300,000 rows and the whole run at about 230 seconds;
  either cap being hit is reported as a warning (not a failure) in the alert
  e-mail and in `inspect`'s table list (`TRUNCATED`). Well beyond anything this
  project holds today.
- R2 free tier (10 GB stored, 1M writes, 10M reads a month) covers this easily;
  see `cloudflare-r2-storage.md` for the account's current plan.
