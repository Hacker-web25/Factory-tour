-- ============================================================================
-- security_phase1.sql — close the account-takeover path and the public-viewer bug
-- ============================================================================
--
-- WHY THIS EXISTS (found in the 28 Oct 2026 security review)
--
--  1. handle_new_user() gave EVERY new auth user role = 'owner'. With public
--     sign-up (and Google sign-in) switched on, any stranger became a
--     platform owner the moment they signed in: owner passes ownerGuard (every
--     /api/admin route), is_platform_owner() (billing tables, admin_set_org_plan)
--     and the org billing triggers.
--  2. `profiles` was world-writable (USING true / WITH CHECK true for {public}),
--     so even without (1) anybody could UPDATE profiles SET role = 'owner'.
--  3. invite_codes was world-writable: anyone could mint a code for any
--     workspace and redeem it.
--  4. `organizations` (billing e-mail, phone, GSTIN, address, plan) was readable
--     and writable by the whole internet.
--  5. public_tour_scenes() returns NOTHING for a tour whose org_id is NULL, and
--     every tour in production is org-less (built by the platform owner), so the
--     public viewer, embeds and share links showed "This tour has no scenes yet".
--
-- WHAT THIS FILE DOES NOT TOUCH: tours / scenes / hotspots / share_links / tour_*
-- policies. They are tightened in security_phase2a_additive.sql / security_phase2b_lockdown.sql (kept separate so each can be
-- rolled back on its own). Rollback for this file: security_phase1_rollback.sql.
--
-- Trust model used by every guard below: a call is "from a browser" when
-- current_user is 'anon' or 'authenticated' (PostgREST switches to that role).
-- Service role, migrations, the SQL editor and SECURITY DEFINER functions run as
-- something else and are trusted -- the same convention protect_org_billing_columns()
-- already uses.
-- ============================================================================

begin;

-- ── helpers ────────────────────────────────────────────────────────────────

create or replace function public.vpv_my_org()
returns uuid language sql stable security definer set search_path = public as
$$ select org_id from public.profiles where id = auth.uid() $$;

