# Backups

Everything that matters is saved **every night** to a private Cloudflare bucket,
and you keep a **second copy on your laptop**. If the cloud copy, the laptop copy,
or Supabase is lost, the other copies restore the site.

| What | Where it lives live | Where the backups are |
|---|---|---|
| Database: workspaces, tours, leads, billing, **logins**, security rules | Supabase | `vpv-backups/db/` (cloud) + laptop |
| Images and audio of every tour | Cloudflare R2 `vpv-media` | `vpv-backups/media/` (cloud) + laptop |
| Subtitles and translations | Cloudflare D1 `vpv-language` | `vpv-backups/d1/` (cloud) + laptop |
| Private meeting recordings and voice samples | Supabase Storage | **not backed up yet** (see "Known gap") |

How it behaves:

- **Runs by itself** at 01:50 India time (GitHub → Actions → *Nightly backup*). It
  can also be started by hand from the same page.
- **Never deletes your files.** Images are *copied*, never synced: a picture deleted
  from the live site stays in the backup. Daily database copies are kept 35 days,
  and the first copy of every month is kept forever.
- **Checks itself.** Each upload is compared with the original; a dump that is
  unreadable, suspiciously small, or less than half yesterday's size fails the run.
  A failed run turns red and GitHub emails you. If one part fails the other parts
  still run, and nothing old is deleted.
- **Proven.** `tests/backup/rehearsal.sh` runs the real scripts against a throwaway
  database, backs it up, restores it into a blank project and compares every table,
  login, security rule and permission. Run it any time: `npm run test:backup`.

## One-time setup (about 30 minutes)

### 1. Two Cloudflare keys
Cloudflare → R2 → **Manage API tokens** → *Create API token*. Make two:

1. **`vpv-backup-job`**: permission *Object Read & Write*, *Apply to specific
   buckets only*: `vpv-backups` and `vpv-media`. Copy the **Access Key ID** and
   **Secret Access Key** (shown once).
2. **`vpv-laptop-readonly`**: permission *Object Read only*, bucket `vpv-backups`
   only. Copy its two values too.

### 2. The subtitles database needs a backup password
Cloudflare → Workers & Pages → `vpv-language` → Settings → Variables and secrets →
add a **Secret** `BACKUP_SECRET`: 32+ random characters, **different** from
`LANG_API_SECRET`. Then paste the newest `cloudflare/language-worker.js` into the
Worker and Deploy. (This password can only *read* the subtitles database for the
backup. It cannot translate, change or delete anything.)

### 3. The Supabase database address
Supabase → your project → **Connect** (top bar) → **Session pooler** → copy the
URI. Replace `[YOUR-PASSWORD]` with the database password (Project Settings →
Database → *Reset database password* if nobody knows it; the website uses API keys,
not this password). It must use **port 5432** (session pooler), not 6543. If the
password has symbols such as `@ # / :`, write them percent-encoded (`@` is `%40`).

### 4. Put the values into GitHub
GitHub → the repository → Settings → Secrets and variables → Actions → *New
repository secret*, once for each:

| Secret name | Value |
|---|---|
| `SUPABASE_DB_URL` | the session pooler URI from step 3 |
| `R2_BACKUP_ACCESS_KEY_ID` | Access Key ID of `vpv-backup-job` |
| `R2_BACKUP_SECRET_ACCESS_KEY` | Secret Access Key of `vpv-backup-job` |
| `LANGUAGE_API_URL` | the `vpv-language` Worker address (no slash at the end) |
| `LANGUAGE_BACKUP_SECRET` | the `BACKUP_SECRET` from step 2 |
| `HEALTHCHECK_URL` | *optional.* A free ping address from healthchecks.io: it emails you if no backup has reported for a day, which also catches GitHub switching the schedule off |

### 5. Run it once
GitHub → Actions → **Nightly backup** → *Run workflow*. It takes a few minutes.
Green means: database, images and subtitles are in `vpv-backups`. Open the run: the
last lines list what was saved. (The first run copies all images; later runs only
copy new ones.)

> The workflow file lives in `.github/workflows/`. If `git push` refuses it
> ("workflow scope"), add that one file through the GitHub website instead
> (Add file → Create new file), or use a token that includes the `workflow` scope.

### 6. Second copy on your laptop (Mac)
1. Install rclone: `brew install rclone`
2. Create the file `~/.vpv-backup.env` with the **read-only** key, then lock it:
   ```
   R2_ACCOUNT_ID=fffda717e383600b07859e2d6aa308d1
   R2_ACCESS_KEY_ID=<Access Key ID of vpv-laptop-readonly>
   R2_SECRET_ACCESS_KEY=<Secret Access Key of vpv-laptop-readonly>
   ```
   ```
   chmod 600 ~/.vpv-backup.env
   ```
3. Run it: `bash scripts/backup/pull-to-laptop.sh`. Everything lands in
   `~/VPV-Backups`. It only adds files and never deletes anything on your laptop.
4. Make it automatic: `bash scripts/backup/install-laptop-schedule.sh` (runs every
   morning and whenever the laptop wakes after missing a run).
5. Turn on **FileVault** (System Settings → Privacy & Security). The backup holds
   customer data and password hashes, so the laptop disk must be encrypted.

The laptop script tells you (a Mac notification and a red message) if the newest
cloud backup is more than 36 hours old, if the last nightly run failed, or if
anything on the laptop does not match the cloud.

### 7. Practise a restore once (10 minutes, do not skip)
A backup you have never restored is a hope, not a backup. Follow
[RESTORE.md](./RESTORE.md) "Practice drill": it restores into a free, empty second
Supabase project and never touches the live site.

## Known gap
The private meeting **recordings** and **voice samples** are still in Supabase
Storage (8 small files today) and are **not** in these backups. Supabase's free plan
has no backups of its own. If those files matter to you, download them from
Supabase → Storage now and then, or ask for them to be moved to Cloudflare too.

## Good to know
- **Cost:** R2 is $0.015 per GB per month; backups are copies, so you pay for the
  images twice (live + backup). 100 GB of images costs about $3 a month for the backup.
  Downloading to your laptop is free.
- **Secrets stay secret:** nothing secret is in the code. The only places the
  database address and keys live are GitHub's secret store, Vercel, and your
  laptop's `~/.vpv-backup.env`.
- **One weak spot, on purpose:** the GitHub secret that can write the backup bucket
  could, if stolen, also delete it. That is why the laptop copy exists, why it uses a
  separate read-only key, and why you should keep two-factor login on GitHub and
  Cloudflare.
- **A third copy** outside Cloudflare and your laptop (say an external drive, or
  another cloud) is worth having once the site has real customers: run
  `pull-to-laptop.sh` with `VPV_BACKUP_DIR` pointing at the drive.
- **Supabase dashboard settings** (login providers, email templates, redirect URLs,
  SMTP) are *not* in a database backup. They are listed in RESTORE.md so you can
  recreate them.
