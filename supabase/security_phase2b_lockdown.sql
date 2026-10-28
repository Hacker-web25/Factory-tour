-- ============================================================================
-- security_phase2b_lockdown.sql — nobody but the right people can change the
-- product's data or its files.
-- ============================================================================
--
-- PREREQUISITES  (see the roll-out order in security_phase2a_additive.sql)
--     security_phase1.sql  and  security_phase2a_additive.sql  already applied, and the
--     app version from branch `security-hardening` already deployed (it calls the
--     functions 2a adds and writes the audit log with the service role).
--
-- WHAT WAS WRONG (security review, 28 Oct 2026)
--   Twelve tables carried the policy pair  "<t> read" (SELECT, {public}, true)  and
--   "<t> write" (ALL, {public}, true, true), and `anon` held every privilege on
--   them.  The browser's public API key -- which is public by design -- therefore
--   let ANY visitor read, edit or delete every tour, scene, hotspot, share link,
--   recorded sales-meeting transcript (with GPS), calendar entry, assignment and
--   analytics row.  Storage was the same: `anon` could upload to, overwrite and DELETE
--   the 669 panorama files (1 GB) with no size or type limit, and list/download
--   every sales recording.
--
-- WHAT IT DOES
--   • Public viewer keeps working: anyone may still READ a tour/scene/hotspot that
--     is public, unlisted, published or reachable through a live share link
--     (vpv_tour_visible, defined in phase 1).  Nobody else's tours are listable.
--   • WRITES need to be (a) signed in AND (b) the platform owner, or an admin of the
--     workspace the row belongs to.  Merely being signed in is NOT enough: sign-up
--     is open, so "authenticated" is almost as public as "anon".
--   • Sales-meeting data (presentation_sessions), calendar, presence, assignments,
--     analytics events, folders and media-library rows are readable only inside the
--     owning workspace (or by the platform owner).
--   • Storage: only owners / workspace admins may upload or change files; only the
--     platform owner may delete; listing is no longer public; every bucket has a size cap.
--   • log_security_event can no longer be called with the public key (the app now
--     writes the audit log with the server-side key).
--
-- STILL OPEN AFTER THIS FILE  (needs app changes -- "phase 3", listed in the report)
--   • share_links and tour_events stay publicly READable for now: the viewer looks a
--     link up by token with the public key, and the password / e-mail / expiry gates
--     are enforced in the browser.  Writes to both are closed here.
--   • The `recordings` bucket is PRIVATE from this file on (meeting audio is not a feature of any
--     plan).  Playback uses short-lived signed URLs (lib/presentationSession.ts), and a signed-in
--     person can only fetch the audio of a meeting they are allowed to see.
--
-- ROLLBACK: security_phase2b_rollback.sql
-- ============================================================================

begin;

-- ── helpers (all SECURITY DEFINER so they can look past row-level security) ──

