-- Pricing tiers: BASIC, PRO, ULTRA.
--
-- Earlier migration added `organizations.plan` with the check
-- ('pro','ultra'). This widens it to ('basic','pro','ultra') and makes
-- 'basic' the default for new orgs so a new customer starts gated.
--
-- Behavior that reads from `plan`:
--   basic → public viewer shows only the first 2 scenes (hard-gated);
--           dashboard shows upgrade pop-up on every Present click;
--           sidebar discount counter pushes PRO.
--   pro   → everything except AI meeting analysis + MIS deep-dive;
--           sidebar discount counter pushes ULTRA.
--   ultra → every feature; no counter, no pop-ups.
--
-- Run once in Supabase → SQL editor. Safe to re-run.
-- IMPORTANT: run `ai_presentation_analysis.sql` first (it creates the
-- `plan` column); this file widens its constraint.

/* ---------- 1. Default new orgs to BASIC ----------------------------- */

alter table public.organizations
  alter column plan set default 'basic';

/* ---------- 2. Replace the two-value constraint with the three-value one. */

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'organizations_plan_check'
  ) then
    alter table public.organizations
      drop constraint organizations_plan_check;
  end if;

  alter table public.organizations
    add constraint organizations_plan_check
    check (plan in ('basic', 'pro', 'ultra'));
end $$;

/* ---------- 3. Settings per plan ------------------------------------- */
-- `basic_scene_cap` lets us tune the "how many scenes visible" number
-- without a code change / redeploy. 2 by default.
alter table public.organizations
  add column if not exists basic_scene_cap integer not null default 2
  check (basic_scene_cap between 1 and 10);

/* ---------- 4. Server-side scene visibility helper -------------------
   RLS keeps the raw scenes table open to the tour's org members and to
   anyone with a valid share link. BASIC-plan gating is instead applied
   by `public_tour_scenes(tour_id)`, the only path the public viewer
   uses: it drops scenes past the org's cap for non-admin callers.

   Admins / owners / org members ALWAYS see the full list (so the
   editor + preview keep working). Only end-customers get the cap.
------------------------------------------------------------------------ */
create or replace function public.public_tour_scenes(p_tour_id uuid)
returns setof public.scenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_plan text;
  v_cap  int;
  v_is_insider boolean := false;
begin
  select org_id into v_org from public.tours where id = p_tour_id;
  if v_org is null then
    -- Unknown tour → return nothing (viewer page will surface not_found).
    return;
  end if;

  select plan, basic_scene_cap into v_plan, v_cap
  from public.organizations where id = v_org;

  -- Any signed-in member of the tour's org (or the super-owner) is an
  -- "insider" and gets to see every scene — otherwise their own editor
  -- preview would be lying to them.
  if auth.uid() is not null then
    select true into v_is_insider
    from public.profiles
    where id = auth.uid()
      and (role = 'owner' or (org_id = v_org));
  end if;

  if v_is_insider or v_plan is distinct from 'basic' then
    return query
      select * from public.scenes
      where tour_id = p_tour_id
      order by order_index;
  else
    return query
      select * from public.scenes
      where tour_id = p_tour_id
      order by order_index
      limit v_cap;
  end if;
end;
$$;

revoke all on function public.public_tour_scenes(uuid) from public;
grant execute on function public.public_tour_scenes(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

/* ---------- Promoting an org -------------------------------------------
   update public.organizations set plan = 'pro'   where slug = 'dukaan';
   update public.organizations set plan = 'ultra' where slug = 'dukaan';
   update public.organizations set basic_scene_cap = 3 where slug = 'trial-xyz';
------------------------------------------------------------------------ */
