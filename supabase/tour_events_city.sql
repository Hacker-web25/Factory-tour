-- /visitors location fix: tour_events now stores city too, so the
-- Visitors table can show "Mumbai, IN" instead of just a country code.
-- Country was already a column but was never written by the client
-- (see trackEvent in lib/analytics.ts); the new API route
-- /api/analytics/event populates both from the Vercel geolocation
-- headers (x-vercel-ip-country, x-vercel-ip-city) at insert time.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.tour_events
  add column if not exists country text,
  add column if not exists city text;

create index if not exists tour_events_share_link_id_created_idx
  on public.tour_events (share_link_id, created_at desc);

notify pgrst, 'reload schema';