create or replace function public.vpv_scene_tour(p_scene uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select tour_id from public.scenes where id = p_scene $$;

create or replace function public.vpv_user_org(p_user uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select org_id from public.profiles where id = p_user $$;

-- May the caller CHANGE this tour (and its scenes / hotspots)?
-- Platform owner always; otherwise an admin of the tour's own workspace.
create or replace function public.vpv_can_edit_tour(p_tour uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select auth.uid() is not null and (
    public.is_platform_owner()
    or exists (
      select 1 from public.tours t
       where t.id = p_tour
         and t.org_id is not null
         and public.is_org_admin_of(t.org_id)
    )
  )
$$;

-- May the caller WORK WITH this tour (share it, see its analytics)?
-- Platform owner, anyone in the tour's workspace, or a presenter assigned to it.
create or replace function public.vpv_can_use_tour(p_tour uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select auth.uid() is not null and (
    public.is_platform_owner()
    or exists (
      select 1 from public.tours t
       where t.id = p_tour
         and (
              (t.org_id is not null and t.org_id = public.vpv_my_org())
           or exists (select 1 from public.tour_assignments ta
                       where ta.tour_id = t.id and ta.user_id = auth.uid())
         )
    )
  )
$$;

-- Is the caller an admin-level user (platform owner or a workspace admin)?
create or replace function public.vpv_is_staff()
returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(public.vpv_my_role() in ('owner', 'org_admin'), false) $$;

grant execute on function public.vpv_scene_tour(uuid)    to anon, authenticated, service_role;
grant execute on function public.vpv_user_org(uuid)      to authenticated, service_role;
grant execute on function public.vpv_can_edit_tour(uuid) to anon, authenticated, service_role;
grant execute on function public.vpv_can_use_tour(uuid)  to anon, authenticated, service_role;
grant execute on function public.vpv_is_staff()          to authenticated, service_role;
revoke execute on function public.vpv_user_org(uuid)     from public, anon;
revoke execute on function public.vpv_is_staff()         from public, anon;

-- ── drop every old open policy ──────────────────────────────────────────────
-- Policies starting with vpv_ are kept on purpose: the database already carries RESTRICTIVE
-- "workspace lapsed" locks (vpv_lock_tours_*, vpv_lock_scenes).  Restrictive policies only ever
-- narrow access, so they sit safely on top of the permissive policies created below.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('tours','scenes','hotspots','share_links','tour_assignments',
                         'tour_events','presence','presentation_sessions',
                         'calendar_events','asset_folders','folders','recent_uploads')
       and policyname !~ '^vpv_'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ── tours / scenes / hotspots ───────────────────────────────────────────────

create policy vpv_tours_select on public.tours for select to anon, authenticated
  using (public.vpv_tour_visible(id));
create policy vpv_tours_insert on public.tours for insert to authenticated
  with check (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));
create policy vpv_tours_update on public.tours for update to authenticated
  using (public.vpv_can_edit_tour(id))
  with check (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));
create policy vpv_tours_delete on public.tours for delete to authenticated
  using (public.vpv_can_edit_tour(id));

create policy vpv_scenes_select on public.scenes for select to anon, authenticated
  using (public.vpv_tour_visible(tour_id));
create policy vpv_scenes_insert on public.scenes for insert to authenticated
  with check (public.vpv_can_edit_tour(tour_id));
create policy vpv_scenes_update on public.scenes for update to authenticated
  using (public.vpv_can_edit_tour(tour_id))
  with check (public.vpv_can_edit_tour(tour_id));
create policy vpv_scenes_delete on public.scenes for delete to authenticated
  using (public.vpv_can_edit_tour(tour_id));

create policy vpv_hotspots_select on public.hotspots for select to anon, authenticated
  using (public.vpv_tour_visible(public.vpv_scene_tour(scene_id)));
create policy vpv_hotspots_insert on public.hotspots for insert to authenticated
  with check (public.vpv_can_edit_tour(public.vpv_scene_tour(scene_id)));
create policy vpv_hotspots_update on public.hotspots for update to authenticated
  using (public.vpv_can_edit_tour(public.vpv_scene_tour(scene_id)))
  with check (public.vpv_can_edit_tour(public.vpv_scene_tour(scene_id)));
create policy vpv_hotspots_delete on public.hotspots for delete to authenticated
  using (public.vpv_can_edit_tour(public.vpv_scene_tour(scene_id)));

-- ── share links ─────────────────────────────────────────────────────────────
-- READ stays open (the viewer resolves a link by token with the public key) -- see
-- the header.  WRITE needs a signed-in person who may work with the tour.

create policy vpv_share_links_select_open on public.share_links for select to anon, authenticated
  using (true);
create policy vpv_share_links_insert on public.share_links for insert to authenticated
  with check (public.vpv_can_use_tour(tour_id));
create policy vpv_share_links_update on public.share_links for update to authenticated
  using (public.vpv_can_use_tour(tour_id))
  with check (public.vpv_can_use_tour(tour_id));
create policy vpv_share_links_delete on public.share_links for delete to authenticated
  using (public.vpv_can_use_tour(tour_id));

-- ── presenter assignments ───────────────────────────────────────────────────

create policy vpv_tour_assignments_select on public.tour_assignments for select to authenticated
  using (user_id = auth.uid() or public.vpv_can_use_tour(tour_id));
create policy vpv_tour_assignments_insert on public.tour_assignments for insert to authenticated
  with check (
    public.vpv_can_edit_tour(tour_id)
    and (public.is_platform_owner() or public.vpv_user_org(user_id) is not distinct from public.tour_org_of(tour_id))
  );
create policy vpv_tour_assignments_update on public.tour_assignments for update to authenticated
  using (public.vpv_can_edit_tour(tour_id))
  with check (
    public.vpv_can_edit_tour(tour_id)
    and (public.is_platform_owner() or public.vpv_user_org(user_id) is not distinct from public.tour_org_of(tour_id))
  );
create policy vpv_tour_assignments_delete on public.tour_assignments for delete to authenticated
  using (public.vpv_can_edit_tour(tour_id));

-- ── analytics events ────────────────────────────────────────────────────────
-- Written by /api/analytics/event with the server key, so no browser policy for
-- INSERT.  Readable inside the tour's workspace, or by the presenter who made them.

create policy vpv_tour_events_select on public.tour_events for select to authenticated
  using (presenter_user_id = auth.uid() or public.vpv_can_use_tour(tour_id));
create policy vpv_tour_events_owner_all on public.tour_events for all to authenticated
  using (public.is_platform_owner()) with check (public.is_platform_owner());

-- ── presence ("who is online / editing") ────────────────────────────────────

create policy vpv_presence_select on public.presence for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_owner()
    or (public.vpv_my_org() is not null and public.vpv_user_org(user_id) = public.vpv_my_org())
  );
create policy vpv_presence_insert on public.presence for insert to authenticated
  with check (user_id = auth.uid());
create policy vpv_presence_update on public.presence for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy vpv_presence_delete on public.presence for delete to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());

