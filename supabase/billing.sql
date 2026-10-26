-- ============================================================================
--  VPV BILLING  —  orders, payments, GST invoices, plan + support tracking
-- ============================================================================
--
--  Run ONCE in Supabase → SQL editor. Safe to re-run (every statement is
--  idempotent). Run AFTER plan_tiers.sql.
--
--  WHAT THIS FILE GUARANTEES
--  -------------------------
--  1. No browser can ever write a payment record. Every table below is
--     RLS-protected with NO insert/update/delete policy for anon or
--     authenticated roles — only the service-role key (server-side, in
--     the Razorpay webhook) can write. A customer cannot mark their own
--     order paid, change an amount, or grant themselves a plan.
--  2. Customers can READ their own organisation's orders and invoices,
--     and nobody else's. The platform owner reads everything.
--  3. A webhook that arrives twice does nothing the second time
--     (billing_webhook_events.event_id is unique).
--  4. Invoice numbers are gapless and sequential per financial year,
--     allocated under a row lock so two simultaneous payments can never
--     take the same number.
--
--  WHAT WE SELL (mirrors lib/pricing.ts — keep the two in step)
--  ------------------------------------------------------------
--    basic   one-time, customer picks 2–20 scenes on a slider
--    pro     ₹5,000/month,  unlimited scenes   (sold by conversation)
--    ultra   ₹15,000/month, unlimited scenes   (sold by conversation)
--    support ₹9,999/year,  FIRST YEAR FREE with every Basic purchase
--
-- ============================================================================


/* ───────────────────────────────────────────────────────────────────────
   1.  ORGANISATIONS — what plan they are on, and until when
   ─────────────────────────────────────────────────────────────────────── */

-- How many scenes this org's customers may see. NULL = unlimited (Pro,
-- Ultra). Replaces the older `basic_scene_cap`, which was capped at 10
-- and could not express "unlimited".
alter table public.organizations
  add column if not exists scene_quota integer;

alter table public.organizations
  add column if not exists plan_status text not null default 'active'
  check (plan_status in ('active', 'suspended', 'cancelled'));

-- Technical support and maintenance runs until this moment. Set to
-- (activation + 1 year) free of charge on the first Basic purchase, and
-- pushed out by a year on every paid renewal. NULL = never activated.
alter table public.organizations
  add column if not exists support_until timestamptz;

-- When the workspace went live. Anchors the free support year.
alter table public.organizations
  add column if not exists activated_at timestamptz;

-- Billing identity, captured at checkout and printed on the invoice.
alter table public.organizations add column if not exists billing_name     text;
alter table public.organizations add column if not exists billing_email    text;
alter table public.organizations add column if not exists billing_phone    text;
alter table public.organizations add column if not exists billing_address  text;
alter table public.organizations add column if not exists billing_gstin    text;
alter table public.organizations add column if not exists billing_state    text;

-- Backfill the new quota from the old column so nothing changes for
-- orgs that already exist, then give Pro/Ultra unlimited.
update public.organizations
   set scene_quota = coalesce(scene_quota, basic_scene_cap)
 where plan = 'basic' and scene_quota is null;

update public.organizations
   set scene_quota = null
 where plan in ('pro', 'ultra');

comment on column public.organizations.scene_quota is
  'Scenes visible to end customers. NULL = unlimited (Pro/Ultra). Basic = what they purchased.';
comment on column public.organizations.support_until is
  'Technical support valid until this moment. First year is free with a Basic purchase.';


/* ───────────────────────────────────────────────────────────────────────
   2.  ORDERS — one row per attempt to pay us
   ─────────────────────────────────────────────────────────────────────── */

