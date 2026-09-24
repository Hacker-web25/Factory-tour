-- Header strip (VPV + company logo) on the presenter view.
-- Run once in Supabase → SQL editor.

alter table public.tours
  add column if not exists top_strip_enabled boolean not null default false,
  add column if not exists company_logo_path text;

notify pgrst, 'reload schema';
