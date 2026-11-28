-- Security features for VPV Light, and the Buy now details (28 Nov 2026).
--
-- 1. organizations.security_addon: VPV Light bought with the "Security
--    features" add-on (₹5,000 a month, billed yearly). It opens the same four
--    link controls Premium has: one-time view links, passwords, expiry time and
--    device limits. The renewal amount (plan_yearly_inr) already includes it.
--    Set only by the billing system or our team, like the plan itself.
--
-- 2. billing_orders.buy_details: what the Buy now page asked beyond the invoice:
--    who to call, the shoot site (which may differ from the billing address),
--    the preferred dates, the delivery address printed on the invoice.
--    billing_orders.shoot_address: the one-line shoot site, for the invoice.
--
-- 3. org_link_controls() also says yes for a workspace with the add-on, so the
--    share_links_enforce_plan trigger lets it set a password, an expiry or a
--    device limit. Must match accessTo() in lib/entitlements.ts.
--
-- Safe to run more than once. Nobody's access narrows: it only adds.

alter table public.organizations
  add column if not exists security_addon boolean not null default false;

comment on column public.organizations.security_addon is
  'VPV Light bought with the Security features add-on (link controls). Set by the billing system only.';

alter table public.billing_orders
  add column if not exists buy_details jsonb,
  add column if not exists shoot_address text;

comment on column public.billing_orders.buy_details is
  'Buy now details: contact, shoot site, dates, extras, consent. Frozen with the order.';
comment on column public.billing_orders.shoot_address is
  'Where the crew shoots, one line. Printed on the invoice as the address of delivery when it differs from the billing address.';

-- The plan columns can only be changed by the billing system or our team.
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
    new.plan_billing := null;
    new.security_addon := false;
    return new;
  end if;
  if new.site_plan         is distinct from old.site_plan
  or new.sales_seats       is distinct from old.sales_seats
  or new.sales_seat_inr    is distinct from old.sales_seat_inr
  or new.sales_seats_until is distinct from old.sales_seats_until
  or new.plan_yearly_inr   is distinct from old.plan_yearly_inr
  or new.plan_offer_locked is distinct from old.plan_offer_locked
  or new.plan_billing      is distinct from old.plan_billing
  or new.security_addon    is distinct from old.security_addon then
    raise exception 'The plan and Sales Team logins can only be changed by the billing system'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Premium and up have every link control; so does VPV Light with the add-on.
create or replace function public.org_link_controls(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when o.plan in ('pro', 'ultra')
        or o.site_plan in ('premium', 'ultra', 'white_glove', 'control', 'enterprise')
        or coalesce(o.security_addon, false)
        then '{"oneTime": true, "password": true, "expiry": true, "devices": true}'::jsonb
      else '{"oneTime": false, "password": false, "expiry": false, "devices": false}'::jsonb
    end
      from public.organizations o where o.id = p_org
  ), '{"oneTime": false, "password": false, "expiry": false, "devices": false}'::jsonb);
$$;
grant execute on function public.org_link_controls(uuid) to anon, authenticated;
