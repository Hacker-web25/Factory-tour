-- ============================================================================
--  VPV BILLING HARDENING  —  exactly-once payments, refunds, support lockout
-- ============================================================================
--
--  Run in Supabase → SQL editor AFTER billing.sql. Safe to re-run.
--
--  WHY THIS FILE EXISTS
--  --------------------
--  billing.sql gave us the tables. This file moves every step where two
--  things could race, or where a crash could leave half a job, INTO the
--  database, where one transaction + one row lock makes it impossible:
--
--   billing_record_payment     one captured payment settles one order, ever.
--                              A second capture on the same order is flagged
--                              as a duplicate so the server can auto-refund it.
--   billing_claim_fulfilment   exactly one worker may build a customer from
--                              a paid order at a time; a crashed worker's
--                              claim expires and the job resumes.
--   billing_issue_invoice      invoice number + invoice row in ONE transaction,
--                              so the sequence can never have a gap. Test-mode
--                              orders use a separate TEST/ series.
--   billing_apply_refund       refund + credit note + revoke what was bought.
--   billing_webhook_begin      webhook ledger that RETRIES a failed event
--                              instead of swallowing it.
--   org_access_state_of        the support lapse ladder (active → nag → locked)
--                              — what the public viewers obey.
--
--  Nothing here is callable by a browser except the three read-only
--  functions at the bottom (my_org_access_state, tour_is_locked and the
--  scene gate). Everything money-moving is service-role only.
-- ============================================================================


/* ───────────────────────────────────────────────────────────────────────
   0.  ONE SOURCE FOR THE LAPSE LADDER LENGTH  (must equal lib/pricing.ts)
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.vpv_support_nag_days()
returns integer
language sql
immutable
as $$ select 7 $$;


/* ───────────────────────────────────────────────────────────────────────
   1.  COLUMNS
   ─────────────────────────────────────────────────────────────────────── */

alter table public.billing_orders
  add column if not exists livemode               boolean     not null default true,
  add column if not exists fulfilment_started_at  timestamptz,
  add column if not exists fulfilment_attempts    integer     not null default 0,
  add column if not exists welcome_emailed_at     timestamptz,
  add column if not exists invoice_emailed_at     timestamptz,
  add column if not exists paid_payment_id        text,
  add column if not exists refunded_paise         bigint      not null default 0,
  add column if not exists quota_before           integer,
  add column if not exists support_until_before   timestamptz,
  add column if not exists support_until_after    timestamptz,
  add column if not exists revoked_at             timestamptz,
  add column if not exists review_flag            text,
  add column if not exists admin_user_new         boolean     not null default false,
  add column if not exists welcome_claimed_at     timestamptz,
  add column if not exists invoice_claimed_at     timestamptz;

alter table public.billing_payments
  add column if not exists is_duplicate        boolean not null default false,
  add column if not exists refund_requested_at timestamptz;

alter table public.billing_webhook_events
  add column if not exists attempts         integer     not null default 1,
  add column if not exists last_received_at timestamptz not null default now();

-- The reconciler and the status poll also record payments they discover.
alter table public.billing_payments drop constraint if exists billing_payments_source_check;
alter table public.billing_payments
  add constraint billing_payments_source_check
  check (source in ('webhook', 'checkout_callback', 'manual', 'reconcile', 'status_poll'));


/* ───────────────────────────────────────────────────────────────────────
   2.  DOUBLE-CLICK GUARD — one OPEN order per buyer + item
       A second identical request finds the open order and reuses it, so
       Razorpay sees ONE order and can take ONE payment.
   ─────────────────────────────────────────────────────────────────────── */

-- Tidy any older duplicates first so the unique index can be built.
with ranked as (
  select id,
         row_number() over (
           partition by lower(buyer_email), purpose, coalesce(scenes, 0),
                        coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)
           order by created_at desc
         ) as rn
    from public.billing_orders
   where status = 'created'
)
update public.billing_orders o
   set status = 'cancelled', updated_at = now()
  from ranked r
 where o.id = r.id and r.rn > 1;