create table if not exists public.billing_orders (
  id                  uuid primary key default gen_random_uuid(),

  -- Razorpay's order id (order_xxx). Unique so a retry cannot duplicate.
  razorpay_order_id   text unique,

  -- What is being bought. Mirrors PurchasePurpose in lib/pricing.ts.
  purpose             text not null
                      check (purpose in ('basic_licence', 'support_renewal', 'scene_topup')),

  -- Scenes bought (licence / top-up). NULL for a support renewal.
  scenes              integer check (scenes is null or scenes between 1 and 100),

  -- THE AMOUNT, in paise, computed on the server from lib/pricing.ts.
  -- Never accepted from the browser.
  amount_paise        bigint not null check (amount_paise > 0),
  currency            text not null default 'INR',

  -- GST breakup frozen at the time of the order, so a later rate change
  -- never rewrites history.
  taxable_paise       bigint,
  gst_paise           bigint,
  gst_rate            numeric(5,4),

  status              text not null default 'created'
                      check (status in ('created', 'paid', 'failed', 'refunded', 'cancelled')),

  -- Buyer details as typed at checkout. For a NEW customer there is no
  -- org yet, so this is all we know until provisioning runs.
  buyer_name          text not null,
  buyer_email         text not null,
  buyer_phone         text,
  buyer_company       text not null,
  buyer_gstin         text,
  buyer_address       text,
  buyer_state         text,

  -- Filled in once the workspace exists (new customer) or straight away
  -- (renewal / top-up by an existing customer).
  org_id              uuid references public.organizations(id) on delete set null,
  created_by          uuid references public.profiles(id)      on delete set null,

  -- Set when provisioning has completed, so it can never run twice.
  provisioned_at      timestamptz,
  provisioning_error  text,

  notes               text,
  client_ip           text,

  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  updated_at          timestamptz not null default now()
);

create index if not exists billing_orders_org_idx    on public.billing_orders (org_id, created_at desc);
create index if not exists billing_orders_status_idx on public.billing_orders (status, created_at desc);
create index if not exists billing_orders_email_idx  on public.billing_orders (lower(buyer_email));


/* ───────────────────────────────────────────────────────────────────────
   3.  PAYMENTS — what Razorpay actually captured
   ─────────────────────────────────────────────────────────────────────── */

create table if not exists public.billing_payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.billing_orders(id) on delete cascade,

  razorpay_payment_id   text unique not null,
  razorpay_order_id     text,

  amount_paise          bigint not null,
  currency              text not null default 'INR',
  status                text not null,            -- captured / authorized / failed / refunded
  method                text,                     -- upi / card / netbanking / wallet
  bank                  text,
  wallet                text,
  vpa                   text,                     -- UPI id, if that is how they paid
  card_last4            text,                     -- never the full number

  -- How we learnt about it, and whether the signature checked out.
  source                text not null default 'webhook'
                        check (source in ('webhook', 'checkout_callback', 'manual')),
  signature_verified    boolean not null default false,

  fee_paise             bigint,                   -- Razorpay's fee, from the webhook
  tax_paise             bigint,                   -- GST on that fee

  error_code            text,
  error_description     text,

  captured_at           timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists billing_payments_order_idx on public.billing_payments (order_id);


/* ───────────────────────────────────────────────────────────────────────
   4.  INVOICES — gapless, sequential, per financial year
   ─────────────────────────────────────────────────────────────────────── */

create table if not exists public.billing_invoice_counters (
  fy          text primary key,                  -- '2026-27'
  last_number integer not null default 0
);

create table if not exists public.billing_invoices (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null unique references public.billing_orders(id) on delete cascade,
  org_id            uuid references public.organizations(id) on delete set null,

  invoice_no        text not null unique,        -- VPV/2026-27/0001
  fy                text not null,

  -- Frozen copies. An invoice must still be reproducible years later,
  -- after prices, addresses and GST rates have all moved on.
  bill_to_name      text not null,
  bill_to_email     text not null,
  bill_to_address   text,
  bill_to_gstin     text,
  bill_to_state     text,

  description       text not null,
  sac_code          text not null default '998434',

  taxable_paise     bigint not null,
  gst_rate          numeric(5,4) not null,
  cgst_paise        bigint not null default 0,
  sgst_paise        bigint not null default 0,
  igst_paise        bigint not null default 0,
  total_paise       bigint not null,

  place_of_supply   text,
  issued_at         timestamptz not null default now(),
  emailed_at        timestamptz,

  created_at        timestamptz not null default now()
);

create index if not exists billing_invoices_org_idx on public.billing_invoices (org_id, issued_at desc);

