-- VPV language data — Cloudflare D1 database "vpv-language".
--
-- Everything the subtitles and translation feature stores lives here and NOT in
-- Supabase, so the Supabase free database never fills up with it.
--
-- Safe to run more than once (every statement is IF NOT EXISTS). It does not
-- touch any other table. No foreign keys: the tours themselves live in Supabase,
-- so the tour id here is just a text label that the website checks on every call.
--
-- Deliberately NO extra indexes. Each index is another row written per insert
-- (D1 counts them), and the primary keys below already serve every query:
--   • all rows of one tour + language            → prefix of translations' key
--   • everything of one tour (delete, purge)     → prefix of both keys
--   • one transcript of one tour                 → full key of transcripts

-- 1. Per-tour settings: which language the author wrote in, which languages the
--    visitor can pick, and the subtitle look (size, position, on/off).
CREATE TABLE IF NOT EXISTS tour_language (
  tour_id             TEXT    NOT NULL PRIMARY KEY,
  default_language    TEXT    NOT NULL DEFAULT 'en',
  available_languages TEXT    NOT NULL DEFAULT '[]',   -- JSON array of language codes
  subtitle_settings   TEXT    NOT NULL DEFAULT '{}',   -- JSON object
  updated_at          INTEGER NOT NULL                 -- ms since 1970
) WITHOUT ROWID;

-- 2. Translated text. One row per (tour, language, source text). src_hash is the
--    SHA-1 of the source text, so the viewer looks a string up without sending
--    the string. reviewed = 1 means a person edited it: a later automatic
--    "re-translate" never overwrites it.
CREATE TABLE IF NOT EXISTS translations (
  tour_id         TEXT    NOT NULL,
  lang            TEXT    NOT NULL,
  src_hash        TEXT    NOT NULL,
  source_text     TEXT    NOT NULL,
  translated_text TEXT    NOT NULL,
  engine          TEXT    NOT NULL DEFAULT '',   -- which engine wrote it, or 'manual'
  reviewed        INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (tour_id, lang, src_hash)
) WITHOUT ROWID;

-- 3. Subtitles of one attached audio: the timed lines Whisper produced (and any
--    a person corrected). audio_key is the SHA-1 of the audio's canonical
--    address, so the same file is found again however its URL is written.
CREATE TABLE IF NOT EXISTS transcripts (
  tour_id      TEXT    NOT NULL,
  audio_key    TEXT    NOT NULL,
  audio_ref    TEXT    NOT NULL DEFAULT '',     -- the canonical address, for humans
  source_lang  TEXT    NOT NULL DEFAULT 'en',
  duration_sec REAL,
  segments     TEXT    NOT NULL,                -- JSON: [{ "start": 0.0, "end": 2.5, "text": "…" }]
  engine       TEXT    NOT NULL DEFAULT '',
  reviewed     INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (tour_id, audio_key)
) WITHOUT ROWID;
