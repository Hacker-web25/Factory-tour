-- recording_stops — every time a sales rep stops a recording mid-meeting.
--
-- Why this exists: a rep who stops recording removes the MD's only record
-- of how the meeting went. Sometimes that is legitimate (the client asked
-- for it). So when a rep presses Stop, VPV keeps recording for a short
-- window (TRAILING_SECONDS, 15 s today) and logs the stop here, so the MD
-- can listen to what was said around the stop and judge for themselves.
--
-- We do NOT store a second audio file. The session recording already
-- lives at recordings/<session_id>, and `stop_offset_sec` says where in
-- that file the Stop was pressed. The MD's player seeks there, which also
-- lets them scrub backwards for context — fairer than a 15-second clip
-- with no lead-in.
--
-- verdict is the AUTOMATED judgement and defaults to 'unverified':
--     verified_valid  a client in the room was heard asking to stop
--     unverified      we could not tell (bad audio, no voice sample, mixed
--                     languages, the detector simply missed) — the SAFE
--                     default, because a miss must never read as guilt
--     flagged         the rep stopped and nothing in the trailing window
--                     supports a client request
-- The MD always has the final word via md_review.
--
-- Policy anchors: /terms#recording-ai, /privacy#recordings-ai.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

create table if not exists public.recording_stops (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  session_id         text not null,
  tour_id            uuid references public.tours(id) on delete set null,
  presenter_user_id  uuid references public.profiles(id) on delete set null,
  client_id          uuid,
  stopped_at         timestamptz not null default now(),

  -- Where in the session audio the Stop was pressed, in seconds.
  stop_offset_sec    integer,
  -- How long we kept recording after Stop.
  trailing_seconds   integer not null default 15,
  -- Set once the trailing window actually completed. A row without this
  -- means the rep closed the tab before the window finished; the MD sees
  -- that as its own signal.
  trailing_captured  boolean not null default false,

  -- Automated judgement. 'unverified' on insert, always.
  verdict            text not null default 'unverified'
                       check (verdict in ('verified_valid', 'unverified', 'flagged')),
  verdict_detail     text,

  -- The MD's decision.
  md_review          text check (md_review in ('ok', 'not_ok')),
  md_reviewed_at     timestamptz,
  md_reviewed_by     uuid references public.profiles(id) on delete set null,
  md_note            text,

  created_at         timestamptz not null default now()
);

create index if not exists recording_stops_org_stopped_idx
  on public.recording_stops (org_id, stopped_at desc);
create index if not exists recording_stops_session_idx
  on public.recording_stops (session_id);
create index if not exists recording_stops_presenter_idx
  on public.recording_stops (presenter_user_id, stopped_at desc);

alter table public.recording_stops enable row level security;

-- A rep may log their OWN stop, and read their own history (so the client
-- can show them "your MD reviewed this"). They may never write a verdict
-- or a review.
drop policy if exists "recstops_insert_own" on public.recording_stops;
create policy "recstops_insert_own" on public.recording_stops
  for insert to authenticated
  with check (
    presenter_user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = recording_stops.org_id
    )
  );

drop policy if exists "recstops_select_own_or_admin" on public.recording_stops;
create policy "recstops_select_own_or_admin" on public.recording_stops
  for select to authenticated
  using (
    presenter_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = recording_stops.org_id
        and p.role in ('org_admin', 'owner')
    )
  );

-- The rep may update ONLY the trailing-window completion flag on their own
-- row (it is written a few seconds after the insert). Everything else about
-- the row is closed to them. Enforced by the trigger below, because a
-- policy cannot restrict individual columns.
drop policy if exists "recstops_update_own_trailing" on public.recording_stops;
create policy "recstops_update_own_trailing" on public.recording_stops
  for update to authenticated
  using (presenter_user_id = auth.uid())
  with check (presenter_user_id = auth.uid());

drop policy if exists "recstops_admin_review" on public.recording_stops;
create policy "recstops_admin_review" on public.recording_stops
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = recording_stops.org_id
        and p.role in ('org_admin', 'owner')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = recording_stops.org_id
        and p.role in ('org_admin', 'owner')
    )
  );

-- Column-level guard. A rep (anyone who is not an org_admin/owner of the
-- row's org, and not the service role) can only ever flip
-- trailing_captured and set stop_offset_sec on their own row. Without this
-- a rep could PATCH verdict='verified_valid' from the browser console and
-- clear themselves.
create or replace function public.recording_stops_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  -- Service role / SQL editor / our own SECURITY DEFINER functions.
  if auth.uid() is null then return new; end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.org_id = new.org_id
      and p.role in ('org_admin', 'owner')
  ) into is_admin;

  if is_admin then
    -- An MD reviews. They must not rewrite the facts of the stop.
    new.org_id            := old.org_id;
    new.session_id        := old.session_id;
    new.tour_id           := old.tour_id;
    new.presenter_user_id := old.presenter_user_id;
    new.stopped_at        := old.stopped_at;
    new.stop_offset_sec   := old.stop_offset_sec;
    new.trailing_seconds  := old.trailing_seconds;
    new.created_at        := old.created_at;
    -- Stamp the reviewer whenever the decision changes.
    if new.md_review is distinct from old.md_review then
      new.md_reviewed_at := now();
      new.md_reviewed_by := auth.uid();
    end if;
    return new;
  end if;

  -- Not an admin: only the two fields the viewer legitimately writes.
  new.org_id            := old.org_id;
  new.session_id        := old.session_id;
  new.tour_id           := old.tour_id;
  new.presenter_user_id := old.presenter_user_id;
  new.client_id         := old.client_id;
  new.stopped_at        := old.stopped_at;
  new.trailing_seconds  := old.trailing_seconds;
  new.verdict           := old.verdict;
  new.verdict_detail    := old.verdict_detail;
  new.md_review         := old.md_review;
  new.md_reviewed_at    := old.md_reviewed_at;
  new.md_reviewed_by    := old.md_reviewed_by;
  new.md_note           := old.md_note;
  new.created_at        := old.created_at;
  return new;
end;
$$;

drop trigger if exists recording_stops_guard_trg on public.recording_stops;
create trigger recording_stops_guard_trg
  before update on public.recording_stops
  for each row execute function public.recording_stops_guard();

-- A rep must never insert a row that already clears them.
create or replace function public.recording_stops_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  new.verdict          := 'unverified';
  new.verdict_detail   := null;
  new.md_review        := null;
  new.md_reviewed_at   := null;
  new.md_reviewed_by   := null;
  new.md_note          := null;
  new.stopped_at       := now();
  return new;
end;
$$;

drop trigger if exists recording_stops_insert_guard_trg on public.recording_stops;
create trigger recording_stops_insert_guard_trg
  before insert on public.recording_stops
  for each row execute function public.recording_stops_insert_guard();

notify pgrst, 'reload schema';
