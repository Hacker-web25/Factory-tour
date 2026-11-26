# Restoring

Pick the situation. In every case, **stay calm and do not delete anything first**:
the backups are only ever added to, so there is no rush.

Where the backups are: the cloud bucket `vpv-backups` (Cloudflare → R2) and the
folder `~/VPV-Backups` on the laptop. They have the same layout:

```
db/daily/<date>/      public.dump  auth-data.dump  auth-triggers.sql  storage-config.sql  row-counts.tsv  manifest.json
db/monthly/<month>/   the same, first copy of each month, kept forever
media/                every image and audio file (same paths as the live bucket)
d1/daily/<date>/      vpv-language.sql.gz   (subtitles and translations)
latest.env            when each part was last backed up
```

Tools you need for a restore: PostgreSQL client tools **17 or newer** (Mac:
`brew install postgresql@17`), `rclone` (`brew install rclone`) and, for the
subtitles, Node (`npx wrangler login` once).

To get a snapshot folder from the cloud (skip if it is already on the laptop):

```bash
export R2_ACCOUNT_ID=fffda717e383600b07859e2d6aa308d1
export R2_ACCESS_KEY_ID=...        # the read-only key is enough
export R2_SECRET_ACCESS_KEY=...
. scripts/backup/lib.sh && setup_r2
rclone lsf r2:vpv-backups/db/daily/                  # pick the newest folder
rclone copy r2:vpv-backups/db/daily/<date> ./snapshot
```

## A. The Supabase database is lost or damaged

1. Supabase → **New project** (same region). Wait until it is ready. Do **not** use
   the old project and do not sign anyone up in the new one.
2. In the new project: Connect → *Session pooler* → copy the URI (port 5432), put
   the new database password in it.
3. Restore:
   ```bash
   bash scripts/backup/restore-db.sh ./snapshot "<the new project's session pooler URI>"
   ```
   It refuses anything that is not an empty project, restores logins, then the
   tables, security rules, functions and permissions, then the storage bucket
   definitions, and finally compares row counts with the backup. **Only if it ends
   with "all N tables match the backup" is the database good.** It is safe to run
   again after a failure: each step is all-or-nothing.
4. Point the website at the new project: Vercel → Settings → Environment Variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (all from the new project's Settings → API), then
   redeploy. Also update the GitHub secret `SUPABASE_DB_URL` so backups continue.
5. Re-do the things a database backup cannot contain (Supabase dashboard settings):
   - Authentication → Sign In / Providers (email, Google, ...) and the Site URL and
     Redirect URLs
   - Authentication → Email templates and SMTP settings
   - The JWT/API keys are new: everyone is signed out once and signs in again
     (passwords and two-factor settings are restored)
   - Private files: the buckets `recordings` and `voice-samples` exist again but are
     empty (see the gap in README.md)
6. Test: sign in as the owner, open the dashboard, open a tour and /admin/storage.

## B. Images or audio are lost (bucket emptied or damaged)

Copy the backup back into the live bucket (needs a key with *write* access to
`vpv-media`, e.g. the `vpv-backup-job` key). `copy` never deletes anything:

```bash
rclone copy r2:vpv-backups/media r2:vpv-media --transfers 8 --checksum   # from the cloud copy
# or, from the laptop copy:
rclone copy ~/VPV-Backups/media r2:vpv-media --transfers 8 --checksum
```

## C. The subtitles and translations database is lost

1. Cloudflare → D1 → make sure the database `vpv-language` exists (if not, create it
   and run `cloudflare/language-schema.sql` in its Console).
2. Restore the newest file:
   ```bash
   gunzip -c ./snapshot/vpv-language.sql.gz > vpv-language.sql
   npx wrangler d1 execute vpv-language --remote --file=vpv-language.sql
   ```
   The file only adds or overwrites rows (`INSERT OR REPLACE`), so running it twice
   is harmless. Check afterwards: open `/api/language/selftest` as the owner.

## D. The whole Cloudflare account is lost

Everything is on the laptop in `~/VPV-Backups`: the media, the subtitles snapshots
and the database snapshots. Create a new Cloudflare account, then follow
`cloudflare/README.md` and `cloudflare/LANGUAGE-README.md` to create the Workers and
buckets, run **B** (images) and **C** (subtitles), and change
`NEXT_PUBLIC_MEDIA_BASE_URL` / `LANGUAGE_API_URL` in Vercel.

## E. The laptop is lost

Nothing is lost: the cloud copy is complete. Set up a new laptop with step 6 of
README.md.

## Practice drill (do this once, now)

1. Supabase → create a **free second project** called `vpv-restore-test` (it is
   deleted afterwards; it never touches the live site).
2. Get the newest snapshot (see the top of this page) and run `restore-db.sh` as in
   **A.3** against the test project.
3. Open the test project's Table Editor and Authentication → Users: you should see
   the same workspaces, tours and 11 logins as the live site.
4. Pause or delete the test project. Write down how long it took.

If anything in the drill fails, fix it **now**, while nothing is on fire, and tell
whoever maintains the scripts.

## What the restore checks, and what it cannot

It proves every table came back with at least as many rows as when the backup was
taken, that the logins, the security rules (row level security), the permissions,
the functions and the "new login creates a profile" trigger exist, and that storage
bucket rules are back. It cannot know about things stored outside the database: see
step A.5.
