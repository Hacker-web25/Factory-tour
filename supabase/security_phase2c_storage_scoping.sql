-- ============================================================================
-- security_phase2c_storage_scoping.sql — one workspace can no longer touch another
-- workspace's panorama files.   APPLIED to production on 28 Oct 2026 (after 2b).
-- ============================================================================
-- Phase 2b limited storage writes to "staff" (platform owner or any workspace admin).  That still let the
-- admin of workspace A list, overwrite or delete a file inside workspace B's tour folder.  Panorama files
-- are stored as "<tour_id>/<random>.<ext>"; shared assets sit under fixed folders (icons/, docs/, images/ ...).
--   • list / add : staff, but only in tour folders they may use / edit, plus the shared folders
--   • overwrite / delete : only inside a tour folder the caller may edit (platform owner: anywhere)
--   • "tours" bucket (logos, tour audio): every upload uses a fresh name, so overwrite is platform-owner only
-- Rollback: security_phase2b_rollback.sql (drops every vpv_ policy on storage.objects and restores the
-- original ones).
-- ============================================================================

create or replace function public.vpv_storage_tour_folder(p_name text)
returns uuid language sql stable security definer set search_path = public, storage as
$$
  select case
           when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then ((storage.foldername(p_name))[1])::uuid
         end
$$;
revoke all on function public.vpv_storage_tour_folder(text) from public, anon;
grant execute on function public.vpv_storage_tour_folder(text) to authenticated, service_role;

drop policy if exists vpv_panoramas_select on storage.objects;
drop policy if exists vpv_panoramas_insert on storage.objects;
drop policy if exists vpv_panoramas_update on storage.objects;
drop policy if exists vpv_panoramas_delete on storage.objects;
drop policy if exists vpv_tours_bucket_update on storage.objects;

create policy vpv_panoramas_select on storage.objects for select to authenticated
  using (
    bucket_id = 'panoramas' and public.vpv_is_staff()
    and (public.is_platform_owner()
         or public.vpv_storage_tour_folder(name) is null
         or public.vpv_can_use_tour(public.vpv_storage_tour_folder(name)))
  );
create policy vpv_panoramas_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'panoramas' and public.vpv_is_staff()
    and (public.is_platform_owner()
         or public.vpv_storage_tour_folder(name) is null
         or public.vpv_can_edit_tour(public.vpv_storage_tour_folder(name)))
  );
create policy vpv_panoramas_update on storage.objects for update to authenticated
  using (
    bucket_id = 'panoramas'
    and (public.is_platform_owner()
         or (public.vpv_storage_tour_folder(name) is not null
             and public.vpv_can_edit_tour(public.vpv_storage_tour_folder(name))))
  )
  with check (
    bucket_id = 'panoramas'
    and (public.is_platform_owner()
         or (public.vpv_storage_tour_folder(name) is not null
             and public.vpv_can_edit_tour(public.vpv_storage_tour_folder(name))))
  );
create policy vpv_panoramas_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'panoramas'
    and (public.is_platform_owner()
         or (public.vpv_storage_tour_folder(name) is not null
             and public.vpv_can_edit_tour(public.vpv_storage_tour_folder(name))))
  );

create policy vpv_tours_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'tours' and public.is_platform_owner())
  with check (bucket_id = 'tours' and public.is_platform_owner());
