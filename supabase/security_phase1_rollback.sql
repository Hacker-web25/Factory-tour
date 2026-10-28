-- ============================================================================
-- security_phase1_rollback.sql — put the database back exactly as it was before
-- security_phase1.sql.  WARNING: this re-opens the account-takeover hole (every
-- new sign-up becomes a platform owner and `profiles` is world-writable again).
-- Use it only if phase 1 breaks something you cannot fix forward in minutes.
-- ============================================================================

begin;

-- profiles
drop policy if exists vpv_profiles_select on public.profiles;
drop policy if exists vpv_profiles_insert on public.profiles;
drop policy if exists vpv_profiles_update on public.profiles;
drop policy if exists vpv_profiles_delete on public.profiles;
drop trigger if exists vpv_profiles_guard on public.profiles;
create policy "profiles read"  on public.profiles for select to public using (true);
create policy "profiles write" on public.profiles for all    to public using (true) with check (true);
grant all on public.profiles to anon;

-- invite_codes
drop policy if exists vpv_invite_codes_select on public.invite_codes;
drop policy if exists vpv_invite_codes_insert on public.invite_codes;
drop policy if exists vpv_invite_codes_update on public.invite_codes;
drop policy if exists vpv_invite_codes_delete on public.invite_codes;
drop trigger if exists vpv_invite_codes_guard on public.invite_codes;
create policy "invite_codes read"  on public.invite_codes for select to public using (true);
create policy "invite_codes write" on public.invite_codes for all    to public using (true) with check (true);
grant all on public.invite_codes to anon;

-- organizations
drop policy if exists vpv_orgs_select_anon on public.organizations;
drop policy if exists vpv_orgs_select_auth on public.organizations;
drop policy if exists vpv_orgs_insert on public.organizations;
drop policy if exists vpv_orgs_update on public.organizations;
drop policy if exists vpv_orgs_delete on public.organizations;
create policy "orgs read"  on public.organizations for select to public using (true);
create policy "orgs write" on public.organizations for all    to public using (true) with check (true);
grant all on public.organizations to anon;

-- the sign-up default (this is the vulnerable version)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'owner'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);
  return new;
end;
$$;

-- the public viewer function as it was (returns nothing for org-less tours)
create or replace function public.public_tour_scenes(p_tour_id uuid)
returns setof public.scenes
language plpgsql security definer set search_path = public as
$$
declare
  v_org        uuid;
  v_plan       text;
  v_quota      int;
  v_is_owner   boolean := false;
begin
  select org_id into v_org from public.tours where id = p_tour_id;
  if v_org is null then
    return;
  end if;

  select plan, coalesce(scene_quota, basic_scene_cap)
    into v_plan, v_quota
    from public.organizations
   where id = v_org;

  if auth.uid() is not null then
    select true into v_is_owner
      from public.profiles
     where id = auth.uid() and role = 'owner';
  end if;

  if not coalesce(v_is_owner, false) and public.org_access_state_of(v_org) = 'locked' then
    return;
  end if;

  if coalesce(v_is_owner, false) or v_plan is distinct from 'basic' or v_quota is null then
    return query
      select * from public.scenes
       where tour_id = p_tour_id
       order by order_index;
  else
    return query
      select * from public.scenes
       where tour_id = p_tour_id
       order by order_index
       limit v_quota;
  end if;
end;
$$;

-- function grants back to PUBLIC (the Postgres default)
do $$
declare f text;
begin
  foreach f in array array[
    'rls_review()', 'plan_events_revert_upgrades()', 'handle_new_user()',
    'profiles_enforce_sales_logins()', 'recording_stops_guard()',
    'recording_stops_insert_guard()', 'protect_org_billing_columns()',
    'protect_org_plan_columns()', 'share_links_enforce_plan()', 'funnel_leads_touch()',
    'set_client_updated_at()', 'billing_credit_note_frozen()', 'billing_invoice_frozen()',
    'billing_ledger_no_delete()',
    'vpv_touch_visitor(uuid,text,text,text,text,text,text,text,text,boolean)',
    'admin_billing_health()', 'admin_customer_overview()', 'admin_renewals_overview()',
    'admin_set_org_plan(uuid,text,integer,timestamp with time zone,text)',
    'claim_device_slot(text,text,text)', 'release_device_slot(text)', 'is_new_device(text)',
    'my_logins_open()', 'my_org_access_state()', 'invite_code_has_room(text)',
    'duplicate_tour_for_md(uuid,text,uuid[])', 'save_presentation_ai(text,jsonb)'
  ] loop
    begin
      execute format('grant execute on function public.%s to public, anon, authenticated', f);
    exception when undefined_function then null;
    end;
  end loop;
  -- admin_payments_overview was never executable by anon
  begin
    grant execute on function public.admin_payments_overview() to authenticated;
  exception when undefined_function then null;
  end;
end $$;

drop function if exists public.vpv_redeemed_my_org_code(uuid);
drop function if exists public.profiles_guard();
drop function if exists public.invite_codes_guard();
drop function if exists public.vpv_tour_visible(uuid);
drop function if exists public.vpv_invite_matches_me(text, integer);
drop function if exists public.vpv_has_redeemed_invite(uuid);
drop function if exists public.vpv_my_role();
drop function if exists public.vpv_my_org();

commit;
