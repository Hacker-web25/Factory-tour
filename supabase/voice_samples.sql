-- voice_samples: a short recording of each sales representative's voice,
-- captured at first login, used only to tell the representative's voice
-- apart from the client's voice during meeting audio (for example, to
-- verify who requested a stop-recording).
--
-- Policies that frame this:
--   - /terms#recording-ai         "Voice sample at sales representative onboarding."
--   - /privacy#recordings-ai      "Sales-rep voice samples."
--
-- Storage: a private bucket at <rep_profile_id>/<file>.
-- RLS: a rep reads and writes ONLY their own sample. Org admins (MDs) in
-- the same org can read every sample in their org — this is what makes
-- the stop-recording speaker-verification pass sensible later. VPV super-
-- owner has access via its usual service-role path.

/* ─────────────── profile columns ─────────────── */

alter table public.profiles
  add column if not exists voice_sample_path text,
  add column if not exists voice_sample_captured_at timestamptz;

comment on column public.profiles.voice_sample_path is
  'Object path in the voice-samples storage bucket. NULL until the rep records their one-time sample at first sign-in.';
comment on column public.profiles.voice_sample_captured_at is
  'When the rep recorded their voice sample.';

/* ─────────────── storage bucket ─────────────── */

insert into storage.buckets (id, name, public)
values ('voice-samples', 'voice-samples', false)
on conflict (id) do nothing;

/* ─────────────── RLS on storage.objects for this bucket ─────────────── */

-- Clean slate for re-runs: drop prior incarnations if present.
drop policy if exists "voice sample: owner read"   on storage.objects;
drop policy if exists "voice sample: owner write"  on storage.objects;
drop policy if exists "voice sample: owner update" on storage.objects;
drop policy if exists "voice sample: owner delete" on storage.objects;
drop policy if exists "voice sample: admin read"   on storage.objects;

-- Paths are <rep_profile_id>/<file>. storage.foldername(name)[1] is the
-- rep's profile UUID; we require it to match auth.uid() for owner access,
-- and (for MDs) that the rep belongs to the same organisation.

create policy "voice sample: owner read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'voice-samples'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

create policy "voice sample: owner write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'voice-samples'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

create policy "voice sample: owner update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'voice-samples'
  and (storage.foldername(name))[1] = (auth.uid())::text
)
with check (
  bucket_id = 'voice-samples'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

create policy "voice sample: owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'voice-samples'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

-- The MD (org_admin) of the same organisation can read every sample in
-- their org. This is what the stop-recording verification will use.
create policy "voice sample: admin read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'voice-samples'
  and exists (
    select 1
      from public.profiles me
      join public.profiles rep
        on rep.id::text = (storage.foldername(storage.objects.name))[1]
     where me.id = auth.uid()
       and me.role = 'org_admin'
       and me.org_id is not null
       and me.org_id = rep.org_id
  )
);
