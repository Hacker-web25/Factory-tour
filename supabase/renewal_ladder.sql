-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/renewal_ladder.sql — renewals that chase themselves, and Sales Team
-- logins that are paid for (and stop) separately from support.
--
--  1. A reminder ladder:  30 days · 7 days · 1 day before the end date, then
--     one e-mail EVERY DAY of the 7-day grace period, then one "locked" notice.
--  2. Support and Sales Team logins have their own dues. A customer can renew
--     support alone; the logins then stop 7 days after THEIR end date, and only
--     the salespeople are switched off — the owner, the tours and the data keep
--     working. (Support unpaid → the whole workspace locks, as before.)
--  3. A workspace cannot add more salespeople than it has paid for.
--  4. /admin/payments gets one query that lists every renewal and where it stands.
--
-- Run once in the Supabase SQL editor, AFTER billing_hardening.sql and
-- sales_seats.sql. Safe to run again. Until it is run, nothing changes: the old
-- five-stage reminders and the single bundled renewal keep working.
-- ═══════════════════════════════════════════════════════════════════════════


/* ───────────────────────────────────────────────────────────────────────
   1.  COLUMNS
   ─────────────────────────────────────────────────────────────────────── */

alter table public.organizations
  add column if not exists sales_seats_until timestamptz;

comment on column public.organizations.sales_seats_until is
  'Sales Team logins are paid up to here. NULL = the same date as support_until. Moves with support when a renewal includes the logins; stays put when the customer renews support alone.';

alter table public.billing_orders
  add column if not exists renews_logins boolean;

comment on column public.billing_orders.renews_logins is
  'support_renewal only: true = this payment also renews the Sales Team logins; false = support alone. NULL (older orders) counts as true.';


