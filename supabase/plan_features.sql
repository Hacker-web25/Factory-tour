-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/plan_features.sql — every workspace knows which plan it bought,
-- gets that plan's features, and can upgrade from its own dashboard.
--
--  1. organizations.site_plan  confidence | authority | control | enterprise,
--     filled in for existing workspaces from their paid orders.
--  2. Two new things to buy:  plan_upgrade  (pay the price difference, the
--     new plan's areas and features open at once)  and  seat_topup  (more
--     Sales Team logins, for the rest of the logins' year).
--  3. A full refund of either takes back exactly what it gave.
--  4. The browser cannot change the plan or the number of Sales Team logins.
--  5. Sharing controls (one-time links, expiry, passwords, device and view
--     limits, e-mail gates) can only be put on a link by a Control or
--     Enterprise workspace, whatever the browser sends.
--
-- Run once in the Supabase SQL editor, after billing_hardening.sql,
-- sales_seats.sql and renewal_ladder.sql. Safe to run again.
-- ═══════════════════════════════════════════════════════════════════════════


/* ───────────────────────────────────────────────────────────────────────
   1.  WHICH PLAN EACH WORKSPACE HAS
   ─────────────────────────────────────────────────────────────────────── */

alter table public.organizations
  add column if not exists site_plan text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_site_plan_check') then
    alter table public.organizations
      add constraint organizations_site_plan_check
      check (site_plan is null or site_plan in (
        'lite', 'plus', 'pro', 'premium', 'ultra', 'vpv', 'signature',
        'confidence', 'authority', 'control', 'enterprise'
      ));
  end if;
end $$;

comment on column public.organizations.site_plan is
  'The VPV plan bought: confidence, authority, control or enterprise. Decides the features. NULL = bought on the old scene ladder (treated as confidence).';

-- Existing workspaces: the plan is in the description of the order that built them.
update public.organizations o
   set site_plan = lower(substring(b.notes from '^VPV (Confidence|Authority|Control|Enterprise) '))
  from (
    select distinct on (org_id) org_id, notes
      from public.billing_orders
     where purpose = 'basic_licence'
       and status = 'paid'
       and revoked_at is null
       and org_id is not null
       and notes ~ '^VPV (Confidence|Authority|Control|Enterprise) '
     order by org_id, created_at desc
  ) b
 where b.org_id = o.id
   and o.site_plan is null;

-- The plan (and the logins) can only be changed by the billing system or our team.
create or replace function public.protect_org_plan_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.vpv_caller_is_owner() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.site_plan := null;
    new.sales_seats := 0;
    new.sales_seat_inr := null;
    new.sales_seats_until := null;
    return new;
  end if;
  if new.site_plan         is distinct from old.site_plan
  or new.sales_seats       is distinct from old.sales_seats
  or new.sales_seat_inr    is distinct from old.sales_seat_inr
  or new.sales_seats_until is distinct from old.sales_seats_until then
    raise exception 'The plan and Sales Team logins can only be changed by the billing system'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_plan on public.organizations;
create trigger organizations_protect_plan
  before insert or update on public.organizations
  for each row execute function public.protect_org_plan_columns();


/* ───────────────────────────────────────────────────────────────────────
   2.  THE TWO NEW PURCHASES
   ─────────────────────────────────────────────────────────────────────── */

alter table public.billing_orders
  add column if not exists upgrade_to       text,
  add column if not exists site_plan_before text,
  add column if not exists seats_added      integer,
  add column if not exists seat_inr         integer,
  add column if not exists seats_before     integer,
  add column if not exists seats_until_before timestamptz;

comment on column public.billing_orders.upgrade_to is 'plan_upgrade: the plan being bought.';
comment on column public.billing_orders.seats_added is 'seat_topup: how many Sales Team logins are being added.';
comment on column public.billing_orders.seat_inr is 'seat_topup: the yearly price per login this order was priced at (locked on the workspace if it had none).';

do $$
declare c text;
begin
  -- The original CHECK was written inline, so its name is the generated one.
  select conname into c
    from pg_constraint
   where conrelid = 'public.billing_orders'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%purpose%scene_topup%'
   limit 1;
  if c is not null and c <> 'billing_orders_purpose_check_v2' then
    execute format('alter table public.billing_orders drop constraint %I', c);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_orders_purpose_check_v2') then
    alter table public.billing_orders
      add constraint billing_orders_purpose_check_v2
      check (purpose in ('basic_licence', 'support_renewal', 'scene_topup', 'plan_upgrade', 'seat_topup'));
  end if;
end $$;

-- A plan upgrade: the new plan, and the difference in areas, at once.
-- order.scenes = the workspace's area count after the upgrade, as priced;
-- order.quota_before = the count it was priced from. Applied as a difference,
-- so a top-up bought in between is not lost.
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
  -- 20 Nov 2026: the seven plans (see plans_seven.sql). Kept in step here so
  -- running this file again never takes them away.
  if o.upgrade_to is null or o.upgrade_to not in ('plus', 'pro', 'premium', 'ultra', 'authority', 'control', 'enterprise') then
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

-- More Sales Team logins, until the logins' existing end date (or a year
-- from today when they have none, or it has passed).
create or replace function public.billing_apply_seat_topup(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o       public.billing_orders%rowtype;
  org     public.organizations%rowtype;
  v_until timestamptz;
  v_new   timestamptz;
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status <> 'paid' or o.revoked_at is not null then raise exception 'order_not_payable'; end if;
  if o.org_id is null then raise exception 'topup_without_org'; end if;
  if coalesce(o.seats_added, 0) <= 0 then raise exception 'seats_missing'; end if;

  select * into org from public.organizations where id = o.org_id for update;
  if not found then raise exception 'org_missing'; end if;

  if exists (select 1 from public.plan_events where order_id = o.id and event = 'seats_added') then
    return jsonb_build_object('applied', false, 'sales_seats', org.sales_seats);
  end if;

  v_until := coalesce(org.sales_seats_until, org.support_until);
  v_new := case when v_until is not null and v_until > now() then v_until
                else now() + interval '12 months' end;

  update public.organizations
     set sales_seats       = coalesce(org.sales_seats, 0) + o.seats_added,
         sales_seat_inr    = case when coalesce(org.sales_seat_inr, 0) > 0 then org.sales_seat_inr else o.seat_inr end,
         sales_seats_until = v_new
   where id = org.id;
  update public.billing_orders
     set seats_before = coalesce(org.sales_seats, 0),
         seats_until_before = org.sales_seats_until,
         updated_at = now()
   where id = o.id;

  insert into public.plan_events (org_id, order_id, event, actor, note)
  values (org.id, o.id, 'seats_added', 'webhook',
          format('%s Sales Team login(s) added: %s → %s', o.seats_added,
                 coalesce(org.sales_seats, 0), coalesce(org.sales_seats, 0) + o.seats_added));

  return jsonb_build_object('applied', true, 'sales_seats', coalesce(org.sales_seats, 0) + o.seats_added, 'until', v_new);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['billing_apply_plan_upgrade(uuid)', 'billing_apply_seat_topup(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;


/* ───────────────────────────────────────────────────────────────────────
   3.  A FULL REFUND TAKES BACK WHAT IT GAVE
        The refund function already records 'refund_revoked' for every
        purpose; this reacts to that record for the two new ones.
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.plan_events_revert_upgrades()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o     public.billing_orders%rowtype;
  org   public.organizations%rowtype;
  v_sub integer;
  v_q   integer;
begin
  if new.event <> 'refund_revoked' or new.order_id is null then
    return new;
  end if;
  select * into o from public.billing_orders where id = new.order_id;
  if not found or o.purpose not in ('plan_upgrade', 'seat_topup') then
    return new;
  end if;
  select * into org from public.organizations where id = o.org_id for update;
  if not found then
    return new;
  end if;
  -- Only if it was ever applied.
  if o.purpose = 'plan_upgrade'
     and exists (select 1 from public.plan_events where order_id = o.id and event = 'plan_upgraded') then
    v_sub := greatest(0, coalesce(o.scenes, 0) - coalesce(o.quota_before, 0));
    v_q   := greatest(2, coalesce(org.scene_quota, 0) - v_sub);
    update public.organizations
       set site_plan = case when org.site_plan is not distinct from o.upgrade_to
                            then o.site_plan_before else org.site_plan end,
           scene_quota = v_q,
           basic_scene_cap = least(10, greatest(1, v_q))
     where id = org.id;
  elsif o.purpose = 'seat_topup'
     and exists (select 1 from public.plan_events where order_id = o.id and event = 'seats_added') then
    update public.organizations
       set sales_seats = greatest(0, coalesce(org.sales_seats, 0) - coalesce(o.seats_added, 0)),
           sales_seats_until = case when coalesce(o.seats_before, 0) = 0 then o.seats_until_before
                                    else org.sales_seats_until end
     where id = org.id;
  end if;
  return new;
end;
$$;

drop trigger if exists plan_events_revert_upgrades on public.plan_events;
create trigger plan_events_revert_upgrades
  after insert on public.plan_events
  for each row execute function public.plan_events_revert_upgrades();


/* ───────────────────────────────────────────────────────────────────────
   4.  WHAT A WORKSPACE MAY DO, FOR THE DATABASE'S OWN CHECKS
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.tour_org_of(p_tour uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select org_id from public.tours where id = p_tour $$;
grant execute on function public.tour_org_of(uuid) to anon, authenticated;

-- 20 Nov 2026: the link controls, each on its own plan. Kept identical to
-- supabase/plans_seven.sql so running this file again changes nothing.
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


/* ───────────────────────────────────────────────────────────────────────
   5.  THE ADMIN CUSTOMER LIST SHOWS THE PLAN
   ─────────────────────────────────────────────────────────────────────── */

-- The platform owner can set a plan by hand (for example, a customer sold
-- before plans were recorded):
--   update public.organizations set site_plan = 'authority' where slug = 'acme';

notify pgrst, 'reload schema';