create or replace function public.vpv_my_role()
returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- Has the caller redeemed an invite code that belongs to this workspace?
create or replace function public.vpv_has_redeemed_invite(p_org uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select auth.uid() is not null and exists (
    select 1 from public.invite_codes ic
     where ic.org_id = p_org
       and auth.uid()::text = any (coalesce(ic.used_by::text[], '{}'::text[]))
  )
$$;

-- Does the caller's invited_via_code / device_limit pair match a code they redeemed?
create or replace function public.vpv_invite_matches_me(p_code text, p_limit integer)
returns boolean language sql stable security definer set search_path = public as
$$
  select auth.uid() is not null and exists (
    select 1 from public.invite_codes ic
     where ic.code = p_code
       and coalesce(ic.device_limit, 1) = coalesce(p_limit, 1)
       and auth.uid()::text = any (coalesce(ic.used_by::text[], '{}'::text[]))
  )
$$;

-- Is this tour something the caller may SEE?  A tour is visible when it is
-- public/unlisted/published, when it has a live share link (the link IS the
-- permission), or when the caller belongs to its workspace / is assigned to it /
-- is the platform owner.  Everything else stays private.
create or replace function public.vpv_tour_visible(p_tour uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select public.is_platform_owner()
      or exists (
        select 1 from public.tours t
         where t.id = p_tour
           and (
                coalesce(t.published, false)
             or coalesce(t.visibility, 'private') <> 'private'
             or (auth.uid() is not null and t.org_id is not null and t.org_id = public.vpv_my_org())
             or exists (
                  select 1 from public.share_links sl
                   where sl.tour_id = t.id
                     and sl.revoked_at is null
                     and (sl.expires_at is null or sl.expires_at > now()))
             or (auth.uid() is not null and exists (
                  select 1 from public.tour_assignments ta
                   where ta.tour_id = t.id and ta.user_id = auth.uid()))
           )
      )
$$;

grant execute on function public.vpv_my_org()                      to anon, authenticated, service_role;
grant execute on function public.vpv_my_role()                     to anon, authenticated, service_role;
grant execute on function public.vpv_has_redeemed_invite(uuid)    to authenticated, service_role;
grant execute on function public.vpv_invite_matches_me(text, integer) to authenticated, service_role;
grant execute on function public.vpv_tour_visible(uuid)           to anon, authenticated, service_role;
revoke execute on function public.vpv_has_redeemed_invite(uuid)    from public, anon;
revoke execute on function public.vpv_invite_matches_me(text, integer) from public, anon;

-- ── 1. sign-up no longer hands out the owner role ──────────────────────────
-- New accounts start as the least-privileged role. A workspace admin is made by
-- provisioning / checkout (service role, writes role = 'org_admin' explicitly);
-- the platform owner is made by hand.  mobile_number is copied from the sign-up
-- form's metadata because, with e-mail confirmation on, the browser has no session
-- yet and cannot write its own profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.profiles (id, email, full_name, role, mobile_number)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'presenter',
    nullif(left(coalesce(new.raw_user_meta_data->>'mobile_number', ''), 32), '')
  )
  on conflict (id) do update
  set email         = excluded.email,
      full_name     = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      mobile_number = coalesce(nullif(excluded.mobile_number, ''), public.profiles.mobile_number);
  return new;
end;
$$;

-- ── 2. profiles: nobody can promote themselves ─────────────────────────────

create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if public.is_platform_owner() then return new; end if;
  if v_uid is null then
    raise exception 'Sign in to change a profile' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.id <> v_uid then
      raise exception 'You can only create your own profile' using errcode = '42501';
    end if;
    if new.role is distinct from 'presenter' or new.org_id is not null then
      raise exception 'New accounts start as sales presenters; a workspace admin or the platform owner attaches them to a workspace'
        using errcode = '42501';
    end if;
    new.device_limit      := 1;
    new.invited_via_code  := null;
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id then
    raise exception 'A profile id cannot change' using errcode = '42501';
  end if;

  -- Roles only ever go DOWN from a browser (to presenter). Promotion is done by
  -- the platform owner or the checkout/provisioning server.
  if new.role is distinct from old.role and new.role <> 'presenter' then
    raise exception 'Your role cannot be changed from here' using errcode = '42501';
  end if;

  -- Somebody else's row (an org admin managing the team): the only change allowed
  -- is taking the person out of the workspace.
  if old.id <> v_uid then
    if new.org_id is not null then
      raise exception 'You can only remove a member from the workspace' using errcode = '42501';
    end if;
    if (new.role, new.email, new.full_name, new.mobile_number, new.device_limit,
        new.invited_via_code, new.voice_sample_path, new.voice_sample_captured_at)
       is distinct from
       (old.role, old.email, old.full_name, old.mobile_number, old.device_limit,
        old.invited_via_code, old.voice_sample_path, old.voice_sample_captured_at) then
      raise exception 'You can only remove a member from the workspace' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Your own row.
  if new.email is distinct from old.email
     and lower(coalesce(new.email, '')) is distinct from lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Your e-mail is set by your sign-in' using errcode = '42501';
  end if;

  -- Joining a workspace needs an invite code you actually redeemed.
  if new.org_id is distinct from old.org_id and new.org_id is not null then
    if old.org_id is not null or not public.vpv_has_redeemed_invite(new.org_id) then
      raise exception 'Joining a workspace needs an invite code' using errcode = '42501';
    end if;
  end if;

  -- The login-device allowance only comes from a code you redeemed.
  if (new.invited_via_code is distinct from old.invited_via_code
      or new.device_limit  is distinct from old.device_limit)
     and not public.vpv_invite_matches_me(new.invited_via_code, new.device_limit) then
    raise exception 'The device allowance comes from your invite code' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists vpv_profiles_guard on public.profiles;
create trigger vpv_profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

drop policy if exists "profiles write" on public.profiles;
drop policy if exists "profiles read"  on public.profiles;

-- Somebody who redeemed one of MY workspace's invite codes. An admin keeps seeing
-- people they brought in even after taking them out of the team: Postgres re-checks
-- the NEW row of an UPDATE against the SELECT policy, so without this the Team page's
-- "remove member" (set org_id = null) would be refused as "row not visible to you".
create or replace function public.vpv_redeemed_my_org_code(p_user uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select auth.uid() is not null
     and public.vpv_my_org() is not null
     and public.is_org_admin_of(public.vpv_my_org())
     and exists (
       select 1 from public.invite_codes ic
        where ic.org_id = public.vpv_my_org()
          and p_user::text = any (coalesce(ic.used_by::text[], '{}'::text[])))
$$;
grant execute on function public.vpv_redeemed_my_org_code(uuid) to authenticated, service_role;
revoke execute on function public.vpv_redeemed_my_org_code(uuid) from public, anon;

create policy vpv_profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_owner()
         or (org_id is not null and org_id = public.vpv_my_org())
         or (org_id is null and public.vpv_redeemed_my_org_code(id)));

create policy vpv_profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() or public.is_platform_owner());