-- Indian financial year label for a moment in time: April–March.
create or replace function public.vpv_financial_year(p_at timestamptz default now())
returns text
language sql
immutable
as $$
  select case
    when extract(month from p_at at time zone 'Asia/Kolkata') >= 4
      then to_char(p_at at time zone 'Asia/Kolkata', 'YYYY') || '-' ||
           to_char((p_at at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else to_char((p_at at time zone 'Asia/Kolkata') - interval '1 year', 'YYYY') || '-' ||
         to_char(p_at at time zone 'Asia/Kolkata', 'YY')
  end;
$$;

-- Allocate the next invoice number under a row lock. Two payments
-- landing in the same millisecond still get different numbers, and the
-- sequence never skips — which is what GST law expects.
create or replace function public.next_invoice_number(p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy  text := public.vpv_financial_year(p_at);
  v_num integer;
begin
  insert into public.billing_invoice_counters (fy, last_number)
  values (v_fy, 0)
  on conflict (fy) do nothing;

  update public.billing_invoice_counters
     set last_number = last_number + 1
   where fy = v_fy
  returning last_number into v_num;

  return 'VPV/' || v_fy || '/' || lpad(v_num::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number(timestamptz) from public, anon, authenticated;


/* ───────────────────────────────────────────────────────────────────────
   5.  WEBHOOK EVENTS — the idempotency ledger
   ─────────────────────────────────────────────────────────────────────── */

create table if not exists public.billing_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      text unique not null,            -- Razorpay's x-razorpay-event-id
  event_type    text not null,
  payload       jsonb,
  processed_at  timestamptz,
  error         text,
  received_at   timestamptz not null default now()
);

create index if not exists billing_webhook_events_type_idx
  on public.billing_webhook_events (event_type, received_at desc);


/* ───────────────────────────────────────────────────────────────────────
   6.  PLAN EVENTS — an audit trail of every plan or quota change
   ─────────────────────────────────────────────────────────────────────── */

create table if not exists public.plan_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) on delete cascade,
  order_id      uuid references public.billing_orders(id) on delete set null,

  event         text not null,                   -- provisioned / plan_changed / quota_changed / support_renewed / suspended
  from_plan     text,
  to_plan       text,
  from_quota    integer,
  to_quota      integer,
  support_until timestamptz,

  actor         text,                            -- 'webhook' | 'owner:<uuid>' | 'system'
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists plan_events_org_idx on public.plan_events (org_id, created_at desc);


/* ───────────────────────────────────────────────────────────────────────
   7.  SALES ENQUIRIES — the Pro / Ultra "let's talk" form
   ─────────────────────────────────────────────────────────────────────── */

create table if not exists public.sales_enquiries (
  id            uuid primary key default gen_random_uuid(),
  plan          text check (plan in ('basic', 'pro', 'ultra')),
  name          text not null,
  company       text not null,
  email         text not null,
  phone         text,
  message       text,
  scenes_hint   integer,
  status        text not null default 'new'
                check (status in ('new', 'contacted', 'won', 'lost')),
  client_ip     text,
  created_at    timestamptz not null default now()
);

create index if not exists sales_enquiries_status_idx on public.sales_enquiries (status, created_at desc);


/* ───────────────────────────────────────────────────────────────────────
   8.  ROW LEVEL SECURITY
       Writes: service-role only (no policy below grants insert/update
       /delete, and RLS denies anything not explicitly allowed).
       Reads:  your own org, or everything if you are the platform owner.
   ─────────────────────────────────────────────────────────────────────── */

alter table public.billing_orders           enable row level security;
alter table public.billing_payments         enable row level security;
alter table public.billing_invoices         enable row level security;
alter table public.billing_invoice_counters enable row level security;
alter table public.billing_webhook_events   enable row level security;
alter table public.plan_events              enable row level security;
alter table public.sales_enquiries          enable row level security;

-- Is the caller the platform owner (you)?
create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'owner'
  );
$$;

-- Is the caller an admin of this organisation?
create or replace function public.is_org_admin_of(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and org_id = p_org
       and role in ('org_admin', 'owner')
  );
$$;

grant execute on function public.is_platform_owner()      to authenticated;
grant execute on function public.is_org_admin_of(uuid)    to authenticated;

do $$
begin
  -- Orders: your org's, or all of them if you are the owner.
  if not exists (select 1 from pg_policies
                  where tablename = 'billing_orders' and policyname = 'orders_read_own_org') then
    create policy orders_read_own_org on public.billing_orders
      for select to authenticated
      using (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));
  end if;

  if not exists (select 1 from pg_policies
                  where tablename = 'billing_payments' and policyname = 'payments_read_own_org') then
    create policy payments_read_own_org on public.billing_payments
      for select to authenticated
      using (
        public.is_platform_owner()
        or exists (
          select 1 from public.billing_orders o
           where o.id = billing_payments.order_id
             and o.org_id is not null
             and public.is_org_admin_of(o.org_id)
        )
      );
  end if;

  if not exists (select 1 from pg_policies
                  where tablename = 'billing_invoices' and policyname = 'invoices_read_own_org') then
    create policy invoices_read_own_org on public.billing_invoices
      for select to authenticated
      using (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));
  end if;

  if not exists (select 1 from pg_policies
                  where tablename = 'plan_events' and policyname = 'plan_events_read_own_org') then
    create policy plan_events_read_own_org on public.plan_events
      for select to authenticated
      using (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));
  end if;

  -- Enquiries and webhook events: platform owner only. Nobody else,
  -- ever — these hold other people's contact details and raw payloads.
  if not exists (select 1 from pg_policies
                  where tablename = 'sales_enquiries' and policyname = 'enquiries_read_owner') then
    create policy enquiries_read_owner on public.sales_enquiries
      for select to authenticated using (public.is_platform_owner());
  end if;

  if not exists (select 1 from pg_policies
                  where tablename = 'billing_webhook_events' and policyname = 'webhooks_read_owner') then
    create policy webhooks_read_owner on public.billing_webhook_events
      for select to authenticated using (public.is_platform_owner());
  end if;
