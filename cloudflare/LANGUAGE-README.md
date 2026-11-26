# Subtitles and translations (Cloudflare D1 + Workers AI)

Subtitles and translated tour text are stored in **Cloudflare**, not in Supabase.
Supabase receives nothing from this feature, so it cannot fill the free plan.

## How it fits together

```
editor (browser)  ──▶ /api/language/*  (Vercel: checks who you are, may you edit this tour)
                         │
                         └──▶ language Worker "vpv-language" ──▶ D1 database "vpv-language"
                                                              └─▶ Workers AI (speech-to-text, translation fallback)
viewer (browser)  ──▶ /api/language/config, /translations, /transcript  (read only, same permission as the tour)
```

- The Worker is **private**. Only the website knows its secret. Nobody can call it
  from a browser directly, and the Worker never decides who may see a tour; Vercel does.
- Tours, hotspots, logins and billing stay in Supabase exactly as before.
- What is stored per tour in D1: the language it is written in, the languages on
  offer, the subtitle look, every translation (keyed by the text) and every
  subtitle line. A one-hour recording is a few hundred lines, roughly 100 KB.
- Subtitles are made in the **owner's browser**: the recording is decoded there,
  cut at quiet moments into pieces of about 30 seconds, and each piece is sent for
  speech-to-text. A piece that fails is retried; a recording is never half-saved.
- Translations are checked before they are saved (not empty, not a refusal, web
  addresses and numbers kept, the right alphabet for the language). Anything that
  fails the check is shown as "still to translate" instead of being saved wrong.
- Text a person corrected is marked **checked by you** and is never overwritten by
  an automatic run (only by "Redo" on a recording, after a confirmation).

## One-time setup (about 10 minutes)

The D1 database `vpv-language` (id `2c789ab7-1063-48be-acff-2873870162fd`) already
exists with its three tables. If it is ever recreated, run
`cloudflare/language-schema.sql` against it (safe to run twice).

1. **Create the Worker.** Cloudflare → Workers & Pages → Create → Start with
   Hello World → name it `vpv-language` → Deploy → Edit code → delete everything,
   paste the whole of `cloudflare/language-worker.js` → Deploy.
2. **Connect the database and Workers AI.** Worker → Settings → Bindings → Add:
   - D1 database → variable name `DB`, database `vpv-language`
   - Workers AI → variable name `AI`
   Then Deploy.
3. **Add the settings.** Worker → Settings → Variables and secrets → Add:
   - Secret `LANG_API_SECRET`: a long random text (32+ characters). Keep a copy for
     step 5. Never paste it into chat or commit it.
   - Optional text `LLM_MODEL`: the Workers AI chat model used as a translation
     fallback (default `@cf/google/gemma-4-26b-a4b-it`).
4. **Copy the Worker address**, like `https://vpv-language.<your-name>.workers.dev`.
   Opening it in a browser should say `VPV language`.
5. **Switch the website on.** Vercel → factory-tour → Settings → Environment
   Variables, Production:
   - `LANGUAGE_API_URL` = the Worker address (no slash at the end)
   - `LANGUAGE_API_SECRET` = the same text as `LANG_API_SECRET`
   - Recommended: `GEMINI_API_KEY` (best translation quality, and it keeps the free
     Cloudflare allowance for speech-to-text). Optional `GEMINI_MODEL` if the default
     model name has been retired. Optional `TRANSLATE_PROVIDERS`, default
     `gemini,workers-ai,nvidia` (the order tried; the next one only handles what the
     previous could not).
   Then redeploy.
6. **Check it.** Signed in as the platform owner, open
   `https://myvpv.com/api/language/selftest?whisper=1`. Every line should say `ok`:
   the two settings, the Worker, a real write/read/delete in D1, each translation
   engine on a real sentence, and speech-to-text on one second of silence. Anything
   that says `false` names what to fix. No secret is ever shown.

## Using it (editor → Photo tab)

- **Translations**: choose the language the tour is written in, then *+ Add language*.
  The whole tour (and any subtitles) is translated first, then offered to visitors.
  *Translate missing* fills gaps (e.g. after adding hotspots; press *Check for new text*),
  *Review & edit* shows every text beside its translation, *Redo all* re-translates the
  machine ones.
- **Subtitles**: every sound in the tour is listed. *Generate* makes the subtitles
  and translates them into every language on offer. *Edit* corrects the lines and
  their timing. The *Style* section sets where and how they appear.
- Subtitles can be made for a recording of up to 90 minutes / 120 MB. A browser reads
  the whole file at once, so very long recordings should be split.

## Limits and cost

| | Free plan | Paid plan |
|---|---|---|
| Speech-to-text (Whisper large-v3-turbo) | 10,000 Workers AI "neurons" a day, about 3½ hours of audio | about $0.0005 per audio minute |
| Translation | Gemini free tier if a key is set; otherwise Workers AI shares the same daily neurons | pay per use |
| D1 storage / reads / writes | 5 GB, 5 M reads, 100 k writes a day | far more |

When the daily allowance is used up the editor says so in plain words and nothing
is saved half-done; try again the next day or move the Worker to the Paid plan.

## Who sees it

While `subtitles_translations` is `hidden` in `lib/entitlements.ts`, only the platform
owner can create or change languages and subtitles (the API refuses everyone else), and
the viewer does not show subtitles. A tour the owner has translated does show its language
picker to visitors. Opening the feature to customers later is that one setting plus the
plan placement.

## Cleaning up

Deleting a tour from the dashboard also deletes its language data here. If a tour is
removed some other way, its few rows stay behind harmlessly (`/stats` on the Worker
shows the counts); `POST /api/language/purge` with the tour id removes them.
