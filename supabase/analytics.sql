-- ============================================================================
-- supabase/analytics.sql — marketing analytics the business OWNS.
--
-- Google Analytics and Microsoft Clarity answer "how many" and "what did
-- they look at". Neither can answer the question this file exists for:
--
--     "The pamphlet we posted to Gurugram factories — how many of those
--      people scanned it, how far did each one get, and who PAID?"
--
-- Google cannot answer that because a third of visitors block it, and
-- because it never sees the order. These tables can: every scan, every
-- page and every funnel step is written first-party by our own server,
-- then joined to funnel_leads and billing_orders.
--
-- Four tables:
--   campaign_codes  the QR / print / link registry you create codes in
--   campaign_scans  one row per scan of a code
--   site_visitors   one row per anonymous browser, holding FIRST-touch
--   site_events     the journey: page views and funnel steps
--
-- PRIVACY. None of this stores a name, an e-mail or a precise location.
-- A visitor is a random uuid in a first-party cookie, the IP is kept only
-- for abuse forensics on the scan row, and the city/country come from
-- Vercel's edge headers (city-level, same as the tour analytics already
-- in tour_events). Identity only ever appears once the visitor types it
-- into the funnel themselves, and that lives in funnel_leads.
--
-- Re-runnable: every statement is idempotent.
-- ============================================================================

-- ─────────────────────────── campaign_codes ────────────────────────────────
-- One row per tracked link. The code is the thing printed on the pamphlet,
-- so it is the primary key: short, memorable, and typed into a QR as
-- https://myvpv.com/q/<code>.
create table if not exists public.campaign_codes (
  code          text primary key
                  check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$'),
  -- What a human calls it: "Gurugram pamphlet, October 2026".
  label         text not null,
  -- Where the scan lands. A path on myvpv.com, never an outside URL, so a
  -- stolen code can never be turned into an open redirect.
  destination   text not null default '/'
                  check (destination like '/%' and destination not like '//%'),
  -- Carried into the URL as utm_* so Google Analytics groups it the same
  -- way our own tables do.
  source        text not null default 'pamphlet',
  medium        text not null default 'qr',
  campaign      text,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);

comment on table public.campaign_codes is
  'Tracked links. /q/<code> logs a scan and redirects to destination with utm_* attached.';

-- ─────────────────────────── campaign_scans ────────────────────────────────
-- One row per scan. Written server-side inside the redirect, so it counts
-- even when the visitor blocks every script on the page.
create table if not exists public.campaign_scans (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  code        text not null references public.campaign_codes(code) on delete cascade,
  -- The browser this scan belongs to, so the scan can be joined to the
  -- journey and the order that follow it.
  visitor_id  uuid,
  country     text,
  city        text,
  referrer    text,
  user_agent  text,
  -- Abuse forensics only (someone scanning a code 10,000 times).
  ip          text
);

create index if not exists campaign_scans_code_idx    on public.campaign_scans (code, created_at desc);
create index if not exists campaign_scans_visitor_idx on public.campaign_scans (visitor_id);
create index if not exists campaign_scans_created_idx on public.campaign_scans (created_at desc);

-- ─────────────────────────── site_visitors ─────────────────────────────────
-- One row per anonymous browser. The first_* columns are FIRST-touch and are
-- never overwritten: if someone scans the pamphlet, leaves, and comes back a
-- week later through Google, the pamphlet still gets the credit for the sale.
-- That is the whole point of posting the pamphlet.
create table if not exists public.site_visitors (
  visitor_id      uuid primary key,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  first_source    text,
  first_medium    text,
  first_campaign  text,
  first_code      text,
  first_referrer  text,
  landing_path    text,
  country         text,
  city            text,
  page_views      integer not null default 0
);

create index if not exists site_visitors_code_idx  on public.site_visitors (first_code);
create index if not exists site_visitors_first_idx on public.site_visitors (first_seen_at desc);

