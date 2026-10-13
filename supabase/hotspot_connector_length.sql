-- Adjustable connector length.
--
-- Controls how far a hotspot's card sits from its marker: the stem under
-- the hover card, and the diagonal arm on the anchored popup. Stored in px
-- at default zoom; null falls back to 20.
--
-- Run once in Supabase → SQL editor. Safe to re-run (idempotent).

alter table public.hotspots
  add column if not exists connector_length double precision;

notify pgrst, 'reload schema';