create unique index if not exists billing_orders_one_open_per_buyer
  on public.billing_orders (
    lower(buyer_email), purpose, coalesce(scenes, 0),
    coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'created';

-- Two workspaces must never share an address. Best effort: if old data
-- already contains a duplicate this only prints a notice (fix the data,
-- re-run) — it never aborts the migration.
do $$
begin
  create unique index if not exists organizations_slug_unique
    on public.organizations (lower(slug));
exception when others then
  raise notice 'organizations_slug_unique not created: %', sqlerrm;
end $$;

create index if not exists billing_orders_stuck_idx
  on public.billing_orders (status, provisioned_at)
  where status = 'paid' and provisioned_at is null;

-- A given order can only ever log each plan event once (retry-safe).
create unique index if not exists plan_events_once_per_order
  on public.plan_events (order_id, event)
  where order_id is not null;


/* ───────────────────────────────────────────────────────────────────────
   3.  NEW TABLES
   ─────────────────────────────────────────────────────────────────────── */

create table if not exists public.billing_refunds (
  id                   uuid primary key default gen_random_uuid(),
  razorpay_refund_id   text unique not null,      -- 'dispute_<id>' for chargebacks
  razorpay_payment_id  text not null,
  order_id             uuid references public.billing_orders(id) on delete set null,
  amount_paise         bigint not null check (amount_paise > 0),
  status               text not null check (status in ('created', 'processed', 'failed')),
  kind                 text not null default 'refund' check (kind in ('refund', 'chargeback')),
  reason               text,
  created_at           timestamptz not null default now(),
  processed_at         timestamptz
);
create index if not exists billing_refunds_order_idx on public.billing_refunds (order_id);

create table if not exists public.billing_credit_notes (
  id               uuid primary key default gen_random_uuid(),
  refund_id        uuid not null unique references public.billing_refunds(id) on delete cascade,
  order_id         uuid references public.billing_orders(id) on delete set null,
  invoice_id       uuid references public.billing_invoices(id) on delete set null,
  org_id           uuid references public.organizations(id) on delete set null,
  credit_note_no   text not null unique,
  fy               text not null,
  taxable_paise    bigint not null,
  cgst_paise       bigint not null default 0,
  sgst_paise       bigint not null default 0,
  igst_paise       bigint not null default 0,
  total_paise      bigint not null,
  issued_at        timestamptz not null default now(),
  emailed_at       timestamptz
);

create table if not exists public.billing_alerts (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                      -- amount_mismatch, duplicate_payment, refund, dispute, fulfilment_failed …
  severity     text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  order_id     uuid references public.billing_orders(id) on delete set null,
  detail       text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists billing_alerts_open_idx on public.billing_alerts (created_at desc) where resolved_at is null;

create table if not exists public.support_reminders (
  org_id         uuid not null references public.organizations(id) on delete cascade,
  support_until  timestamptz not null,
  kind           text not null,                    -- t30 t7 t0 t3 t6
  sent_at        timestamptz not null default now(),
  primary key (org_id, support_until, kind)
);

alter table public.billing_refunds       enable row level security;
alter table public.billing_credit_notes  enable row level security;
alter table public.billing_alerts        enable row level security;
alter table public.support_reminders     enable row level security;

drop policy if exists refunds_read_owner on public.billing_refunds;
create policy refunds_read_owner on public.billing_refunds
  for select to authenticated using (public.is_platform_owner());

drop policy if exists alerts_read_owner on public.billing_alerts;
create policy alerts_read_owner on public.billing_alerts
  for select to authenticated using (public.is_platform_owner());

drop policy if exists credit_notes_read_own_org on public.billing_credit_notes;
create policy credit_notes_read_own_org on public.billing_credit_notes
  for select to authenticated
  using (public.is_platform_owner() or (org_id is not null and public.is_org_admin_of(org_id)));

drop policy if exists reminders_read_owner on public.support_reminders;
create policy reminders_read_owner on public.support_reminders
  for select to authenticated using (public.is_platform_owner());


/* ───────────────────────────────────────────────────────────────────────
   4.  RECORD A PAYMENT — one transaction, one row lock
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_record_payment(
  p_razorpay_order_id   text,
  p_payment_id          text,
  p_amount_paise        bigint,
  p_currency            text,
  p_status              text,
  p_method              text    default null,
  p_bank                text    default null,
  p_wallet              text    default null,
  p_vpa                 text    default null,
  p_card_last4          text    default null,
  p_fee_paise           bigint  default null,
  p_tax_paise           bigint  default null,
  p_source              text    default 'webhook',
  p_signature_verified  boolean default false,
  p_error_code          text    default null,
  p_error_description   text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.billing_orders%rowtype;
  v_captured boolean := (p_status = 'captured');
begin
  -- The lock serialises the webhook, the browser callback, the status poll
  -- and the reconciler: whichever arrives first settles the order, the rest
  -- see it settled.
  select * into o
    from public.billing_orders
   where razorpay_order_id = p_razorpay_order_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'order_not_found');
  end if;

  insert into public.billing_payments (
    order_id, razorpay_payment_id, razorpay_order_id, amount_paise, currency,
    status, method, bank, wallet, vpa, card_last4, source, signature_verified,
    fee_paise, tax_paise, error_code, error_description, captured_at
  ) values (
    o.id, p_payment_id, p_razorpay_order_id, p_amount_paise, coalesce(p_currency, 'INR'),
    p_status, p_method, p_bank, p_wallet, p_vpa, p_card_last4, p_source, p_signature_verified,
    p_fee_paise, p_tax_paise, p_error_code, p_error_description,
    case when v_captured then now() else null end
  )
  on conflict (razorpay_payment_id) do update set
    -- A late "failed" or "authorized" must never overwrite a captured payment.
    status = case
      when public.billing_payments.status in ('captured', 'refunded', 'partially_refunded', 'duplicate', 'duplicate_refunded')
       and excluded.status in ('created', 'authorized', 'failed')
      then public.billing_payments.status
      -- A replayed "captured" must not undo what a refund has since recorded.
      when public.billing_payments.status in ('refunded', 'partially_refunded', 'duplicate_refunded')
       and excluded.status = 'captured'
      then public.billing_payments.status
      else excluded.status end,
    method             = coalesce(excluded.method,     public.billing_payments.method),
    bank               = coalesce(excluded.bank,       public.billing_payments.bank),
    wallet             = coalesce(excluded.wallet,     public.billing_payments.wallet),
    vpa                = coalesce(excluded.vpa,        public.billing_payments.vpa),
    card_last4         = coalesce(excluded.card_last4, public.billing_payments.card_last4),
    fee_paise          = coalesce(excluded.fee_paise,  public.billing_payments.fee_paise),
    tax_paise          = coalesce(excluded.tax_paise,  public.billing_payments.tax_paise),
    signature_verified = public.billing_payments.signature_verified or excluded.signature_verified,
    captured_at        = coalesce(public.billing_payments.captured_at, excluded.captured_at),
    error_code         = coalesce(excluded.error_code, public.billing_payments.error_code),
    error_description  = coalesce(excluded.error_description, public.billing_payments.error_description);

  -- Anything short of CAPTURED never grants anything. A failed attempt does
  -- not close the order: Razorpay lets the customer retry on the same order.
  if not v_captured then
    return jsonb_build_object(
      'outcome', case when p_status = 'failed' then 'failed' else 'not_captured' end,
      'order_id', o.id);
  end if;

  -- The money that arrived must be exactly the money we asked for.
  if p_amount_paise is distinct from o.amount_paise
     or coalesce(p_currency, 'INR') is distinct from o.currency then
    update public.billing_orders
       set review_flag = 'amount_mismatch',
           provisioning_error = left(format('Amount mismatch: captured %s %s, expected %s %s',
                                            p_amount_paise, coalesce(p_currency, 'INR'),
                                            o.amount_paise, o.currency), 500),
           updated_at = now()
     where id = o.id;
    return jsonb_build_object('outcome', 'amount_mismatch', 'order_id', o.id);
  end if;

  if o.status = 'refunded' then
    -- The payment that was refunded, seen again: nothing to do.
    if o.paid_payment_id is not distinct from p_payment_id then
      return jsonb_build_object('outcome', 'already_refunded', 'order_id', o.id);
    end if;
    -- A DIFFERENT payment captured after the order was refunded (second tab, UPI
    -- retry): the customer paid and got nothing. Flag it so the server refunds it
    -- and tells the founders — never swallow real money silently.
    update public.billing_payments
       set is_duplicate = true
     where razorpay_payment_id = p_payment_id and not is_duplicate;
    return jsonb_build_object('outcome', 'duplicate', 'order_id', o.id, 'payment_id', p_payment_id,
                              'reason', 'order_already_refunded');
  end if;

  -- One licence per buyer. If the same buyer already has a PAID licence order
  -- (two tabs at different slider positions, or an order we superseded that was
  -- still payable at the gateway), this second payment cannot be built — it
  -- would only collide with the first workspace. Refund it instead of keeping
  -- money for nothing. The advisory lock makes two such payments arriving at
  -- the same moment take turns, so exactly one is kept.
  if o.paid_payment_id is null and o.purpose = 'basic_licence' then
    perform pg_advisory_xact_lock(hashtextextended('basic_licence:' || lower(o.buyer_email), 0));
    if exists (
      select 1
        from public.billing_orders x
       where x.id <> o.id
         and x.purpose = 'basic_licence'
         and lower(x.buyer_email) = lower(o.buyer_email)
         and x.status = 'paid'
         and x.revoked_at is null
    ) then
      update public.billing_payments
         set is_duplicate = true
       where razorpay_payment_id = p_payment_id and not is_duplicate;
      return jsonb_build_object('outcome', 'duplicate', 'order_id', o.id, 'payment_id', p_payment_id,
                                'reason', 'buyer_already_has_licence');
    end if;
  end if;

  -- First capture settles the order. The same payment again is a no-op.
  if o.paid_payment_id is null or o.paid_payment_id = p_payment_id then
    update public.billing_orders
       set status = 'paid',
           paid_at = coalesce(paid_at, now()),
           paid_payment_id = p_payment_id,
           updated_at = now()
     where id = o.id;
    return jsonb_build_object('outcome', 'paid', 'order_id', o.id,
                              'first', o.paid_payment_id is null);
  end if;

  -- A DIFFERENT payment also captured against an already-settled order.
  -- The customer has been charged twice. Flag it; the server refunds it.
  update public.billing_payments
     set is_duplicate = true
   where razorpay_payment_id = p_payment_id and not is_duplicate;
  return jsonb_build_object('outcome', 'duplicate', 'order_id', o.id, 'payment_id', p_payment_id);
end;
$$;


/* ───────────────────────────────────────────────────────────────────────
   5.  FULFILMENT CLAIM — only one worker builds the customer
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_claim_fulfilment(
  p_order         uuid,
  p_stale_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.billing_orders%rowtype;
begin
  update public.billing_orders
     set fulfilment_started_at = now(),
         fulfilment_attempts   = fulfilment_attempts + 1,
         updated_at            = now()
   where id = p_order
     and status = 'paid'
     and provisioned_at is null
     and (fulfilment_started_at is null
          or fulfilment_started_at < now() - make_interval(secs => p_stale_seconds))
  returning * into o;

  if not found then
    return null;
  end if;
  return to_jsonb(o);
end;
$$;

create or replace function public.billing_release_fulfilment(p_order uuid, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.billing_orders
     set fulfilment_started_at = null,
         provisioning_error    = left(p_error, 500),
         updated_at            = now()
   where id = p_order and provisioned_at is null;
$$;

-- Create the organisation for a Basic licence AND link it to the order in
-- one transaction, so a crash can never leave an orphan workspace that a
-- retry would then duplicate.
create or replace function public.billing_create_org_for_order(
  p_order           uuid,
  p_slug            text,
  p_scenes          integer,
  p_support_months  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o       public.billing_orders%rowtype;
  v_org   public.organizations%rowtype;
  v_until timestamptz := now() + make_interval(months => p_support_months);
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  -- A refund or chargeback that landed while we were building must stop the build:
  -- never hand a workspace, an invoice or a password to an order that was given back.
  if o.status <> 'paid' or o.revoked_at is not null then raise exception 'order_not_payable'; end if;

  if o.org_id is not null then
    select * into v_org from public.organizations where id = o.org_id;
    return jsonb_build_object('org_id', o.org_id, 'slug', v_org.slug, 'created', false);
  end if;

  insert into public.organizations (
    name, slug, plan, scene_quota, basic_scene_cap, plan_status,
    support_until, activated_at,
    billing_name, billing_email, billing_phone, billing_address, billing_gstin, billing_state
  ) values (
    o.buyer_company, p_slug, 'basic', p_scenes, least(10, greatest(1, p_scenes)), 'active',
    v_until, now(),
    o.buyer_company, o.buyer_email, o.buyer_phone, o.buyer_address, o.buyer_gstin, o.buyer_state
  )
  returning * into v_org;

  update public.billing_orders
     set org_id = v_org.id,
         quota_before = 0,
         support_until_before = null,
         support_until_after = v_until,
         updated_at = now()
   where id = o.id;

  insert into public.plan_events (org_id, order_id, event, to_plan, to_quota, support_until, actor, note)
  values (v_org.id, o.id, 'provisioned', 'basic', p_scenes, v_until, 'webhook',
          'Paid order ' || coalesce(o.razorpay_order_id, o.id::text))
  on conflict (order_id, event) where order_id is not null do nothing;

  return jsonb_build_object('org_id', v_org.id, 'slug', v_org.slug, 'created', true,
                            'support_until', v_until);
end;
$$;

-- Scene top-up: add the scenes that were PAID FOR (target minus what the
-- workspace had when the order was opened). One transaction; the plan_event
-- is the "already applied" marker, so a retry can never add them twice.
create or replace function public.billing_apply_topup(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o      public.billing_orders%rowtype;
  org    public.organizations%rowtype;
  v_add  integer;
  v_from integer;
  v_to   integer;
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  -- A refund or chargeback that landed while we were building must stop the build:
  -- never hand a workspace, an invoice or a password to an order that was given back.
  if o.status <> 'paid' or o.revoked_at is not null then raise exception 'order_not_payable'; end if;
  if o.org_id is null then raise exception 'topup_without_org'; end if;

  select * into org from public.organizations where id = o.org_id for update;
  if not found then raise exception 'org_missing'; end if;

  if exists (select 1 from public.plan_events where order_id = o.id and event = 'quota_changed') then
    return jsonb_build_object('applied', false, 'to', org.scene_quota);
  end if;

  v_add  := greatest(0, coalesce(o.scenes, 0) - coalesce(o.quota_before, 0));
  v_from := coalesce(org.scene_quota, 0);
  v_to   := v_from + v_add;

  -- Basic tops out at 20 scenes (beyond that the customer belongs on Pro). Two
  -- top-ups paid in overlapping tabs could add up past it: do not hand over more
  -- than the plan allows; flag it so a person refunds or upgrades the customer.
  if v_to > 20 then raise exception 'topup_exceeds_cap'; end if;

  update public.organizations
     set scene_quota = v_to,
         basic_scene_cap = least(10, greatest(1, v_to))
   where id = org.id;

  insert into public.plan_events (org_id, order_id, event, from_quota, to_quota, actor, note)
  values (org.id, o.id, 'quota_changed', v_from, v_to, 'webhook', 'Scene top-up purchased online');

  return jsonb_build_object('applied', true, 'from', v_from, 'to', v_to, 'added', v_add);
end;
$$;

-- Support renewal: extend by a year from the LATER of today and the current
-- expiry (paying early loses nothing; paying late buys a year from today).
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
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  -- A refund or chargeback that landed while we were building must stop the build:
  -- never hand a workspace, an invoice or a password to an order that was given back.
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

  update public.organizations set support_until = v_new where id = org.id;
  update public.billing_orders
     set support_until_before = org.support_until,
         support_until_after  = v_new,
         updated_at = now()
   where id = o.id;

  insert into public.plan_events (org_id, order_id, event, support_until, actor, note)
  values (org.id, o.id, 'support_renewed', v_new, 'webhook', 'Support renewed online');

  return jsonb_build_object('applied', true, 'support_until', v_new);
end;
$$;


/* ───────────────────────────────────────────────────────────────────────
   6.  INVOICES — number and row in ONE transaction  (gapless)
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_issue_invoice(
  p_order        uuid,
  p_description  text,
  p_our_state    text,
  p_gst_rate     numeric,
  p_sac          text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o         public.billing_orders%rowtype;
  v_no      text;
  v_fy      text;
  v_key     text;
  v_num     integer;
  v_tax     bigint;
  v_gst     bigint;
  v_intra   boolean;
  rr        record;
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  -- A refund or chargeback that landed while we were building must stop the build:
  -- never hand a workspace, an invoice or a password to an order that was given back.
  if o.status <> 'paid' or o.revoked_at is not null then raise exception 'order_not_payable'; end if;

  select invoice_no into v_no from public.billing_invoices where order_id = p_order;
  if v_no is not null then return v_no; end if;

  -- The tax point for a service paid in advance is the payment date, so the
  -- invoice belongs to the financial year the money arrived in.
  v_fy  := public.vpv_financial_year(coalesce(o.paid_at, now()));
  v_key := case when o.livemode then v_fy else 'TEST ' || v_fy end;

  insert into public.billing_invoice_counters (fy, last_number)
  values (v_key, 0) on conflict (fy) do nothing;

  update public.billing_invoice_counters
     set last_number = last_number + 1
   where fy = v_key
  returning last_number into v_num;

  v_no := case when o.livemode then 'VPV' else 'TEST' end
          || '/' || v_fy || '/' || lpad(v_num::text, 4, '0');

  v_tax := coalesce(o.taxable_paise, round(o.amount_paise / (1 + p_gst_rate))::bigint);
  v_gst := coalesce(o.gst_paise, o.amount_paise - v_tax);
  v_intra := btrim(coalesce(p_our_state, '')) <> ''
         and lower(btrim(p_our_state)) = lower(btrim(coalesce(o.buyer_state, '')));

  insert into public.billing_invoices (
    order_id, org_id, invoice_no, fy,
    bill_to_name, bill_to_email, bill_to_address, bill_to_gstin, bill_to_state,
    description, sac_code,
    taxable_paise, gst_rate, cgst_paise, sgst_paise, igst_paise, total_paise,
    place_of_supply
  ) values (
    o.id, o.org_id, v_no, v_fy,
    coalesce(nullif(o.buyer_company, ''), o.buyer_name), o.buyer_email,
    o.buyer_address, o.buyer_gstin, o.buyer_state,
    p_description, p_sac,
    v_tax, p_gst_rate,
    case when v_intra then round(v_gst / 2.0)::bigint else 0 end,
    case when v_intra then v_gst - round(v_gst / 2.0)::bigint else 0 end,
    case when v_intra then 0 else v_gst end,
    o.amount_paise,
    o.buyer_state
  );

  -- A (partial) refund that landed BEFORE the invoice existed had nothing to
  -- credit at the time. Issue those credit notes now, so the tax records match
  -- the money. (Re-applying a recorded refund is idempotent.)
  for rr in
    select f.razorpay_refund_id, f.razorpay_payment_id, f.amount_paise, f.kind, f.reason
      from public.billing_refunds f
      join public.billing_payments bp on bp.razorpay_payment_id = f.razorpay_payment_id
     where f.order_id = p_order
       and f.status = 'processed'
       and not bp.is_duplicate
       and not exists (select 1 from public.billing_credit_notes c where c.refund_id = f.id)
     order by f.created_at, f.id
  loop
    perform public.billing_apply_refund(rr.razorpay_refund_id, rr.razorpay_payment_id, rr.amount_paise,
                                        'processed', rr.kind, rr.reason);
  end loop;

  return v_no;
end;
$$;


/* ───────────────────────────────────────────────────────────────────────
   7.  REFUNDS & CHARGEBACKS — record, credit-note, revoke
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_apply_refund(
  p_refund_id   text,
  p_payment_id  text,
  p_amount      bigint,
  p_status      text,                       -- created | processed | failed
  p_kind        text default 'refund',      -- refund | chargeback
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay        public.billing_payments%rowtype;
  o          public.billing_orders%rowtype;
  r          public.billing_refunds%rowtype;
  inv        public.billing_invoices%rowtype;
  org        public.organizations%rowtype;
  v_total    bigint;
  v_full     boolean := false;
  v_revoked  boolean := false;
  v_cn_no    text;
  v_cn_new   boolean := false;
  v_fy       text;
  v_key      text;
  v_num      integer;
  v_tax      bigint;
  v_gst      bigint;
  v_delta    integer;
  v_cur_q    integer;
  v_credited bigint;
  v_amt      bigint;
  v_cg       bigint;
  v_sg       bigint;
  v_ig       bigint;
begin
  select * into pay from public.billing_payments where razorpay_payment_id = p_payment_id;
  if not found then
    return jsonb_build_object('outcome', 'payment_not_found');
  end if;

  select * into o from public.billing_orders where id = pay.order_id for update;
  if not found then
    return jsonb_build_object('outcome', 'order_not_found');
  end if;

  insert into public.billing_refunds (
    razorpay_refund_id, razorpay_payment_id, order_id, amount_paise, status, kind, reason, processed_at
  ) values (
    p_refund_id, p_payment_id, o.id, p_amount, p_status, p_kind, p_reason,
    case when p_status = 'processed' then now() else null end
  )
  on conflict (razorpay_refund_id) do update set
    status = case when public.billing_refunds.status = 'processed' then 'processed' else excluded.status end,
    processed_at = coalesce(public.billing_refunds.processed_at, excluded.processed_at)
  returning * into r;

  -- Our own auto-refund of a DUPLICATE charge: the customer is made whole,
  -- but the order they legitimately paid for must stay exactly as it is.
  if pay.is_duplicate then
    if r.status = 'processed' then
      update public.billing_payments set status = 'duplicate_refunded' where id = pay.id;
    end if;
    return jsonb_build_object('outcome', 'duplicate_refund_recorded', 'order_id', o.id, 'status', r.status);
  end if;

  if r.status <> 'processed' then
    return jsonb_build_object('outcome', 'recorded', 'order_id', o.id, 'status', r.status);
  end if;

  -- Recompute from the ledger instead of adding: replaying an event can
  -- never double-count.
  -- (A duplicate charge we refunded ourselves is not part of what the customer
  -- legitimately paid, so it must not count toward revoking their purchase.)
  select coalesce(sum(f.amount_paise), 0) into v_total
    from public.billing_refunds f
    join public.billing_payments bp on bp.razorpay_payment_id = f.razorpay_payment_id
   where f.order_id = o.id and f.status = 'processed' and not bp.is_duplicate;

  update public.billing_orders set refunded_paise = v_total, updated_at = now() where id = o.id;
  update public.billing_payments
     set status = case when v_total >= o.amount_paise then 'refunded' else 'partially_refunded' end
   where id = pay.id;

  -- Credit note (GST needs one for every refund), issued once per refund.
  select credit_note_no into v_cn_no from public.billing_credit_notes where refund_id = r.id;
  if v_cn_no is null then
    select * into inv from public.billing_invoices where order_id = o.id;
    if found then
      -- Never credit more than was invoiced: a chargeback that arrives after the
      -- same money was already refunded must not produce a second credit note.
      select coalesce(sum(total_paise), 0) into v_credited
        from public.billing_credit_notes where order_id = o.id;
      v_amt := least(r.amount_paise, inv.total_paise - v_credited);
      if v_amt > 0 then
        v_fy  := public.vpv_financial_year(now());
        v_key := case when o.livemode then 'CN ' || v_fy else 'TEST CN ' || v_fy end;
        insert into public.billing_invoice_counters (fy, last_number)
        values (v_key, 0) on conflict (fy) do nothing;
        update public.billing_invoice_counters set last_number = last_number + 1
         where fy = v_key returning last_number into v_num;
        v_cn_no := case when o.livemode then 'VPV' else 'TEST' end
                   || '/CN/' || v_fy || '/' || lpad(v_num::text, 4, '0');

        if v_credited + v_amt >= inv.total_paise then
          -- The final credit takes the exact remainder, so that all the credit
          -- notes together equal the invoice to the paisa (no rounding drift).
          select inv.taxable_paise - coalesce(sum(taxable_paise), 0),
                 inv.cgst_paise    - coalesce(sum(cgst_paise), 0),
                 inv.sgst_paise    - coalesce(sum(sgst_paise), 0),
                 inv.igst_paise    - coalesce(sum(igst_paise), 0)
            into v_tax, v_cg, v_sg, v_ig
            from public.billing_credit_notes where order_id = o.id;
        else
          v_tax := round(inv.taxable_paise * v_amt::numeric / inv.total_paise)::bigint;
          v_gst := v_amt - v_tax;
          v_cg  := case when inv.igst_paise = 0 then round(v_gst / 2.0)::bigint else 0 end;
          v_sg  := case when inv.igst_paise = 0 then v_gst - round(v_gst / 2.0)::bigint else 0 end;
          v_ig  := case when inv.igst_paise > 0 then v_gst else 0 end;
        end if;
        insert into public.billing_credit_notes (
          refund_id, order_id, invoice_id, org_id, credit_note_no, fy,
          taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise
        ) values (
          r.id, o.id, inv.id, o.org_id, v_cn_no, v_fy, v_tax, v_cg, v_sg, v_ig, v_amt
        );
        v_cn_new := true;
      end if;
    end if;
  end if;

  -- Fully refunded → the order is closed and what it bought is taken back.
  if v_total >= o.amount_paise then
    v_full := true;
    update public.billing_orders set status = 'refunded', updated_at = now() where id = o.id;

    if o.revoked_at is null then
      select * into org from public.organizations where id = o.org_id for update;
      if found then
        if o.purpose = 'basic_licence' then
          update public.organizations set plan_status = 'cancelled' where id = org.id;
        elsif o.purpose = 'scene_topup' then
          v_delta := greatest(0, coalesce(o.scenes, 0) - coalesce(o.quota_before, coalesce(o.scenes, 0)));
          v_cur_q := coalesce(org.scene_quota, 0);
          update public.organizations
             set scene_quota = greatest(2, v_cur_q - v_delta),
                 basic_scene_cap = least(10, greatest(1, greatest(2, v_cur_q - v_delta)))
           where id = org.id;
        elsif o.purpose = 'support_renewal' then
          update public.organizations
             set support_until = case
                   when org.support_until is not distinct from o.support_until_after
                     then coalesce(o.support_until_before, now())
                   else org.support_until - interval '12 months' end
           where id = org.id;
        end if;

        insert into public.plan_events (org_id, order_id, event, actor, note)
        values (org.id, o.id, 'refund_revoked', 'webhook',
                format('%s fully refunded (%s)', o.purpose, p_kind))
        on conflict (order_id, event) where order_id is not null do nothing;
        v_revoked := true;
      end if;
      update public.billing_orders set revoked_at = now() where id = o.id;
    end if;
  end if;

  return jsonb_build_object(
    'outcome', 'processed',
    'order_id', o.id,
    'org_id', o.org_id,
    'purpose', o.purpose,
    'buyer_email', o.buyer_email,
    'buyer_name', o.buyer_name,
    'refund_row_id', r.id,
    'refunded_paise', v_total,
    'order_paise', o.amount_paise,
    'fully_refunded', v_full,
    'revoked', v_revoked,
    'credit_note_no', v_cn_no,
    'credit_note_new', v_cn_new,
    'livemode', o.livemode,
    'over_refunded', v_total > o.amount_paise
  );
end;
$$;


/* ───────────────────────────────────────────────────────────────────────
   8.  WEBHOOK LEDGER — retries what failed, ignores what finished
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_webhook_begin(
  p_event_id text,
  p_type     text,
  p_payload  jsonb
)
returns text                       -- new | retry | duplicate
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.billing_webhook_events%rowtype;
begin
  insert into public.billing_webhook_events (event_id, event_type, payload)
  values (p_event_id, p_type, p_payload)
  on conflict (event_id) do nothing;
  if found then return 'new'; end if;

  select * into v from public.billing_webhook_events where event_id = p_event_id for update;
  if v.processed_at is not null then
    return 'duplicate';
  end if;

  -- Only a delivery that follows a FAILED attempt counts towards the give-up
  -- limit. A duplicate that merely arrives while the first is still being
  -- processed (error is null) must not use up the retries.
  update public.billing_webhook_events
     set attempts = attempts + case when error is not null then 1 else 0 end,
         last_received_at = now()
   where event_id = p_event_id;
  return 'retry';
end;
$$;

-- p_retriable = true leaves the event OPEN so Razorpay's next delivery is
-- processed again; false closes it (finished, or an error no retry can fix).
create or replace function public.billing_webhook_finish(
  p_event_id  text,
  p_error     text,
  p_retriable boolean default false
)
returns void
language sql
security definer
set search_path = public
as $$
  -- An event that has been processed successfully is never re-opened by a
  -- slower duplicate that happened to fail ("another worker is on it").
  update public.billing_webhook_events
     set error = case when processed_at is not null and p_retriable then error
                      else left(p_error, 500) end,
         processed_at = case when p_retriable then processed_at
                             else coalesce(processed_at, now()) end
   where event_id = p_event_id;
$$;


/* ───────────────────────────────────────────────────────────────────────
   8b. E-MAIL CLAIMS — each e-mail goes out once, even with two workers
       The welcome e-mail carries a FRESH password; two workers sending it
       would each reset the password and only one e-mail could be right.
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_claim_email(
  p_order         uuid,
  p_which         text,                 -- welcome | invoice
  p_stale_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v boolean;
begin
  if p_which = 'welcome' then
    update public.billing_orders
       set welcome_claimed_at = now()
     where id = p_order
       and provisioned_at is not null
       and welcome_emailed_at is null
       and (welcome_claimed_at is null
            or welcome_claimed_at < now() - make_interval(secs => p_stale_seconds))
    returning true into v;
  elsif p_which = 'invoice' then
    update public.billing_orders
       set invoice_claimed_at = now()
     where id = p_order
       and provisioned_at is not null
       and invoice_emailed_at is null
       and (invoice_claimed_at is null
            or invoice_claimed_at < now() - make_interval(secs => p_stale_seconds))
    returning true into v;
  else
    raise exception 'bad_email_kind';
  end if;
  return coalesce(v, false);
end;
$$;

create or replace function public.billing_finish_email(
  p_order uuid,
  p_which text,
  p_sent  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_which = 'welcome' then
    update public.billing_orders
       set welcome_emailed_at = case when p_sent then now() else welcome_emailed_at end,
           welcome_claimed_at = case when p_sent then welcome_claimed_at else null end
     where id = p_order;
  elsif p_which = 'invoice' then
    update public.billing_orders
       set invoice_emailed_at = case when p_sent then now() else invoice_emailed_at end,
           invoice_claimed_at = case when p_sent then invoice_claimed_at else null end
     where id = p_order;
  end if;
end;
$$;


/* ───────────────────────────────────────────────────────────────────────
   9.  ACCOUNTS — look up an e-mail exactly (no LIKE wildcards)
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_find_auth_user(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;


/* ───────────────────────────────────────────────────────────────────────
   10. THE SUPPORT LAPSE LADDER  (active → nag → locked)
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.org_access_state_of(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.plan_status in ('suspended', 'cancelled') then 'locked'
    when o.plan = 'basic' and o.support_until is not null and o.support_until < now() then
      case when o.support_until + make_interval(days => public.vpv_support_nag_days()) < now()
           then 'locked' else 'nag' end
    else 'active'
  end
  from public.organizations o
  where o.id = p_org;
$$;

-- What the signed-in user's own workspace looks like right now. Read-only.
create or replace function public.my_org_access_state()
returns table (
  state         text,
  plan          text,
  plan_status   text,
  support_until timestamptz,
  locks_at      timestamptz,
  days_to_lock  integer,
  role          text
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
    p.role
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid();
$$;
grant execute on function public.my_org_access_state() to authenticated;

-- For the anonymous viewer: "is this tour's workspace locked?" (so the
-- page can say so instead of showing an empty tour). Reveals nothing else.
create or replace function public.tour_is_locked(p_tour_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.org_access_state_of(t.org_id) = 'locked'
       from public.tours t
      where t.id = p_tour_id),
    false);
$$;
grant execute on function public.tour_is_locked(uuid) to anon, authenticated;

-- The scene gate, now with the lock. Same rules as before, plus: a locked
-- workspace serves NO scenes to anyone but the platform owner.
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

  -- LEVEL 2 of the lapse ladder: the workspace is locked.
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

revoke all on function public.public_tour_scenes(uuid) from public;
grant execute on function public.public_tour_scenes(uuid) to anon, authenticated;

-- Same two screens as before, now on the 7-day ladder and aware of refunds.
create or replace function public.org_support_status(p_org uuid)
returns table (status text, support_until timestamptz, days_left integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when o.plan_status in ('suspended', 'cancelled') then 'lapsed'
      when o.support_until is null then 'none'
      when o.support_until >= now() then 'active'
      when o.support_until + make_interval(days => public.vpv_support_nag_days()) >= now() then 'grace'
      else 'lapsed'
    end,
    o.support_until,
    case when o.support_until is null then null
         else extract(day from (o.support_until - now()))::int end
  from public.organizations o
  where o.id = p_org
    and (public.is_platform_owner() or public.is_org_admin_of(p_org));
$$;
grant execute on function public.org_support_status(uuid) to authenticated;

create or replace function public.admin_customer_overview()
returns table (
  org_id           uuid,
  name             text,
  slug             text,
  plan             text,
  plan_status      text,
  scene_quota      integer,
  support_until    timestamptz,
  support_state    text,
  days_left        integer,
  admin_email      text,
  billing_email    text,
  tours            bigint,
  members          bigint,
  paid_total_paise bigint,
  activated_at     timestamptz,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id, o.name, o.slug, o.plan, o.plan_status, o.scene_quota, o.support_until,
    case
      when o.plan_status in ('suspended', 'cancelled') then 'lapsed'
      when o.support_until is null then 'none'
      when o.support_until >= now() then 'active'
      when o.support_until + make_interval(days => public.vpv_support_nag_days()) >= now() then 'grace'
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
    coalesce((select sum(b.amount_paise - b.refunded_paise) from public.billing_orders b
               where b.org_id = o.id and b.status = 'paid'), 0),
    o.activated_at,
    o.created_at
  from public.organizations o
  where public.is_platform_owner()
  order by o.created_at desc;
$$;
grant execute on function public.admin_customer_overview() to authenticated;


/* ───────────────────────────────────────────────────────────────────────
   11. RENEWAL REMINDERS — claim a reminder once, so it is sent once
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_claim_support_reminders()
returns table (
  org_id        uuid,
  org_name      text,
  slug          text,
  kind          text,
  support_until timestamptz,
  to_email      text,
  locks_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_nag  integer := public.vpv_support_nag_days();
  v_kind text;
  v_gap  interval;
begin
  for r in
    select o.id, o.name, o.slug, o.support_until,
           coalesce(o.billing_email,
                    (select p.email from public.profiles p
                      where p.org_id = o.id and p.role = 'org_admin'
                      order by p.created_at limit 1)) as email
      from public.organizations o
     where o.plan = 'basic'
       and o.plan_status = 'active'
       and o.support_until is not null
       and now() >= o.support_until - interval '30 days'
       and now() <  o.support_until + make_interval(days => v_nag)
  loop
    v_gap := now() - r.support_until;
    v_kind := case
      when v_gap <  interval '-7 days'                              then 't30'
      when v_gap <  interval '0'                                    then 't7'
      when v_gap <  interval '3 days'                               then 't0'
      when v_gap <  make_interval(days => greatest(v_nag - 1, 4))   then 't3'
      else 't6' end;

    insert into public.support_reminders (org_id, support_until, kind)
    values (r.id, r.support_until, v_kind)
    on conflict do nothing;

    if found and r.email is not null then
      return query select r.id, r.name, r.slug, v_kind, r.support_until, r.email,
                          r.support_until + make_interval(days => v_nag);
    end if;
  end loop;
end;
$$;

create or replace function public.billing_unclaim_support_reminder(p_org uuid, p_support_until timestamptz, p_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.support_reminders
   where org_id = p_org and support_until = p_support_until and kind = p_kind;
$$;


/* ───────────────────────────────────────────────────────────────────────
   12. OWNER HEALTH VIEW — what needs a human, in one call
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.admin_billing_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only the platform owner can view billing health';
  end if;

  return jsonb_build_object(
    'stuck_orders', coalesce((
      select jsonb_agg(x order by x->>'paid_at' desc) from (
        select jsonb_build_object(
          'id', o.id, 'razorpay_order_id', o.razorpay_order_id, 'purpose', o.purpose,
          'company', o.buyer_company, 'email', o.buyer_email,
          'amount_paise', o.amount_paise, 'paid_at', o.paid_at,
          'attempts', o.fulfilment_attempts, 'error', o.provisioning_error,
          'livemode', o.livemode) as x
        from public.billing_orders o
        where o.status = 'paid' and o.provisioned_at is null
        order by o.paid_at desc limit 50) s), '[]'::jsonb),
    'flagged_orders', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'id', o.id, 'razorpay_order_id', o.razorpay_order_id, 'flag', o.review_flag,
          'company', o.buyer_company, 'email', o.buyer_email,
          'amount_paise', o.amount_paise, 'error', o.provisioning_error, 'status', o.status) as x
        from public.billing_orders o
        where o.review_flag is not null
        order by o.updated_at desc limit 50) s), '[]'::jsonb),
    'failed_events', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'event_id', e.event_id, 'type', e.event_type, 'error', e.error,
          'attempts', e.attempts, 'received_at', e.received_at,
          'processed', e.processed_at is not null) as x
        from public.billing_webhook_events e
        where e.error is not null
        order by e.received_at desc limit 50) s), '[]'::jsonb),
    'open_alerts', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'id', a.id, 'kind', a.kind, 'severity', a.severity,
          'order_id', a.order_id, 'detail', a.detail, 'created_at', a.created_at) as x
        from public.billing_alerts a
        where a.resolved_at is null
        order by a.created_at desc limit 50) s), '[]'::jsonb),
    'recent_refunds', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'refund_id', f.razorpay_refund_id, 'order_id', f.order_id, 'kind', f.kind,
          'amount_paise', f.amount_paise, 'status', f.status, 'created_at', f.created_at) as x
        from public.billing_refunds f
        order by f.created_at desc limit 20) s), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.admin_billing_health() to authenticated;


/* ───────────────────────────────────────────────────────────────────────
   12b. THE LOCK IS ENFORCED BY THE DATABASE, NOT JUST THE SCREEN
        A locked workspace (support year over + 7 days, or a refunded /
        suspended account) can neither read nor change its scenes, and cannot
        create or edit tours — even from a modified browser or a script using
        the public API key. The platform owner is exempt.

        These are RESTRICTIVE policies: they are AND-ed with the policies that
        already exist, so they can only ever take access away, never grant it.
        They have no effect on a table unless row-level security is already on
        for it (it is, for scenes and tours).
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.org_workspace_open(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_org is null                                   then true
    when public.org_access_state_of(p_org) is distinct from 'locked' then true
    when auth.uid() is not null and exists (
           select 1 from public.profiles pr
            where pr.id = auth.uid() and pr.role = 'owner') then true
    else false
  end;
$$;

create or replace function public.tour_workspace_open(p_tour uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.org_workspace_open(t.org_id) from public.tours t where t.id = p_tour),
    true);
$$;

grant execute on function public.org_workspace_open(uuid)  to anon, authenticated;
grant execute on function public.tour_workspace_open(uuid) to anon, authenticated;

do $$
begin
  if to_regclass('public.scenes') is not null then
    drop policy if exists vpv_lock_scenes on public.scenes;
    create policy vpv_lock_scenes on public.scenes
      as restrictive
      for all
      to anon, authenticated
      using (public.tour_workspace_open(tour_id))
      with check (public.tour_workspace_open(tour_id));
  end if;

  if to_regclass('public.tours') is not null then
    drop policy if exists vpv_lock_tours_insert on public.tours;
    drop policy if exists vpv_lock_tours_update on public.tours;
    drop policy if exists vpv_lock_tours_delete on public.tours;
    create policy vpv_lock_tours_insert on public.tours
      as restrictive for insert to anon, authenticated
      with check (public.org_workspace_open(org_id));
    create policy vpv_lock_tours_update on public.tours
      as restrictive for update to anon, authenticated
      using (public.org_workspace_open(org_id))
      with check (public.org_workspace_open(org_id));
    create policy vpv_lock_tours_delete on public.tours
      as restrictive for delete to anon, authenticated
      using (public.org_workspace_open(org_id));
  end if;
end $$;


/* ───────────────────────────────────────────────────────────────────────
   12c. NOBODY CAN GRANT THEMSELVES A PLAN
        The browser edits its own organisation (theme, name, logo) directly
        with the public API key. If the row-level-security policy that allows
        that does not limit WHICH columns, an organisation admin could write
        plan = 'ultra', scene_quota = 999 or support_until = '2099-01-01'
        from the browser console and skip payment — and skip the lock.

        This trigger closes that regardless of what the policies say: anyone
        who is not the service role, the SQL editor, one of our own
        SECURITY DEFINER functions, or the platform owner cannot change a plan,
        quota or support date. New organisations created from the browser
        always start as plain Basic with no quota and no support date.
   ─────────────────────────────────────────────────────────────────────── */

-- Is the caller the platform owner? (is_platform_owner() is only executable by
-- signed-in users; the trigger below can also run for anon, so it has its own.)
create or replace function public.vpv_caller_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'owner'),
    false);
