-- Scene index rail: per-tour thumbnail size + per-scene description.
-- Run once in Supabase → SQL editor.

alter table public.tours
  add column if not exists menu_thumb_size text default 'md';

alter table public.scenes
  add column if not exists description text;

notify pgrst, 'reload schema';
