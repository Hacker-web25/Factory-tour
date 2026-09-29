-- Adjustable company logo size in the presenter's header strip.
--
-- Percentage of the default height (100 = default 30px, 50 = 15px,
-- 200 = 60px). Null falls back to 100.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.tours
  add column if not exists company_logo_size_pct integer;

notify pgrst, 'reload schema';
