# Cloudflare media (R2 + Worker)

Pictures and sounds for tours can be stored on Cloudflare R2 instead of Supabase
Storage. It is **off** until the Vercel setting in step 5 is added. Switching it
off again is deleting that setting.

## How it fits together

```
browser ──asks──▶ /api/media/sign (Vercel)    only a signed-in workspace admin gets a slip
browser ──PUT file + slip──▶ media Worker ──▶ R2 bucket "vpv-media"
viewer  ──GET──▶ media Worker ──▶ R2   (not there yet? fetched from Supabase and copied into R2)
```

- No Cloudflare account key is ever in the browser or in Vercel. The website and
  the Worker share one secret that signs 10-minute, single-file upload slips.
- Only the two public buckets move: `panoramas` and `tours`. Private audio
  (`recordings`, `voice-samples`) stays in Supabase.
- Files already in Supabase keep working. The first time anyone opens one, the
  Worker copies it into R2. Nothing has to be copied by hand.

## One-time setup (about 10 minutes)

1. **Create the Worker.** Cloudflare → Workers & Pages → Create → Start with
   Hello World → name it `vpv-media` → Deploy → Edit code → delete everything,
   paste the whole of `cloudflare/media-worker.js` → Deploy.
2. **Connect the bucket.** Worker → Settings → Bindings → Add → R2 bucket →
   variable name `BUCKET`, bucket `vpv-media` → Deploy.
3. **Add the settings.** Worker → Settings → Variables and secrets → Add:
   - Secret `UPLOAD_SECRET`: a long random text (32+ characters). Keep a copy
     for step 5. Never paste it into chat or commit it.
   - Text `FALLBACK_BASE`: `https://didezxkaqkenbjqooagj.supabase.co/storage/v1/object/public`
4. **Copy the Worker address** shown on its page, like
   `https://vpv-media.<your-name>.workers.dev`. Open it: it should say `VPV media`.
   Then open `<address>/panoramas/<the path of any existing scene>`: the picture
   should appear (it came from Supabase and was copied into R2).
5. **Switch the website over.** Vercel → factory-tour → Settings → Environment
   Variables, for Production:
   - `NEXT_PUBLIC_MEDIA_BASE_URL` = the Worker address from step 4 (no slash at the end)
   - `MEDIA_UPLOAD_SECRET` = the same text as `UPLOAD_SECRET`

   Then redeploy (Deployments → the latest → Redeploy). `NEXT_PUBLIC_` values are
   built in, so a redeploy is required.
6. **Test.** In the tour builder upload one scene. Open it in the viewer. In
   Cloudflare → R2 → `vpv-media` the file should be listed.

## Move the files that are still in Supabase, then empty Supabase

Supabase Storage is small and expensive; Cloudflare is large and cheap. The owner
page **/admin/storage** (Admin → *File storage*) shows, for `panoramas` and `tours`,
how many files are in Supabase, how many are already in Cloudflare, and whether the
two copies are identical (a fingerprint of every file is compared, not just names).

1. **Update the Worker once.** Paste the newest `cloudflare/media-worker.js` into
   the `vpv-media` Worker and Deploy. (It adds a private "list files" route that
   only the website can use, and marks each reply `x-vpv-source: r2` or `supabase`.)
2. Open **/admin/storage** as the platform owner → **Copy N files**. It copies in the
   background; leave the tab open until the bar is full. Safe to stop and resume.
3. Make sure a backup has run (scripts/backup/README.md).
4. When the page says *ready*, **Free up Supabase** appears. It deletes from Supabase
   only files that are verified identical in Cloudflare, and it needs the typed
   phrase. After that the site keeps working from Cloudflare alone.

Nothing is ever deleted automatically.

## Switch back

Delete `NEXT_PUBLIC_MEDIA_BASE_URL` in Vercel and redeploy. New uploads go to
Supabase again. Files uploaded to Cloudflare in the meantime stay in R2; the
scene records point at the Worker address, so keep the Worker running.

## Limits worth knowing

- Workers Free allows 100,000 requests a day. Every picture a viewer loads is a
  request, so a busy day on many tours can pass that. The fix is the $5/month
  Workers Paid plan, or serving the bucket from a Cloudflare custom domain
  (needs myvpv.com's DNS on Cloudflare), which has no such limit.
- Largest file: 100 MB (the Workers request limit).
- R2 free every month: 10 GB stored, 1 million writes, 10 million reads. Beyond
  that: $0.015 per GB stored per month. Downloads are free.
- The bucket is in North America (`ENAM`), the default. Viewers anywhere get a
  cached copy from a nearby Cloudflare city after the first view.