create policy vpv_profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_platform_owner()
         or (org_id is not null and public.is_org_admin_of(org_id)))
  with check (id = auth.uid() or public.is_platform_owner()
              or org_id is null or public.is_org_admin_of(org_id));

create policy vpv_profiles_delete on public.profiles for delete to authenticated
  using (public.is_platform_owner());

revoke all on public.profiles from anon;

-- ── 3. invite codes: only the workspace admin can mint / delete / edit ─────

create or replace function public.invite_codes_guard()
returns trigger language plpgsql set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if public.is_platform_owner() then return new; end if;

  if tg_op = 'INSERT' then
    new.used_count := 0;
    new.used_by    := '{}';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if public.is_org_admin_of(old.org_id) then return new; end if;
    if v_uid is null then
      raise exception 'Sign in to redeem a code' using errcode = '42501';
    end if;
    -- Anyone else may do exactly one thing: put themselves on the list, once.
    if (new.code, new.org_id, new.created_by, new.created_at, new.expires_at, new.max_uses, new.device_limit)
       is distinct from
       (old.code, old.org_id, old.created_by, old.created_at, old.expires_at, old.max_uses, old.device_limit) then
      raise exception 'Invite codes can be redeemed, not edited' using errcode = '42501';
    end if;
    if v_uid::text = any (coalesce(old.used_by::text[], '{}'::text[])) then
      raise exception 'You have already used this code' using errcode = '42501';
    end if;
    if new.used_by::text[] is distinct from (coalesce(old.used_by::text[], '{}'::text[]) || v_uid::text)
       or coalesce(new.used_count, 0) <> coalesce(old.used_count, 0) + 1 then
      raise exception 'Invite codes can be redeemed, not edited' using errcode = '42501';
    end if;
    if old.expires_at is not null and old.expires_at < now() then
      raise exception 'This invite code has expired' using errcode = '42501';
    end if;
    if coalesce(old.max_uses, 0) > 0 and coalesce(old.used_count, 0) >= old.max_uses then
      raise exception 'This invite code has reached its usage limit' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vpv_invite_codes_guard on public.invite_codes;
create trigger vpv_invite_codes_guard
  before insert or update on public.invite_codes
  for each row execute function public.invite_codes_guard();

drop policy if exists "invite_codes write" on public.invite_codes;
drop policy if exists "invite_codes read"  on public.invite_codes;

-- Reading stays open to signed-in users for now: the redeem screen looks a code up
-- by value, and a row-level policy cannot see the value being asked for.
-- a later phase can move redemption into a SECURITY DEFINER function and close this.
create policy vpv_invite_codes_select on public.invite_codes for select to authenticated
  using (true);
create policy vpv_invite_codes_insert on public.invite_codes for insert to authenticated
  with check (public.is_platform_owner() or public.is_org_admin_of(org_id));
create policy vpv_invite_codes_update on public.invite_codes for update to authenticated
  using (true) with check (true);
create policy vpv_invite_codes_delete on public.invite_codes for delete to authenticated
  using (public.is_platform_owner() or public.is_org_admin_of(org_id));

revoke all on public.invite_codes from anon;

-- ── 4. organizations: no public billing details, no public writes ──────────

drop policy if exists "orgs write" on public.organizations;
drop policy if exists "orgs read"  on public.organizations;

-- A logged-out visitor (the public viewer) needs a workspace's name, slug, theme and
-- recording flags -- nothing else. Column-level grants enforce that even for
-- `select *`, which then fails loudly instead of leaking.
create policy vpv_orgs_select_anon on public.organizations for select to anon
  using (true);
create policy vpv_orgs_select_auth on public.organizations for select to authenticated
  using (id = public.vpv_my_org() or public.is_platform_owner());
create policy vpv_orgs_insert on public.organizations for insert to authenticated
  with check (public.is_platform_owner());