/* ───────────────────────────────────────────────────────────────────────
   2.  WHICH REMINDER IS DUE?   (one place; the tests pin every boundary)

        gap = now − end date
        -30d … -7d   t30       "about a month"
         -7d … -1d   t7        "one week"
         -1d …  0    t1        "tomorrow"
          0 … 7d     d0 … d6   one every day of the grace period
          7d … 10d   locked    "your workspace is locked" (sent once)
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.vpv_reminder_kind(p_gap interval, p_nag integer)
returns text
language sql
immutable
as $$
  select case
    when p_gap < interval '-30 days'                  then null
    when p_gap < interval '-7 days'                   then 't30'
    when p_gap < interval '-1 day'                    then 't7'
    when p_gap < interval '0'                         then 't1'
    when p_gap < make_interval(days => p_nag)         then 'd' || floor(extract(epoch from p_gap) / 86400)::int
    when p_gap < make_interval(days => p_nag + 3)     then 'locked'
    else null
  end
$$;


/* ───────────────────────────────────────────────────────────────────────
   3.  SALES TEAM LOGINS — are they paid up?
        none    not applicable (no paid-for logins, a Pro/Ultra plan, a closed workspace)
        active  paid up
        nag     the end date has passed; inside the 7-day grace period
        lapsed  grace over: the salespeople are switched off
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.org_logins_state_of(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.plan is distinct from 'basic' or o.plan_status is distinct from 'active' then 'none'
    when coalesce(o.sales_seats, 0) <= 0 or coalesce(o.sales_seat_inr, 0) <= 0     then 'none'
    when coalesce(o.sales_seats_until, o.support_until) is null                    then 'none'
    when coalesce(o.sales_seats_until, o.support_until) >= now()                   then 'active'
    when coalesce(o.sales_seats_until, o.support_until)
           + make_interval(days => public.vpv_support_nag_days()) >= now()         then 'nag'
    else 'lapsed'
  end
  from public.organizations o
  where o.id = p_org;
$$;

-- Is the signed-in person allowed to work? False only for a salesperson whose
-- company's logins have lapsed. Used by the row-level-security policies below.
create or replace function public.my_logins_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'presenter'
       and p.org_id is not null
       and public.org_logins_state_of(p.org_id) = 'lapsed'
  );
$$;
grant execute on function public.my_logins_open() to anon, authenticated;

-- A salesperson with lapsed logins cannot read or change client records, even
-- from a modified browser. RESTRICTIVE: it can only ever take access away.
do $$
begin
  if to_regclass('public.clients') is not null then
    drop policy if exists vpv_logins_lapsed_clients on public.clients;
    create policy vpv_logins_lapsed_clients on public.clients
      as restrictive
      for all
      to authenticated
      using (public.my_logins_open())
      with check (public.my_logins_open());
  end if;
  if to_regclass('public.recording_stops') is not null then
    drop policy if exists vpv_logins_lapsed_recordings on public.recording_stops;
    create policy vpv_logins_lapsed_recordings on public.recording_stops
      as restrictive
      for all
      to authenticated
      using (public.my_logins_open())
      with check (public.my_logins_open());
  end if;
end $$;

-- What the signed-in user's workspace looks like, now including the logins.
-- (A new return shape, so the old function is replaced, not altered.)
drop function if exists public.my_org_access_state();
create function public.my_org_access_state()
returns table (
  state              text,
  plan               text,
  plan_status        text,
  support_until      timestamptz,
  locks_at           timestamptz,
  days_to_lock       integer,
  role               text,
  logins_state       text,
  logins_until       timestamptz,
  logins_locks_at    timestamptz,
  logins_days_to_lock integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when p.role = 'owner' then 'active' else public.org_access_state_of(o.id) end,
    o.plan,
    o.plan_status,
    o.support_until,
    case when o.plan = 'basic' and o.support_until is not null
         then o.support_until + make_interval(days => public.vpv_support_nag_days()) end,
    case when o.plan = 'basic' and o.support_until is not null and o.support_until < now()
         then greatest(0, ceil(extract(epoch from
                (o.support_until + make_interval(days => public.vpv_support_nag_days()) - now())) / 86400.0)::int)
    end,
    p.role,
    case when p.role = 'owner' then 'none' else public.org_logins_state_of(o.id) end,
    coalesce(o.sales_seats_until, o.support_until),
    case when public.org_logins_state_of(o.id) in ('active', 'nag', 'lapsed')
         then coalesce(o.sales_seats_until, o.support_until) + make_interval(days => public.vpv_support_nag_days()) end,
    case when public.org_logins_state_of(o.id) in ('nag')
         then greatest(0, ceil(extract(epoch from
                (coalesce(o.sales_seats_until, o.support_until)
                   + make_interval(days => public.vpv_support_nag_days()) - now())) / 86400.0)::int)
    end
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid();
$$;
grant execute on function public.my_org_access_state() to authenticated;


/* ───────────────────────────────────────────────────────────────────────
   4.  A WORKSPACE CANNOT ADD MORE SALESPEOPLE THAN IT HAS PAID FOR
        Enforced on the profile row itself, so it holds whichever page or
        script tries to add the person. A workspace that never bought logins
        (set up by hand, or from before logins were sold) is not capped.
        To allow an exception on purpose, from the SQL editor:
            begin; set local vpv.allow_extra_logins = 'on'; ... commit;
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.profiles_enforce_sales_logins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap   integer;
  v_capped boolean;
  v_n     integer;
begin
  if new.role is distinct from 'presenter' or new.org_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.org_id is not distinct from new.org_id
     and old.role   is not distinct from new.role then
    return new;
  end if;
  if coalesce(current_setting('vpv.allow_extra_logins', true), '') = 'on' then
    return new;
  end if;

  select coalesce(o.sales_seats, 0),
         (o.plan = 'basic' and (coalesce(o.sales_seats, 0) > 0 or coalesce(o.sales_seat_inr, 0) > 0))
    into v_cap, v_capped
    from public.organizations o
   where o.id = new.org_id;

  if not coalesce(v_capped, false) then
    return new;
  end if;

  -- Two people redeeming the last login at the same moment: one waits for the other.
  perform pg_advisory_xact_lock(hashtext('vpv-logins:' || new.org_id::text));

  select count(*) into v_n
    from public.profiles p
   where p.org_id = new.org_id and p.role = 'presenter' and p.id <> new.id;

  if v_n >= v_cap then
    raise exception 'sales_logins_full'
      using hint = 'This workspace has used every Sales Team login it has paid for.';
  end if;
  return new;
end;
$$;

drop trigger if exists vpv_profiles_sales_logins on public.profiles;
create trigger vpv_profiles_sales_logins
  before insert or update of org_id, role on public.profiles
  for each row execute function public.profiles_enforce_sales_logins();

-- For the sign-up page: "is there a free login behind this code?" — asked
-- BEFORE the code is used up, so a full workspace does not burn a code.
create or replace function public.invite_code_has_room(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room boolean;
begin
  select case
           when not (o.plan = 'basic' and (coalesce(o.sales_seats, 0) > 0 or coalesce(o.sales_seat_inr, 0) > 0)) then true
           else (select count(*) from public.profiles p where p.org_id = o.id and p.role = 'presenter')
                  < coalesce(o.sales_seats, 0)
         end
    into v_room
    from public.invite_codes c
    join public.organizations o on o.id = c.org_id
   where c.code = upper(btrim(p_code));
  return coalesce(v_room, true);
end;
$$;
grant execute on function public.invite_code_has_room(text) to anon, authenticated;


/* ───────────────────────────────────────────────────────────────────────
   5.  RENEWAL — one payment can renew support only, or support + logins
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_apply_support_renewal(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o      public.billing_orders%rowtype;
  org    public.organizations%rowtype;
  v_base timestamptz;
  v_new  timestamptz;
  v_logins boolean;
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status <> 'paid' or o.revoked_at is not null then raise exception 'order_not_payable'; end if;
  if o.org_id is null then raise exception 'renewal_without_org'; end if;

  select * into org from public.organizations where id = o.org_id for update;
  if not found then raise exception 'org_missing'; end if;

  if exists (select 1 from public.plan_events where order_id = o.id and event = 'support_renewed') then
    return jsonb_build_object('applied', false, 'support_until', org.support_until);
  end if;

  v_base := case when org.support_until is not null and org.support_until > now()
                 then org.support_until else now() end;
  v_new  := v_base + interval '12 months';
  v_logins := coalesce(o.renews_logins, true);

  update public.organizations
     set support_until     = v_new,
         -- Logins renewed: they move with support. Not renewed: they stay on
         -- their old date, so they stop 7 days after it.
         sales_seats_until = case when v_logins then v_new
                                  else coalesce(org.sales_seats_until, org.support_until) end
   where id = org.id;
  update public.billing_orders
     set support_until_before = org.support_until,
         support_until_after  = v_new,
         updated_at = now()
   where id = o.id;

  insert into public.plan_events (org_id, order_id, event, support_until, actor, note)
  values (org.id, o.id, 'support_renewed', v_new, 'webhook',
          case when v_logins then 'Support renewed online' else 'Support renewed online (Sales Team logins not renewed)' end);

  return jsonb_build_object('applied', true, 'support_until', v_new, 'logins_renewed', v_logins);
end;
$$;


/* ───────────────────────────────────────────────────────────────────────
   6.  THE REMINDER CLAIM — rewritten for the ladder and the two dues
        scope  support   support only
               both      support and logins end on the same day (one e-mail)
               logins    the logins end on a day of their own (support was
                         renewed alone), so they get their own e-mails
   ─────────────────────────────────────────────────────────────────────── */

