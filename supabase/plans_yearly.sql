-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/plans_yearly.sql — the four YEARLY plans (21 Nov 2026).
--
--   light · premium · ultra · white_glove
--
-- Replaces plans_seven.sql (the seven plans by factory size), which was never
-- run on the live database and is deleted. The plans before them
-- (confidence, authority, control, enterprise: a one-time fee plus a yearly
-- support fee) are no longer sold, but every workspace that bought one keeps
-- it, so they stay valid everywhere below.
--
--  1. organizations.site_plan accepts the four yearly plans; an order may
--     carry up to 1,000 areas (it was 100; White Glove alone has 100).
--  2. organizations.plan_yearly_inr: what the workspace renews at every year
--     (the plan plus its extra areas, at the price it bought at, GST
--     excluded), and plan_offer_locked: it bought on the special offer and
--     keeps it every year it renews. Only the billing system can set them.
--  3. funnel_leads: the recommended / chosen plan. The plant size is no
--     longer asked; the column stays for the answers already given.
--  4. A dashboard upgrade (premium or ultra) moves the renewal amount with
--     it, and a full refund of the upgrade moves it back.
--  5. Link controls, each on its own plan: one-time view links from Premium,
--     passwords from Ultra, expiry, device limits and the e-mail gate on
--     White Glove. The old Control and Enterprise keep all.
--  6. /admin/payments shows what each workspace renews at.
--
-- Run once in the Supabase SQL editor, after plan_features.sql and
-- enterprise_plan.sql. Safe to run again. Run it BEFORE deploying the code
-- that sells the yearly plans: until then the database refuses them.
-- ═══════════════════════════════════════════════════════════════════════════


/* 1.  WHICH PLAN EACH WORKSPACE HAS */

alter table public.organizations
  drop constraint if exists organizations_site_plan_check;
alter table public.organizations
  add constraint organizations_site_plan_check
  check (site_plan is null or site_plan in (
    'light', 'premium', 'ultra', 'white_glove',
    'confidence', 'authority', 'control', 'enterprise'
  ));

comment on column public.organizations.site_plan is
  'The VPV plan bought: light, premium, ultra or white_glove (yearly plans, from 21 Nov 2026), or confidence, authority, control or enterprise (one-time fee + yearly support, before). Decides the features. NULL = bought on the old scene ladder (treated as confidence).';

-- An order's areas were capped at 100. White Glove has 100, plus up to 15
-- extra areas.
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


/* 2.  WHAT A YEARLY PLAN RENEWS AT */

alter table public.organizations
  add column if not exists plan_yearly_inr   integer check (plan_yearly_inr is null or plan_yearly_inr >= 0),
  add column if not exists plan_offer_locked boolean;

comment on column public.organizations.plan_yearly_inr is
  'Yearly plans: what the workspace renews at every year, GST excluded (the plan plus its extra areas, at the price it bought at; Sales Team logins renew on their own). NULL = a one-time plan from before 21 Nov 2026, which renews support alone.';
comment on column public.organizations.plan_offer_locked is
  'Yearly plans: true = bought on the special offer for our first 50 customers, which it keeps every year it renews (and on upgrades).';

alter table public.billing_orders
  add column if not exists plan_yearly_before integer,
  add column if not exists plan_yearly_after  integer;

comment on column public.billing_orders.plan_yearly_after is
  'plan_upgrade: what the workspace renews at once the upgrade is applied (GST excluded).';
comment on column public.billing_orders.plan_yearly_before is
  'plan_upgrade: what it renewed at before, so a full refund can put it back.';