create policy vpv_orgs_update on public.organizations for update to authenticated
  using (public.is_platform_owner() or public.is_org_admin_of(id))
  with check (public.is_platform_owner() or public.is_org_admin_of(id));
create policy vpv_orgs_delete on public.organizations for delete to authenticated
  using (public.is_platform_owner());

revoke all on public.organizations from anon;
grant select (id, name, slug, theme, auto_record, recording_mode, created_at)
  on public.organizations to anon;

-- ── 5. the public viewer: tours without a workspace still have scenes ─────
-- A tour whose org_id is NULL belongs to the platform itself (built by the owner):
-- no plan cap and no lapse-lock apply. An unknown tour, or one the caller may not
-- see, still returns nothing.
create or replace function public.public_tour_scenes(p_tour_id uuid)
returns setof public.scenes
language plpgsql security definer set search_path = public as
$$
declare
  v_exists   boolean;
  v_org      uuid;
  v_plan     text;
  v_quota    int;
  v_is_owner boolean := false;
begin
  select true, org_id into v_exists, v_org from public.tours where id = p_tour_id;
  if not coalesce(v_exists, false) then return; end if;
  if not public.vpv_tour_visible(p_tour_id) then return; end if;

  if v_org is null then
    return query select * from public.scenes where tour_id = p_tour_id order by order_index;
    return;
  end if;

  select plan, coalesce(scene_quota, basic_scene_cap)
    into v_plan, v_quota
    from public.organizations where id = v_org;

  if auth.uid() is not null then
    select true into v_is_owner from public.profiles where id = auth.uid() and role = 'owner';
  end if;

  -- LEVEL 2 of the lapse ladder: the workspace is locked.
  if not coalesce(v_is_owner, false) and public.org_access_state_of(v_org) = 'locked' then
    return;
  end if;

  if coalesce(v_is_owner, false) or v_plan is distinct from 'basic' or v_quota is null then
    return query select * from public.scenes where tour_id = p_tour_id order by order_index;
  else
    return query select * from public.scenes where tour_id = p_tour_id order by order_index limit v_quota;
  end if;
end;
$$;

-- ── 6. database functions: only what each caller actually needs ────────────
-- Postgres grants EXECUTE to PUBLIC by default, so revoking from anon alone does
-- nothing: revoke from PUBLIC, then grant back to the roles that call them.

-- server-side or trigger-only: nobody in a browser
do $$
declare f text;
begin
  foreach f in array array[
    'rls_review()',
    'plan_events_revert_upgrades()',
    'handle_new_user()',
    'profiles_enforce_sales_logins()',
    'profiles_guard()',
    'invite_codes_guard()',
    'recording_stops_guard()',
    'recording_stops_insert_guard()',
    'protect_org_billing_columns()',
    'protect_org_plan_columns()',
    'share_links_enforce_plan()',
    'funnel_leads_touch()',
    'set_client_updated_at()',
    'billing_credit_note_frozen()',
    'billing_invoice_frozen()',
    'billing_ledger_no_delete()',
    'vpv_touch_visitor(uuid,text,text,text,text,text,text,text,text,boolean)'
  ] loop
    begin
      execute format('revoke execute on function public.%s from public, anon, authenticated', f);
      execute format('grant  execute on function public.%s to service_role', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- signed-in only (they identify the caller with auth.uid() and answer 'unauth' otherwise)
do $$
declare f text;
begin
  foreach f in array array[
    'admin_billing_health()',
    'admin_customer_overview()',
    'admin_renewals_overview()',
    'admin_payments_overview()',
    'admin_set_org_plan(uuid,text,integer,timestamp with time zone,text)',
    'claim_device_slot(text,text,text)',
    'release_device_slot(text)',
    'is_new_device(text)',
    'my_logins_open()',
    'my_org_access_state()',
    'invite_code_has_room(text)',
    'duplicate_tour_for_md(uuid,text,uuid[])',
    'save_presentation_ai(text,jsonb)'
    -- log_security_event() stays open to anon for now: the public billing /
    -- report-abuse routes call it with the anon key. security_phase2b_lockdown.sql moves those
    -- calls to the service role and closes it.
  ] loop
    begin
      execute format('revoke execute on function public.%s from public, anon', f);
      execute format('grant  execute on function public.%s to authenticated, service_role', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

commit;