-- ── sales-meeting sessions (transcripts, GPS, audio paths, AI analysis) ─────

create policy vpv_presentation_sessions_select on public.presentation_sessions for select to authenticated
  using (
    public.is_platform_owner()
    or presenter_user_id = auth.uid()
    or (org_id is not null and org_id = public.vpv_my_org())
  );
create policy vpv_presentation_sessions_insert on public.presentation_sessions for insert to authenticated
  with check (
    public.is_platform_owner()
    or (org_id is not null and org_id = public.vpv_my_org()
        and (presenter_user_id is null or presenter_user_id = auth.uid() or public.is_org_admin_of(org_id)))
  );
create policy vpv_presentation_sessions_update on public.presentation_sessions for update to authenticated
  using (
    public.is_platform_owner()
    or presenter_user_id = auth.uid()
    or (org_id is not null and public.is_org_admin_of(org_id))
  )
  with check (
    public.is_platform_owner()
    or (org_id is not null and org_id = public.vpv_my_org()
        and (presenter_user_id is null or presenter_user_id = auth.uid() or public.is_org_admin_of(org_id)))
  );
create policy vpv_presentation_sessions_delete on public.presentation_sessions for delete to authenticated
  using (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));

-- ── calendar ────────────────────────────────────────────────────────────────

create policy vpv_calendar_events_all on public.calendar_events for all to authenticated
  using (public.is_platform_owner() or (org_id is not null and org_id = public.vpv_my_org()))
  with check (public.is_platform_owner() or (org_id is not null and org_id = public.vpv_my_org()));

-- ── media library and tour folders (no workspace column: staff only) ────────

create policy vpv_asset_folders_select on public.asset_folders for select to authenticated
  using (public.vpv_is_staff() and (org_id is null or org_id = public.vpv_my_org() or public.is_platform_owner()));
