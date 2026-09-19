-- ============================================================================
-- Advanced sales tracking: per-presentation GPS location + voice recording.
-- Run this once in the Supabase SQL editor.
-- ============================================================================

-- 1) Per-presentation session record. Keyed by the analytics session_id
--    (one browser tab = one presentation), so it joins cleanly to the
--    session-level stats derived from tour_events.
create table if not exists public.presentation_sessions (
  session_id        text primary key,
  tour_id           uuid references public.tours(id) on delete set null,
  org_id            uuid references public.organizations(id) on delete set null,
  presenter_user_id uuid references public.profiles(id) on delete set null,
  started_at        timestamptz not null default now(),

  -- Location (captured when the presenter opens the tour).
  lat               double precision,
  lng               double precision,
  place             text,           -- reverse-geocoded human place (free API)

  -- Voice recording (only when org auto_record is on).
  audio_path        text,           -- storage path in the "recordings" bucket
  duration_sec      integer,
  transcript        text,           -- live speech-to-text of the presenter
  topics            jsonb,          -- [{ key, label, detail, mentions }]
  consent           boolean default false,

  updated_at        timestamptz not null default now()
);

create index if not exists presentation_sessions_org_idx
  on public.presentation_sessions(org_id, started_at desc);
create index if not exists presentation_sessions_presenter_idx
  on public.presentation_sessions(presenter_user_id, started_at desc);

alter table public.presentation_sessions enable row level security;

-- Same permissive policy style as tour_events (the app scopes reads by org).
drop policy if exists "presentation_sessions read"  on public.presentation_sessions;
drop policy if exists "presentation_sessions write" on public.presentation_sessions;
create policy "presentation_sessions read"  on public.presentation_sessions for select using (true);
create policy "presentation_sessions write" on public.presentation_sessions for all    using (true) with check (true);

-- 2) Org-level toggle: auto-record presentations (org_admin decision).
alter table public.organizations
  add column if not exists auto_record boolean not null default false;

-- 3) Storage bucket for the audio blobs. Public read so the org_admin
--    dashboard can play them back via a plain URL. (Flip to private +
--    signed URLs later if you want stricter access.)
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', true)
on conflict (id) do nothing;

-- Allow the app (anon/auth) to upload + read recordings.
drop policy if exists "recordings upload" on storage.objects;
drop policy if exists "recordings read"   on storage.objects;
create policy "recordings upload" on storage.objects
  for insert with check (bucket_id = 'recordings');
create policy "recordings read" on storage.objects
  for select using (bucket_id = 'recordings');

notify pgrst, 'reload schema';