drop function if exists public.billing_claim_support_reminders();
create function public.billing_claim_support_reminders()
returns table (
  org_id        uuid,
  org_name      text,
  slug          text,
  kind          text,
  support_until timestamptz,
  to_email      text,
  locks_at      timestamptz,
  scope         text,
  due_at        timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_nag   integer := public.vpv_support_nag_days();
  v_kind  text;
  v_scope text;
begin
  /* support (and logins that end the same day) */
  for r in
    select o.id, o.name, o.slug, o.support_until,
           coalesce(o.sales_seats_until, o.support_until) as seats_due,
           (coalesce(o.sales_seats, 0) > 0 and coalesce(o.sales_seat_inr, 0) > 0) as has_logins,
           coalesce(o.billing_email,
                    (select p.email from public.profiles p
                      where p.org_id = o.id and p.role = 'org_admin'
                      order by p.created_at limit 1)) as email
      from public.organizations o
     where o.plan = 'basic'
       and o.plan_status = 'active'
       and o.support_until is not null
       and now() >= o.support_until - interval '30 days'
       and now() <  o.support_until + make_interval(days => v_nag + 3)
  loop
    v_kind := public.vpv_reminder_kind(now() - r.support_until, v_nag);
    continue when v_kind is null;
    v_scope := case when r.has_logins and r.seats_due = r.support_until then 'both' else 'support' end;

    insert into public.support_reminders (org_id, support_until, kind)
    values (r.id, r.support_until, v_kind)
    on conflict do nothing;

    if found and r.email is not null then
      return query select r.id, r.name, r.slug, v_kind, r.support_until, r.email,
                          r.support_until + make_interval(days => v_nag), v_scope, r.support_until;
    end if;
  end loop;

  /* logins whose end date is not the support end date */
  for r in
    select o.id, o.name, o.slug, o.support_until,
           o.sales_seats_until as seats_due,
           coalesce(o.billing_email,
                    (select p.email from public.profiles p
                      where p.org_id = o.id and p.role = 'org_admin'
                      order by p.created_at limit 1)) as email
      from public.organizations o
     where o.plan = 'basic'
       and o.plan_status = 'active'
       and coalesce(o.sales_seats, 0) > 0
       and coalesce(o.sales_seat_inr, 0) > 0
       and o.sales_seats_until is not null
       and o.sales_seats_until is distinct from o.support_until
       and now() >= o.sales_seats_until - interval '30 days'
       and now() <  o.sales_seats_until + make_interval(days => v_nag + 3)
  loop
    v_kind := public.vpv_reminder_kind(now() - r.seats_due, v_nag);
    continue when v_kind is null;

    -- Stored under the logins' own end date, with an L in front of the stage.
    insert into public.support_reminders (org_id, support_until, kind)
    values (r.id, r.seats_due, 'L' || v_kind)
    on conflict do nothing;

    if found and r.email is not null then
      return query select r.id, r.name, r.slug, 'L' || v_kind, r.support_until, r.email,
                          r.seats_due + make_interval(days => v_nag), 'logins'::text, r.seats_due;
    end if;
  end loop;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'billing_claim_support_reminders()',
    'org_logins_state_of(uuid)',
    'billing_apply_support_renewal(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;


/* ───────────────────────────────────────────────────────────────────────
   7.  /admin/payments — EVERY RENEWAL AND WHERE IT STANDS   (owner only)
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.admin_renewals_overview()
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
  last_reminder_at  timestamptz
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
    (select r.sent_at from public.support_reminders r where r.org_id = o.id order by r.sent_at desc limit 1)
  from public.organizations o
  where o.plan = 'basic'
    and public.is_platform_owner()
  order by o.support_until nulls last;
$$;
grant execute on function public.admin_renewals_overview() to authenticated;