-- ─────────────────────────── site_events ───────────────────────────────────
-- The journey. One row per page view or named event. Deliberately small and
-- append-only: no joins on write, so a burst of traffic cannot slow the site.
create table if not exists public.site_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  visitor_id  uuid not null,
  session_id  uuid,
  -- page_view, funnel_step, cta_click, outbound_click, scroll_depth …
  name        text not null,
  path        text,
  referrer    text,
  -- Anything the event needs that does not deserve a column of its own
  -- (which funnel step, which plan, how far they scrolled).
  meta        jsonb,
  country     text,
  city        text
);

create index if not exists site_events_visitor_idx on public.site_events (visitor_id, created_at);
create index if not exists site_events_name_idx    on public.site_events (name, created_at desc);
create index if not exists site_events_created_idx on public.site_events (created_at desc);

-- ──────────────── attribution on the lead and the order ────────────────────
-- Added to funnel_leads rather than kept separate, so the rep working the
-- list and the owner reading /admin/marketing see the same truth, and so a
-- paid order traces back to the pamphlet in one join.
alter table public.funnel_leads
  add column if not exists visitor_id    uuid,
  add column if not exists campaign_code text,
  add column if not exists utm_source    text,
  add column if not exists utm_medium    text,
  add column if not exists utm_campaign  text,
  add column if not exists utm_term      text,
  add column if not exists utm_content   text,
  add column if not exists landing_path  text,
  add column if not exists referrer      text;

create index if not exists funnel_leads_visitor_idx  on public.funnel_leads (visitor_id);
create index if not exists funnel_leads_campaign_idx on public.funnel_leads (campaign_code);

-- ─────────────────────────── RLS: server only ──────────────────────────────
-- Same stance as funnel_leads and billing_orders: RLS on, no policy for
-- anon or authenticated, so the browser can neither read nor write any of
-- it. Everything goes through the service role in our own route handlers.
alter table public.campaign_codes enable row level security;
alter table public.campaign_scans enable row level security;
alter table public.site_visitors  enable row level security;
alter table public.site_events    enable row level security;

revoke all on public.campaign_codes from anon, authenticated;
revoke all on public.campaign_scans from anon, authenticated;
revoke all on public.site_visitors  from anon, authenticated;
revoke all on public.site_events    from anon, authenticated;

-- ──────────────────── first-touch visitor upsert ───────────────────────────
-- One statement, so a burst of traffic cannot interleave a read and a write
-- and lose a visitor's origin. The first_* columns use coalesce, which means
-- "fill if we never knew" — they are written once and then never change, so
-- the pamphlet keeps the credit even when the visitor returns via Google.
create or replace function public.vpv_touch_visitor(
  p_visitor   uuid,
  p_source    text default null,
  p_medium    text default null,
  p_campaign  text default null,
  p_code      text default null,
  p_referrer  text default null,
  p_landing   text default null,
  p_country   text default null,
  p_city      text default null,
  p_count_view boolean default true
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.site_visitors as v (
    visitor_id, first_source, first_medium, first_campaign, first_code,
    first_referrer, landing_path, country, city, page_views
  )
  values (
    p_visitor, p_source, p_medium, p_campaign, p_code,
    p_referrer, p_landing, p_country, p_city,
    case when p_count_view then 1 else 0 end
  )
  on conflict (visitor_id) do update set
    last_seen_at   = now(),
    page_views     = v.page_views + case when p_count_view then 1 else 0 end,
    -- Never overwrite a known origin.
    first_source   = coalesce(v.first_source,   excluded.first_source),
    first_medium   = coalesce(v.first_medium,   excluded.first_medium),
    first_campaign = coalesce(v.first_campaign, excluded.first_campaign),
    first_code     = coalesce(v.first_code,     excluded.first_code),
    first_referrer = coalesce(v.first_referrer, excluded.first_referrer),
    landing_path   = coalesce(v.landing_path,   excluded.landing_path),
    country        = coalesce(v.country,        excluded.country),
    city           = coalesce(v.city,           excluded.city);
$$;

revoke all on function public.vpv_touch_visitor(
  uuid, text, text, text, text, text, text, text, text, boolean
) from anon, authenticated;
