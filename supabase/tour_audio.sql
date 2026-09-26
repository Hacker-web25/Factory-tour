-- Voice-over / ambient audio: trim support + storage bucket for uploads.
-- Run once in Supabase → SQL editor.

alter table public.scenes
  add column if not exists ambient_audio_trim_start double precision,
  add column if not exists ambient_audio_trim_end   double precision;

alter table public.tours
  add column if not exists ambient_audio_trim_start double precision,
  add column if not exists ambient_audio_trim_end   double precision;

-- Storage bucket for uploaded / recorded tour audio (idempotent).
insert into storage.buckets (id, name, public)
values ('tours', 'tours', true)
on conflict (id) do nothing;

drop policy if exists "tours upload" on storage.objects;
drop policy if exists "tours read"   on storage.objects;
create policy "tours upload" on storage.objects
  for insert with check (bucket_id = 'tours');
create policy "tours read" on storage.objects
  for select using (bucket_id = 'tours');

notify pgrst, 'reload schema';