-- Fill in workspaces already built from a yearly-plan order ("VPV Light —
-- …, renews yearly at ₹42,720 (yearly plan…)"), in case one was bought
-- before this ran: the plan, what it renews at, and whether it keeps the offer.
update public.organizations o
   set site_plan = coalesce(o.site_plan,
         case
           when b.notes like 'VPV Light — %'   then 'light'
           when b.notes like 'VPV Premium — %' then 'premium'
           when b.notes like 'VPV Ultra — %'   then 'ultra'
           when b.notes like 'White Glove — %' then 'white_glove'
         end),
       plan_yearly_inr   = replace(substring(b.notes from 'renews yearly at ₹([0-9,]+)'), ',', '')::integer,
       plan_offer_locked = b.notes like '%Special offer%'
  from (
    select distinct on (org_id) org_id, notes
      from public.billing_orders
     where purpose = 'basic_licence'
       and status = 'paid'
       and revoked_at is null
       and org_id is not null
       and notes ~ 'renews yearly at ₹[0-9,]+'
     order by org_id, created_at desc
  ) b
 where b.org_id = o.id
   and o.plan_yearly_inr is null;

-- The plan, the renewal amount and the logins can only be changed by the
-- billing system or our team.
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
    new.plan_yearly_inr := null;
    new.plan_offer_locked := null;
    return new;
  end if;
  if new.site_plan         is distinct from old.site_plan
  or new.sales_seats       is distinct from old.sales_seats
  or new.sales_seat_inr    is distinct from old.sales_seat_inr
  or new.sales_seats_until is distinct from old.sales_seats_until
  or new.plan_yearly_inr   is distinct from old.plan_yearly_inr
  or new.plan_offer_locked is distinct from old.plan_offer_locked then
    raise exception 'The plan and Sales Team logins can only be changed by the billing system'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


/* 3.  THE FUNNEL'S SALES NOTE */

alter table public.funnel_leads
  drop constraint if exists funnel_leads_recommended_plan_check,
  drop constraint if exists funnel_leads_chosen_plan_check;

alter table public.funnel_leads
  add constraint funnel_leads_recommended_plan_check
    check (recommended_plan is null or recommended_plan in (
      'light', 'premium', 'ultra', 'white_glove',
      'confidence', 'authority', 'control', 'enterprise'
    )),
  add constraint funnel_leads_chosen_plan_check
    check (chosen_plan is null or chosen_plan in (
      'light', 'premium', 'ultra', 'white_glove',
      'confidence', 'authority', 'control', 'enterprise'
    ));

comment on column public.funnel_leads.plot_size is
  'Plant size band the visitor chose (asked until 21 Nov 2026; plans are no longer chosen by factory size). Kept for the answers already given.';


/* 4.  UPGRADES FROM THE DASHBOARD, AND THEIR REFUND */

-- Same function as in plan_features.sql, with the targets on sale now and
-- the renewal amount moving with the plan. The app decides which upgrade a
-- workspace may buy and what it renews at (lib/entitlements.ts isUpgrade,
-- lib/pricing.ts upgradeQuote); this is the last guard.
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
     or o.upgrade_to not in ('premium', 'ultra', 'authority', 'control', 'enterprise') then
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
         basic_scene_cap = least(10, greatest(1, v_q)),
         plan_yearly_inr = coalesce(o.plan_yearly_after, org.plan_yearly_inr)
   where id = org.id;
  update public.billing_orders
     set site_plan_before = coalesce(org.site_plan, 'confidence'),
         plan_yearly_before = org.plan_yearly_inr,
         updated_at = now()
   where id = o.id;

  insert into public.plan_events (org_id, order_id, event, from_quota, to_quota, actor, note)
  values (org.id, o.id, 'plan_upgraded', org.scene_quota, v_q, 'webhook',
          format('Upgraded %s → %s', coalesce(org.site_plan, 'confidence'), o.upgrade_to));

  return jsonb_build_object('applied', true, 'site_plan', o.upgrade_to, 'scene_quota', v_q);
end;
$$;

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
           plan_yearly_inr = case when org.site_plan is not distinct from o.upgrade_to
                                  then o.plan_yearly_before else org.plan_yearly_inr end,
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


/* 5.  LINK CONTROLS, EACH ON ITS OWN PLAN */

-- Which link controls a workspace has:
--   oneTime   one-time view links (view_limit, session_minutes)   Premium and up
--   password  password-protected links (password_hash)            Ultra and up
--   expiry    link expiry time (expires_at)                       White Glove
--   devices   device limits (device_limit) and the e-mail gate    White Glove
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
      when o.plan in ('pro', 'ultra') or o.site_plan in ('white_glove', 'control', 'enterprise')
        then '{"oneTime": true, "password": true, "expiry": true, "devices": true}'::jsonb
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
            when 'expiry' then 'Link expiry time comes with White Glove.'
            else 'Device limits and the e-mail gate come with White Glove.'
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


/* 6.  /admin/payments — WHAT EACH WORKSPACE RENEWS AT   (owner only) */

-- Same as in renewal_ladder.sql, plus plan_yearly_inr. The return type
-- changes, so the function is dropped first.
drop function if exists public.admin_renewals_overview();
create function public.admin_renewals_overview()
returns table (
  org_id            uuid,
  org_name          text,
  slug              text,
  billing_email     text,
  support_until     timestamptz,
  days_to_support   integer,
  support_stage     text,
  logins_until      timestamptz,
  logins_stage      text,
  sales_seats       integer,
  sales_seat_inr    integer,
  salespeople       integer,
  last_reminder     text,
  last_reminder_at  timestamptz,
  plan_yearly_inr   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id, o.name, o.slug,
    coalesce(o.billing_email,
             (select p.email from public.profiles p
               where p.org_id = o.id and p.role = 'org_admin' order by p.created_at limit 1)),
    o.support_until,
    case when o.support_until is null then null
         else floor(extract(epoch from (o.support_until - now())) / 86400)::int end,
    case
      when o.plan_status in ('suspended', 'cancelled')       then 'closed'
      when o.support_until is null                           then 'none'
      when public.org_access_state_of(o.id) = 'locked'       then 'locked'
      when public.org_access_state_of(o.id) = 'nag'          then 'grace'
      when o.support_until <= now() + interval '1 day'       then 'due_1'
      when o.support_until <= now() + interval '7 days'      then 'due_7'
      when o.support_until <= now() + interval '30 days'     then 'due_30'
      else 'ok'
    end,
    coalesce(o.sales_seats_until, o.support_until),
    public.org_logins_state_of(o.id),
    coalesce(o.sales_seats, 0),
    o.sales_seat_inr,
    (select count(*)::int from public.profiles p where p.org_id = o.id and p.role = 'presenter'),
    (select r.kind from public.support_reminders r where r.org_id = o.id order by r.sent_at desc limit 1),
    (select r.sent_at from public.support_reminders r where r.org_id = o.id order by r.sent_at desc limit 1),
    o.plan_yearly_inr
  from public.organizations o
  where o.plan = 'basic'
    and public.is_platform_owner()
  order by o.support_until nulls last;
$$;
grant execute on function public.admin_renewals_overview() to authenticated;

notify pgrst, 'reload schema';