$$;
grant execute on function public.vpv_caller_is_owner() to anon, authenticated;

create or replace function public.protect_org_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Browser sessions run as anon / authenticated. Everything else (service
  -- role, migrations, SECURITY DEFINER functions, the SQL editor) is trusted.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.vpv_caller_is_owner() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan            := 'basic';
    new.plan_status     := 'active';
    new.scene_quota     := null;
    new.basic_scene_cap := 2;
    new.support_until   := null;
    new.activated_at    := null;
    return new;
  end if;

  if new.plan            is distinct from old.plan
  or new.plan_status     is distinct from old.plan_status
  or new.scene_quota     is distinct from old.scene_quota
  or new.basic_scene_cap is distinct from old.basic_scene_cap
  or new.support_until   is distinct from old.support_until
  or new.activated_at    is distinct from old.activated_at then
    raise exception 'Plan, scene and support fields can only be changed by the billing system'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_billing on public.organizations;
create trigger organizations_protect_billing
  before insert or update on public.organizations
  for each row execute function public.protect_org_billing_columns();


/* ───────────────────────────────────────────────────────────────────────
   13. LOCK DOWN — money-moving functions are server-only
   ─────────────────────────────────────────────────────────────────────── */

do $$
declare
  f text;
begin
  foreach f in array array[
    'billing_record_payment(text,text,bigint,text,text,text,text,text,text,text,bigint,bigint,text,boolean,text,text)',
    'billing_claim_fulfilment(uuid,integer)',
    'billing_release_fulfilment(uuid,text)',
    'billing_create_org_for_order(uuid,text,integer,integer)',
    'billing_apply_topup(uuid)',
    'billing_apply_support_renewal(uuid)',
    'billing_issue_invoice(uuid,text,text,numeric,text)',
    'billing_apply_refund(text,text,bigint,text,text,text)',
    'billing_webhook_begin(text,text,jsonb)',
    'billing_webhook_finish(text,text,boolean)',
    'billing_find_auth_user(text)',
    'billing_claim_email(uuid,text,integer)',
    'billing_finish_email(uuid,text,boolean)',
    'billing_claim_support_reminders()',
    'billing_unclaim_support_reminder(uuid,timestamptz,text)',
    'org_access_state_of(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;


/* ───────────────────────────────────────────────────────────────────────
   14. THE LEDGER CANNOT BE QUIETLY REWRITTEN
       GST requires tax invoices and credit notes to be kept and to stay
       as issued. These guards make an accidental (or malicious) UPDATE or
       DELETE fail loudly, even for the service role. A deliberate
       correction is still possible from the SQL editor:
           begin; set local vpv.allow_billing_delete = 'on'; ... commit;
       (the same switch also allows a deliberate correction of an issued record)
   ─────────────────────────────────────────────────────────────────────── */

create or replace function public.billing_ledger_no_delete()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('vpv.allow_billing_delete', true), '') = 'on' then
    return old;
  end if;
  raise exception 'billing_records_cannot_be_deleted'
    using hint = 'Tax and payment records must be kept. To override on purpose: set local vpv.allow_billing_delete = ''on'';';