end $$;


/* ───────────────────────────────────────────────────────────────────────
   9.  SCENE GATE — now driven by scene_quota
       Replaces the version in plan_tiers.sql. Behaviour is the same;
       the number just comes from the new column, and NULL means
       unlimited so Pro and Ultra are never capped.
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.public_tour_scenes(p_tour_id uuid)
returns setof public.scenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org        uuid;
  v_plan       text;
  v_quota      int;
  v_status     text;
  v_is_owner   boolean := false;
begin
  select org_id into v_org from public.tours where id = p_tour_id;
  if v_org is null then
    return;                       -- unknown tour → viewer shows "not found"
  end if;

  select plan, coalesce(scene_quota, basic_scene_cap), plan_status
    into v_plan, v_quota, v_status
    from public.organizations
   where id = v_org;

  -- Only the platform owner bypasses the quota. Org admins and
  -- presenters do NOT: when they present a Basic tour to a customer the
  -- cap must apply, or the gate means nothing. The editor is unaffected
  -- because /tour/[id]/edit reads the scenes table directly.
  if auth.uid() is not null then
    select true into v_is_owner
      from public.profiles
     where id = auth.uid() and role = 'owner';
  end if;

  -- Unlimited when: platform owner, a non-Basic plan, or no quota set.
  if v_is_owner or v_plan is distinct from 'basic' or v_quota is null then
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

revoke all on function public.public_tour_scenes(uuid) from public;
grant execute on function public.public_tour_scenes(uuid) to anon, authenticated;


/* ───────────────────────────────────────────────────────────────────────
   10. SUPPORT STATUS — one call, answered in milliseconds
       Powers the "is this customer entitled to support?" badge.
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.org_support_status(p_org uuid)
returns table (
  status        text,          -- active | grace | lapsed | none
  support_until timestamptz,
  days_left     integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when o.support_until is null then 'none'
      when o.support_until >= now() then 'active'
      when o.support_until + (15 || ' days')::interval >= now() then 'grace'
      else 'lapsed'
    end as status,
    o.support_until,
    case when o.support_until is null then null
         else extract(day from (o.support_until - now()))::int
    end as days_left
  from public.organizations o
  where o.id = p_org
    and (public.is_platform_owner() or public.is_org_admin_of(p_org));
$$;

grant execute on function public.org_support_status(uuid) to authenticated;


/* ───────────────────────────────────────────────────────────────────────
   11. OWNER CONTROLS — replace the hand-written SQL you run today
   ─────────────────────────────────────────────────────────────────────── */

