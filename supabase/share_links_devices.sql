-- Device limit + open tracking for share links.
--
-- device_limit:  max number of DISTINCT viewer fingerprints allowed to
--                open the link. Null = no device limit.
-- last_opened_at: timestamp of the most recent successful open. Used
--                 by the Visitors table so the presenter sees "last
--                 opened 3 min ago".
--
-- Distinct-device counting itself uses the existing tour_events table
-- (viewer_fingerprint per share_link_id) — no separate table needed.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.share_links
  add column if not exists device_limit integer,
  add column if not exists last_opened_at timestamptz;

notify pgrst, 'reload schema';