end;
$$;

create or replace function public.billing_invoice_frozen()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('vpv.allow_billing_delete', true), '') = 'on' then return new; end if;
  -- Only the "who/where it was sent" bookkeeping may change.
  if (to_jsonb(new) - 'org_id' - 'emailed_at') is distinct from (to_jsonb(old) - 'org_id' - 'emailed_at') then
    raise exception 'invoice_is_frozen';
  end if;
  return new;
end;
$$;

create or replace function public.billing_credit_note_frozen()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('vpv.allow_billing_delete', true), '') = 'on' then return new; end if;
  if (to_jsonb(new) - 'org_id' - 'order_id' - 'invoice_id' - 'emailed_at')
     is distinct from (to_jsonb(old) - 'org_id' - 'order_id' - 'invoice_id' - 'emailed_at') then
    raise exception 'credit_note_is_frozen';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['billing_orders', 'billing_payments', 'billing_refunds', 'billing_invoices', 'billing_credit_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_no_delete', t);
    execute format(
      'create trigger %I before delete on public.%I for each row execute function public.billing_ledger_no_delete()',
      t || '_no_delete', t);
  end loop;
end $$;

drop trigger if exists billing_invoices_frozen on public.billing_invoices;
create trigger billing_invoices_frozen
  before update on public.billing_invoices
  for each row execute function public.billing_invoice_frozen();

drop trigger if exists billing_credit_notes_frozen on public.billing_credit_notes;
create trigger billing_credit_notes_frozen
  before update on public.billing_credit_notes
  for each row execute function public.billing_credit_note_frozen();

-- An invoice or credit note whose parts do not add up cannot be stored at all.
-- (NOT VALID: enforced for every new row without re-checking old test rows.)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billing_invoices_adds_up') then
    alter table public.billing_invoices add constraint billing_invoices_adds_up
      check (taxable_paise >= 0 and total_paise > 0
             and taxable_paise + cgst_paise + sgst_paise + igst_paise = total_paise
             and not (igst_paise > 0 and (cgst_paise > 0 or sgst_paise > 0))) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_credit_notes_adds_up') then
    alter table public.billing_credit_notes add constraint billing_credit_notes_adds_up
      check (taxable_paise >= 0 and total_paise > 0
             and taxable_paise + cgst_paise + sgst_paise + igst_paise = total_paise
             and not (igst_paise > 0 and (cgst_paise > 0 or sgst_paise > 0))) not valid;
  end if;
end $$;

notify pgrst, 'reload schema';
