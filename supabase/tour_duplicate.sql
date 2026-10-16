-- Tour duplication for MDs — a per-client variant of an existing tour.
--
-- The MD picks a tour, chooses a subset of its scenes, gives the copy a
-- new name, and gets a brand-new tour on their dashboard that their
-- sales team can present to that specific client. The duplicate is a
-- real tour row of its own: text edits do not touch the original.
--
-- Column:   source_tour_id    uuid, points back to the tour this was
--                             duplicated from. NULL on originals.
--
-- Function: duplicate_tour_for_md(p_source, p_new_title, p_scene_ids)
--   returns the new tour id. SECURITY DEFINER so the policy that
--   locks inserts to our own-org cannot say no on a legitimate MD
--   action, but the function enforces that check itself:
--     - caller must be signed in
--     - caller.role must be org_admin or owner
--     - the source tour's org_id must match caller.org_id (unless owner)
--     - the workspace must not be support-locked (org_workspace_open)
--     - the title and scene list must be sensible
--
-- Objects outside this file (storage images, audio) are not copied;
-- scene image_path values are shared with the source. Both tours live
-- in the same org, so the storage access rules are already satisfied.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.tours
  add column if not exists source_tour_id uuid references public.tours(id) on delete set null;

create index if not exists tours_source_tour_id_idx
  on public.tours (source_tour_id);

create or replace function public.duplicate_tour_for_md(
  p_source     uuid,
  p_new_title  text,
  p_scene_ids  uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role   text;
  caller_org    uuid;
  src_org       uuid;
  new_tour_id   uuid;
  src_tour_json jsonb;
  rec_scene     record;
  scene_remap   jsonb := '{}'::jsonb;
  new_scene_id  uuid;
  new_scene_json jsonb;
  rec_hs        record;
  new_hs_id     uuid;
  new_hs_json   jsonb;
  tgt_old       text;
  tgt_new       text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select p.role, p.org_id into caller_role, caller_org
    from public.profiles p where p.id = auth.uid();
  if caller_role is null then raise exception 'not_authenticated'; end if;
  if caller_role not in ('org_admin', 'owner') then
    raise exception 'forbidden';
  end if;

  select t.org_id into src_org from public.tours t where t.id = p_source;
  if src_org is null then raise exception 'source_not_found'; end if;
  if caller_role = 'org_admin' and src_org is distinct from caller_org then
    raise exception 'forbidden';
  end if;

  -- Respect the support-lapse lock: a locked workspace cannot create.
  if not public.org_workspace_open(src_org) then
    raise exception 'workspace_locked';
  end if;

  if p_new_title is null or btrim(p_new_title) = '' then
    raise exception 'title_required';
  end if;
  if p_scene_ids is null or coalesce(array_length(p_scene_ids, 1), 0) = 0 then
    raise exception 'no_scenes_selected';
  end if;

  new_tour_id := gen_random_uuid();

  -- 1) Clone the tour row by JSON round-trip. jsonb_populate_record
  --    lines up every current column, so adding a new column to tours
  --    later does not require editing this function.
  select to_jsonb(t.*) into src_tour_json from public.tours t where t.id = p_source;
  src_tour_json := src_tour_json
    || jsonb_build_object(
         'id',             new_tour_id::text,
         'title',          left(btrim(p_new_title), 200),
         'cover_scene_id', null,
         'published',      false,
         'visibility',     'private',
         'source_tour_id', p_source::text
       );
  -- Let Postgres fill timestamps itself.
  src_tour_json := src_tour_json - 'created_at' - 'updated_at';

  insert into public.tours
    select * from jsonb_populate_record(null::public.tours, src_tour_json);

  -- 2) Clone the SELECTED scenes.
  for rec_scene in
    select to_jsonb(s.*) as data, s.id as old_id
      from public.scenes s
     where s.tour_id = p_source
       and s.id = any(p_scene_ids)
     order by s.order_index
  loop
    new_scene_id := gen_random_uuid();
    scene_remap := scene_remap
      || jsonb_build_object(rec_scene.old_id::text, new_scene_id::text);
    new_scene_json := rec_scene.data
      || jsonb_build_object(
           'id',       new_scene_id::text,
           'tour_id',  new_tour_id::text
         );
    new_scene_json := new_scene_json - 'created_at';
    insert into public.scenes
      select * from jsonb_populate_record(null::public.scenes, new_scene_json);
  end loop;

  -- 3) Clone hotspots on the selected scenes. Remap scene_id and
  --    target_scene_id into the new ids; drop any target that points
  --    at a scene the MD left out of the duplicate.
  for rec_hs in
    select to_jsonb(h.*) as data, h.scene_id as old_scene_id
      from public.hotspots h
     where h.scene_id = any(p_scene_ids)
  loop
    new_hs_id := gen_random_uuid();
    new_hs_json := rec_hs.data
      || jsonb_build_object(
           'id',       new_hs_id::text,
           'scene_id', scene_remap->>(rec_hs.old_scene_id::text)
         );
    tgt_old := new_hs_json->>'target_scene_id';
    if tgt_old is not null then
      tgt_new := scene_remap->>tgt_old;
      new_hs_json := new_hs_json
        || jsonb_build_object('target_scene_id', tgt_new);
    end if;
    -- The master-scene allowlist points at the OLD ids; null it so the
    -- master hotspot appears in every new scene by default. The MD can
    -- re-pick an allowlist in the editor if they want to.
    if (new_hs_json ? 'master_scene_ids') then
      new_hs_json := new_hs_json
        || jsonb_build_object('master_scene_ids', null);
    end if;
    new_hs_json := new_hs_json - 'created_at';
    insert into public.hotspots
      select * from jsonb_populate_record(null::public.hotspots, new_hs_json);
  end loop;

  -- 4) Set the duplicate's cover to its first scene (by order_index).
  update public.tours
     set cover_scene_id = (
       select s.id from public.scenes s
        where s.tour_id = new_tour_id
        order by s.order_index
        limit 1
     )
   where id = new_tour_id;

  return new_tour_id;
end;
$$;

grant execute on function public.duplicate_tour_for_md(uuid, text, uuid[])
  to authenticated;

notify pgrst, 'reload schema';
