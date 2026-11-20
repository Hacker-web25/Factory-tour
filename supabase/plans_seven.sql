-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/plans_seven.sql — the seven plans sold by factory size (20 Nov 2026).
--
--   lite · plus · pro · premium · ultra · vpv · signature
--
-- The four plans before them (confidence, authority, control, enterprise)
-- are no longer sold, but every workspace that bought one keeps it, so
-- both sets stay valid everywhere below.
--
--  1. organizations.site_plan accepts the seven new plans, and an order may
--     carry up to 1,000 areas (it was 100; Signature alone has 150).
--  2. funnel_leads: the recommended / chosen plan and the new plant-size bands
--     (square feet: lt2000 … 80000plus).
--  3. A dashboard upgrade can now be to plus, pro, premium or ultra.
--  4. Link controls, each on its own plan: one-time view links from Premium,
--     passwords from Ultra, expiry on VPV VIP and Signature, device limits
--     (and the e-mail gate) on Signature. The old Control and Enterprise keep all.
--
-- Run once in the Supabase SQL editor, after plan_features.sql and
-- enterprise_plan.sql. Safe to run again. Run it BEFORE deploying the
-- code that sells the seven plans: until then the database refuses them.
-- ═══════════════════════════════════════════════════════════════════════════


/* 1.  WHICH PLAN EACH WORKSPACE HAS */

alter table public.organizations
  drop constraint if exists organizations_site_plan_check;
alter table public.organizations
  add constraint organizations_site_plan_check
  check (site_plan is null or site_plan in (
    'lite', 'plus', 'pro', 'premium', 'ultra', 'vpv', 'signature',
    'confidence', 'authority', 'control', 'enterprise'
  ));

comment on column public.organizations.site_plan is
  'The VPV plan bought: lite, plus, pro, premium, ultra, vpv or signature (or, bought before 20 Nov 2026, confidence, authority, control or enterprise). Decides the features. NULL = bought on the old scene ladder (treated as confidence).';


-- An order's areas were capped at 100. VPV has 100 and Signature 150, each
-- plus up to 15 extra areas.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.billing_orders'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%scenes%<= 100)%'
   limit 1;
  if c is not null then
    execute format('alter table public.billing_orders drop constraint %I', c);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_orders_scenes_check_v2') then
    alter table public.billing_orders
      add constraint billing_orders_scenes_check_v2
      check (scenes is null or scenes between 1 and 1000);
  end if;
end $$;


/* 2.  THE FUNNEL'S SALES NOTE */

alter table public.funnel_leads
  drop constraint if exists funnel_leads_recommended_plan_check,
  drop constraint if exists funnel_leads_chosen_plan_check,
  drop constraint if exists funnel_leads_plot_size_check;

alter table public.funnel_leads
  add constraint funnel_leads_recommended_plan_check
    check (recommended_plan is null or recommended_plan in (
      'lite', 'plus', 'pro', 'premium', 'ultra', 'vpv', 'signature',
      'confidence', 'authority', 'control', 'enterprise'
    )),
  add constraint funnel_leads_chosen_plan_check
    check (chosen_plan is null or chosen_plan in (
      'lite', 'plus', 'pro', 'premium', 'ultra', 'vpv', 'signature',
      'confidence', 'authority', 'control', 'enterprise'
    )),
  add constraint funnel_leads_plot_size_check
    check (plot_size is null or plot_size in (
      'lt2000', '2000to5000', '5000to10000', '10000to20000', '20000to40000', '40000to80000', '80000plus',
      'upto200', 'upto600', 'upto1000', 'above1000'
    ));

comment on column public.funnel_leads.plot_size is
  'Plant size band the visitor chose, in square feet: lt2000, 2000to5000, 5000to10000, 10000to20000, 20000to40000, 40000to80000 or 80000plus (before 20 Nov 2026: upto200 … above1000, in square yards).';


/* 3.  UPGRADES FROM THE DASHBOARD */

