-- ============================================================================
-- funnel.sql — the VPV pricing funnel: lead capture and e-mail verification.
--
-- Two tables, both written ONLY by the server (the service role, from
-- app/api/funnel/*). Neither is readable or writable by the browser: a
-- visitor's own answers are held in their browser until they are posted,
-- and nobody but an owner needs to read anyone's.
--
-- Idempotent — safe to re-run. Apply after billing.sql.
-- ============================================================================

-- ─────────────────────────── funnel_leads ───────────────────────────────────
-- One row per visitor who starts the funnel, UPDATED as they move through it.
--
-- The row is written the moment the first step is submitted and then filled in
-- step by step, on purpose: a lead who configured ₹1.2 lakh of Control and
-- stopped at the bill is the most useful call of the week, and that is only
-- knowable if the row exists before the payment does. `stage` is how far they
-- got.
create table if not exists public.funnel_leads (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- How far through the funnel this visitor reached.
  stage                   text not null default 'info'
                            check (stage in ('info','scope','security','plan','billing','paid')),

  -- Step 1: who they are.
  name                    text,
  phone                   text,
  email                   text,
  company                 text,
  industry                text,

  -- Step 1: where the factory is. Decides the logistics tier, so it is the
  -- single most important answer in the funnel.
  factory_city            text,
  factory_state           text,
  logistics_tier          smallint check (logistics_tier between 1 and 5),
  -- True when the city was not on our 150-city list and a rep must confirm
  -- the travel arrangement before the shoot.
  city_needs_confirmation boolean not null default false,

  -- Step 2: the scope they asked for.
  aoa_count               integer,
  video_count             integer,
  pdf_count               integer,

  -- Step 3: the security question. The reason most of them buy Control.
  wants_sharing_controls  boolean,

  -- Step 4: what we recommended and what they actually chose.
  recommended_plan        text check (recommended_plan in ('confidence','authority','control')),
  chosen_plan             text check (chosen_plan in ('confidence','authority','control')),
  extra_areas             integer not null default 0,
  extra_videos            integer not null default 0,

  -- The last quote we showed them, GST included, in whole rupees. What a rep
  -- should have in front of them on the call.
  quoted_total_inr        integer,

  -- Consent. Separate columns because they are separate consents: the terms
  -- are required to buy, being contacted is not.
  terms_accepted_at       timestamptz,
  marketing_consent       boolean not null default false,
  marketing_consent_at    timestamptz,

  -- E-mail verification (see funnel_otp).
  email_verified_at       timestamptz,

  -- Set once they pay, so /admin can see which leads converted.
  order_id                uuid references public.billing_orders(id) on delete set null,

  -- For the rep working the list.
  contacted_at            timestamptz,
  rep_notes               text,

  -- Abuse forensics only.
  ip                      text,
  user_agent              text
);

create index if not exists funnel_leads_created_idx on public.funnel_leads (created_at desc);
create index if not exists funnel_leads_stage_idx   on public.funnel_leads (stage);
create index if not exists funnel_leads_email_idx   on public.funnel_leads (lower(email));
create index if not exists funnel_leads_city_idx    on public.funnel_leads (lower(factory_city));

-- Keep updated_at honest without the API having to remember.
create or replace function public.funnel_leads_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists funnel_leads_touch_trg on public.funnel_leads;
create trigger funnel_leads_touch_trg
  before update on public.funnel_leads
  for each row execute function public.funnel_leads_touch();

-- ─────────────────────────── funnel_otp ─────────────────────────────────────
-- E-mail verification codes for the billing step.
--
-- The code is stored as a SHA-256 hash, never in clear: a leaked row must not
-- let anyone verify somebody else's address. `attempts` is checked and bumped
-- server-side so a six-digit code cannot be brute-forced, and a consumed or
-- expired row can never verify again.
create table if not exists public.funnel_otp (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  consumed_at timestamptz,
  lead_id     uuid references public.funnel_leads(id) on delete cascade,
  ip          text
);

create index if not exists funnel_otp_email_idx   on public.funnel_otp (lower(email), created_at desc);
create index if not exists funnel_otp_expires_idx on public.funnel_otp (expires_at);

-- ─────────────────────────── RLS: server only ───────────────────────────────
-- RLS is ON with NO policy for anon or authenticated, which denies everything
-- to both. The service role bypasses RLS, so app/api/funnel/* can read and
-- write while the browser cannot touch either table — not its own row, and
-- certainly not anyone else's.
alter table public.funnel_leads enable row level security;
alter table public.funnel_otp   enable row level security;

drop policy if exists funnel_leads_no_public on public.funnel_leads;
drop policy if exists funnel_otp_no_public   on public.funnel_otp;

-- Owners (the super-owner) read the lead list through the service role in
-- /admin, not through the browser, so no select policy is granted here.

-- ─────────────────────────── Housekeeping ───────────────────────────────────
-- Spent and expired codes are rubbish after an hour. Called by the daily
-- reconciler; harmless to call by hand.
create or replace function public.funnel_otp_sweep()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from public.funnel_otp
   where expires_at < now() - interval '1 hour';
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.funnel_otp_sweep() from public, anon, authenticated;

-- ─────────────────────────── Added: what they picked ────────────────────────
-- The named areas and processes from step 2, so a rep can open the call with
-- "I see you'd like buyers to see your ETP and your tool room" instead of a
-- bare count. Idempotent: safe on a database that already has funnel_leads.
alter table public.funnel_leads add column if not exists areas     text[];
alter table public.funnel_leads add column if not exists processes text[];

-- When the visitor ticked "I agree to the Terms, Privacy Policy and other
-- policies" on step 1. Being contacted about the enquiry is explained in the
-- Privacy Policy, so this is the record that a call-back was agreed to.
alter table public.funnel_leads add column if not exists policies_accepted_at timestamptz;
