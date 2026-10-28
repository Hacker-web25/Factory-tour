-- ============================================================================
-- security_phase2b_rollback.sql — put the database back exactly as it was before
-- security_phase2b_lockdown.sql.  WARNING: this re-opens every tour, scene, hotspot,
-- share link, sales-meeting transcript and storage bucket to the whole internet.
-- Use it only if the lockdown breaks something you cannot fix forward in minutes.
-- ============================================================================

begin;

-- remove everything the lockdown created.
-- NOTE: the database already had RESTRICTIVE "workspace lapsed" locks named vpv_lock_* on tours
-- and scenes (and vpv_logins_lapsed_* elsewhere).  They are not ours to remove, so they are
-- excluded here — dropping them would let a lapsed workspace edit its tours again.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where policyname ~ '^vpv_'
       and policyname !~ '^vpv_(lock|logins_lapsed)_'
       and ((schemaname = 'public'
             and tablename in ('tours','scenes','hotspots','share_links','tour_assignments',
                               'tour_events','presence','presentation_sessions',
                               'calendar_events','asset_folders','folders','recent_uploads'))
            or (schemaname = 'storage' and tablename = 'objects'))
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- the original open policies
do $$
declare t text;
begin
  foreach t in array array['asset_folders','calendar_events','folders','hotspots','presence',
                           'presentation_sessions','recent_uploads','scenes','share_links',
                           'tour_assignments','tour_events','tours']
  loop
    execute format('create policy %I on public.%I for select to public using (true)', t || ' read', t);
    execute format('create policy %I on public.%I for all to public using (true) with check (true)', t || ' write', t);
  end loop;
end $$;
create policy "public read hotspots"  on public.hotspots for select to public using (true);
create policy "public write hotspots" on public.hotspots for all    to public using (true) with check (true);
create policy "public read scenes"    on public.scenes   for select to public using (true);
create policy "public write scenes"   on public.scenes   for all    to public using (true) with check (true);
create policy "public read tours"     on public.tours    for select to public using (true);
create policy "public write tours"    on public.tours    for all    to public using (true) with check (true);

grant all on public.tours, public.scenes, public.hotspots, public.share_links,
             public.tour_assignments, public.tour_events, public.presence,
             public.presentation_sessions, public.calendar_events,
             public.asset_folders, public.folders, public.recent_uploads
  to anon, authenticated;

-- storage
create policy "panoramas delete"  on storage.objects for delete to public using (bucket_id = 'panoramas');
create policy "panoramas insert"  on storage.objects for insert to public with check (bucket_id = 'panoramas');
create policy "panoramas read"    on storage.objects for select to public using (bucket_id = 'panoramas');
create policy "panoramas update"  on storage.objects for update to public
  using (bucket_id = 'panoramas') with check (bucket_id = 'panoramas');
create policy "recordings read"   on storage.objects for select to public using (bucket_id = 'recordings');
create policy "recordings upload" on storage.objects for insert to public with check (bucket_id = 'recordings');
create policy "tours read"        on storage.objects for select to public using (bucket_id = 'tours');
create policy "tours upload"      on storage.objects for insert to public with check (bucket_id = 'tours');
update storage.buckets set file_size_limit = null where id in ('panoramas', 'recordings', 'tours');

-- the audit log function as it was
grant execute on function public.log_security_event(text, uuid, text, jsonb, text, text)
  to public, anon, authenticated, service_role;

drop function if exists public.vpv_is_staff();
drop function if exists public.vpv_can_use_tour(uuid);
drop function if exists public.vpv_can_edit_tour(uuid);
drop function if exists public.vpv_user_org(uuid);
drop function if exists public.vpv_scene_tour(uuid);

commit;