-- Same function as in plan_features.sql; only the list of plans an upgrade
-- may be bought to has changed. The app decides which upgrade a workspace
-- may buy (lib/entitlements.ts → isUpgrade); this is the last guard.
create or replace function public.billing_apply_plan_upgrade(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o     public.billing_orders%rowtype;
  org   public.organizations%rowtype;
  v_add integer;
  v_q   integer;
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status <> 'paid' or o.revoked_at is not null then raise exception 'order_not_payable'; end if;
  if o.org_id is null then raise exception 'upgrade_without_org'; end if;
  if o.upgrade_to is null
     or o.upgrade_to not in ('plus', 'pro', 'premium', 'ultra', 'authority', 'control', 'enterprise') then
    raise exception 'upgrade_target_missing';
  end if;

  select * into org from public.organizations where id = o.org_id for update;
  if not found then raise exception 'org_missing'; end if;

  if exists (select 1 from public.plan_events where order_id = o.id and event = 'plan_upgraded') then
    return jsonb_build_object('applied', false, 'site_plan', org.site_plan, 'scene_quota', org.scene_quota);
  end if;

  v_add := greatest(0, coalesce(o.scenes, 0) - coalesce(o.quota_before, 0));
  v_q   := coalesce(org.scene_quota, 0) + v_add;

  update public.organizations
     set site_plan = o.upgrade_to,
         scene_quota = v_q,
         basic_scene_cap = least(10, greatest(1, v_q))
   where id = org.id;
  update public.billing_orders
     set site_plan_before = coalesce(org.site_plan, 'confidence'),
         updated_at = now()
   where id = o.id;

  insert into public.plan_events (org_id, order_id, event, from_quota, to_quota, actor, note)
  values (org.id, o.id, 'plan_upgraded', org.scene_quota, v_q, 'webhook',
          format('Upgraded %s → %s', coalesce(org.site_plan, 'confidence'), o.upgrade_to));

  return jsonb_build_object('applied', true, 'site_plan', o.upgrade_to, 'scene_quota', v_q);
end;
$$;


/* 4.  LINK CONTROLS, EACH ON ITS OWN PLAN */

-- Which link controls a workspace has (20 Nov 2026, the owner's split):
--   oneTime   one-time view links (view_limit, session_minutes)   Premium and up
--   password  password-protected links (password_hash)            Ultra and up
--   expiry    link expiry time (expires_at)                       VPV VIP and Signature
--   devices   device limits (device_limit) and the e-mail gate    Signature
-- The old Control and Enterprise, and the old monthly Pro and Ultra, have all.
-- Must match linkControls in lib/pricing.ts.
create or replace function public.org_link_controls(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when o.plan in ('pro', 'ultra') or o.site_plan in ('signature', 'control', 'enterprise')
        then '{"oneTime": true, "password": true, "expiry": true, "devices": true}'::jsonb
      when o.site_plan = 'vpv'
        then '{"oneTime": true, "password": true, "expiry": true, "devices": false}'::jsonb
      when o.site_plan = 'ultra'
        then '{"oneTime": true, "password": true, "expiry": false, "devices": false}'::jsonb
      when o.site_plan = 'premium'
        then '{"oneTime": true, "password": false, "expiry": false, "devices": false}'::jsonb
      else '{"oneTime": false, "password": false, "expiry": false, "devices": false}'::jsonb
    end
      from public.organizations o where o.id = p_org
  ), '{"oneTime": false, "password": false, "expiry": false, "devices": false}'::jsonb);
$$;
grant execute on function public.org_link_controls(uuid) to anon, authenticated;

-- Kept for anything that asks the old question: does it have ANY link control?
create or replace function public.org_has_sharing_controls(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from jsonb_each_text(public.org_link_controls(p_org)) e where e.value = 'true');
$$;
grant execute on function public.org_has_sharing_controls(uuid) to anon, authenticated;

-- Each control on a link needs the plan that includes it. Only a control
-- that is being SET (on a new link, or changed on an existing one) is
-- checked, so revoking a link, marking it used or counting a view is always
-- fine, and turning a control off is always allowed. Read through to_jsonb
-- so a column that does not exist in an older database is simply unset.
create or replace function public.share_links_enforce_plan()
returns trigger
language plpgsql
-- NOT security definer: it must see who is really asking (current_user).
set search_path = public
as $$
declare
  j     jsonb := to_jsonb(new);
  o     jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_org uuid;
  have  jsonb;
  need  text;
  col   text;
  setting boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.vpv_caller_is_owner() then
    return new;
  end if;
  if coalesce(j->>'kind', 'viewer') = 'presenter' then
    return new;
  end if;
  v_org := public.tour_org_of((j->>'tour_id')::uuid);
  if v_org is null then
    return new;
  end if;
  have := public.org_link_controls(v_org);
  foreach col in array array['view_limit', 'session_minutes', 'password_hash', 'expires_at', 'device_limit', 'require_email'] loop
    setting := (j->>col) is not null
               and not (col = 'require_email' and coalesce((j->>col)::boolean, false) = false)
               and (j->>col) is distinct from (o->>col);
    if setting then
      need := case col
        when 'view_limit' then 'oneTime'
        when 'session_minutes' then 'oneTime'
        when 'password_hash' then 'password'
        when 'expires_at' then 'expiry'
        else 'devices'
      end;
      if coalesce((have->>need)::boolean, false) = false then
        raise exception 'sharing_controls_need_control'
          using hint = case need
            when 'oneTime' then 'One-time view links start with VPV Premium.'
            when 'password' then 'Password-protected links start with VPV Ultra.'
            when 'expiry' then 'Link expiry time comes with VPV VIP and VPV Signature.'
            else 'Device limits and the e-mail gate come with VPV Signature.'
          end,
          errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.share_links') is not null then
    drop trigger if exists share_links_enforce_plan on public.share_links;
    create trigger share_links_enforce_plan
      before insert or update on public.share_links
      for each row execute function public.share_links_enforce_plan();
  end if;
end $$;

notify pgrst, 'reload schema';