-- Change an org's plan, quota and support date in one audited call.
-- This is how a Pro or Ultra customer gets switched on after they pay
-- you outside the website. Platform owner only.
create or replace function public.admin_set_org_plan(
  p_org           uuid,
  p_plan          text,
  p_scene_quota   integer default null,
  p_support_until timestamptz default null,
  p_note          text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_plan  text;
  v_from_quota integer;
begin
  if not public.is_platform_owner() then
    raise exception 'Only the platform owner can change a plan';
  end if;
  if p_plan not in ('basic', 'pro', 'ultra') then
    raise exception 'Unknown plan %', p_plan;
  end if;

  select plan, scene_quota into v_from_plan, v_from_quota
    from public.organizations where id = p_org;

  update public.organizations
     set plan          = p_plan,
         -- Pro and Ultra are unlimited; Basic keeps whatever is passed
         -- (or its current quota when the caller passes nothing).
         scene_quota   = case when p_plan in ('pro', 'ultra') then null
                              else coalesce(p_scene_quota, scene_quota) end,
         support_until = coalesce(p_support_until, support_until)
   where id = p_org;

  insert into public.plan_events
    (org_id, event, from_plan, to_plan, from_quota, to_quota, support_until, actor, note)
  values
    (p_org, 'plan_changed', v_from_plan, p_plan, v_from_quota,
     case when p_plan in ('pro','ultra') then null else coalesce(p_scene_quota, v_from_quota) end,
     p_support_until, 'owner:' || coalesce(auth.uid()::text, '?'), p_note);
end;
$$;

grant execute on function public.admin_set_org_plan(uuid, text, integer, timestamptz, text) to authenticated;

-- Every customer, with their plan and support state, in one query.
-- This is the "know it in seconds" view behind /admin/customers.
create or replace function public.admin_customer_overview()
returns table (
  org_id        uuid,
  name          text,
  slug          text,
  plan          text,
  plan_status   text,
  scene_quota   integer,
  support_until timestamptz,
  support_state text,
  days_left     integer,
  admin_email   text,
  billing_email text,
  tours         bigint,
  members       bigint,
  paid_total_paise bigint,
  activated_at  timestamptz,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.slug,
    o.plan,
    o.plan_status,
    o.scene_quota,
    o.support_until,
    case
      when o.support_until is null then 'none'
      when o.support_until >= now() then 'active'
      when o.support_until + interval '15 days' >= now() then 'grace'
      else 'lapsed'
    end,
    case when o.support_until is null then null
         else extract(day from (o.support_until - now()))::int end,
    (select p.email from public.profiles p
      where p.org_id = o.id and p.role = 'org_admin'
      order by p.created_at limit 1),
    o.billing_email,
    (select count(*) from public.tours t    where t.org_id = o.id),
    (select count(*) from public.profiles p where p.org_id = o.id),
    coalesce((select sum(b.amount_paise) from public.billing_orders b
               where b.org_id = o.id and b.status = 'paid'), 0),
    o.activated_at,
    o.created_at
  from public.organizations o
  where public.is_platform_owner()
  order by o.created_at desc;
$$;

grant execute on function public.admin_customer_overview() to authenticated;


notify pgrst, 'reload schema';

/* ───────────────────────────────────────────────────────────────────────
   HANDY QUERIES
   ───────────────────────────────────────────────────────────────────────

   -- Who is due for support renewal in the next 30 days?
   select name, slug, support_until
     from public.organizations
    where support_until between now() and now() + interval '30 days'
    order by support_until;

   -- Switch a customer to Pro (unlimited scenes) for a year:
   select public.admin_set_org_plan(
     '<org-uuid>', 'pro', null, now() + interval '1 year', 'Paid by bank transfer, inv VPV/2026-27/0007');

   -- Give a Basic customer 3 more scenes:
   select public.admin_set_org_plan('<org-uuid>', 'basic', 8, null, 'Top-up');

   -- Everything you sold this month:
   select created_at::date, purpose, scenes, amount_paise/100.0 as rupees, buyer_company
     from public.billing_orders
    where status = 'paid' and created_at >= date_trunc('month', now())
    order by created_at desc;

   ─────────────────────────────────────────────────────────────────────── */