create policy vpv_asset_folders_write on public.asset_folders for all to authenticated
  using (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)))
  with check (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));

create policy vpv_recent_uploads_all on public.recent_uploads for all to authenticated
  using (public.vpv_is_staff()) with check (public.vpv_is_staff());

create policy vpv_folders_select on public.folders for select to authenticated
  using (public.vpv_is_staff() or public.vpv_my_org() is not null);
create policy vpv_folders_write on public.folders for all to authenticated
  using (public.vpv_is_staff()) with check (public.vpv_is_staff());

-- ── table privileges: the public key keeps only what the public viewer needs ─

revoke all on public.tours, public.scenes, public.hotspots, public.share_links,
              public.tour_assignments, public.tour_events, public.presence,
              public.presentation_sessions, public.calendar_events,
              public.asset_folders, public.folders, public.recent_uploads
  from anon;
grant select on public.tours, public.scenes, public.hotspots, public.share_links to anon;

revoke truncate, references, trigger
  on public.tours, public.scenes, public.hotspots, public.share_links,
     public.tour_assignments, public.tour_events, public.presence,
     public.presentation_sessions, public.calendar_events,
     public.asset_folders, public.folders, public.recent_uploads
  from authenticated;

-- ── storage ─────────────────────────────────────────────────────────────────

drop policy if exists "panoramas delete"  on storage.objects;
drop policy if exists "panoramas insert"  on storage.objects;
drop policy if exists "panoramas read"    on storage.objects;
drop policy if exists "panoramas update"  on storage.objects;
drop policy if exists "recordings read"   on storage.objects;
drop policy if exists "recordings upload" on storage.objects;
drop policy if exists "tours read"        on storage.objects;
drop policy if exists "tours upload"      on storage.objects;

-- Public buckets still serve files by URL without any policy; these control who can
-- LIST, upload, overwrite and delete.
create policy vpv_panoramas_select on storage.objects for select to authenticated
  using (bucket_id = 'panoramas' and public.vpv_is_staff());
create policy vpv_panoramas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'panoramas' and public.vpv_is_staff());
create policy vpv_panoramas_update on storage.objects for update to authenticated
  using (bucket_id = 'panoramas' and public.vpv_is_staff())
  with check (bucket_id = 'panoramas' and public.vpv_is_staff());
create policy vpv_panoramas_delete on storage.objects for delete to authenticated
  using (bucket_id = 'panoramas' and public.is_platform_owner());

create policy vpv_tours_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'tours' and public.vpv_is_staff());
create policy vpv_tours_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tours' and public.vpv_is_staff());
create policy vpv_tours_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'tours' and public.vpv_is_staff())
  with check (bucket_id = 'tours' and public.vpv_is_staff());

-- Recordings are named "<session_id>.<ext>".  A file is readable / writable only if the caller
-- can see that meeting (presentation_sessions has its own row-level security, which applies inside
-- this sub-select), so one workspace can never list or fetch another workspace's audio.
-- The platform owner sees all.
update storage.buckets set public = false where id = 'recordings';

create policy vpv_recordings_select on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (
      public.is_platform_owner()
      or exists (select 1 from public.presentation_sessions ps
                  where ps.session_id = split_part(storage.objects.name, '.', 1))
    )
  );
create policy vpv_recordings_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (
      public.is_platform_owner()
      or exists (select 1 from public.presentation_sessions ps
                  where ps.session_id = split_part(storage.objects.name, '.', 1))
    )
  );

-- Size caps (the largest file in use today is 48 MB).
update storage.buckets set file_size_limit = 209715200 where id in ('panoramas', 'recordings');
update storage.buckets set file_size_limit = 104857600 where id = 'tours';

-- ── the audit log can no longer be forged with the public key ───────────────

revoke all on function public.log_security_event(text, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.log_security_event(text, uuid, text, jsonb, text, text) to service_role;

commit;
