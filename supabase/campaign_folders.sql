-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/campaign_folders.sql — marketing campaigns as FOLDERS.
--
-- Run in the Supabase SQL editor after analytics.sql. Safe to run again.
--
-- WHY. The pamphlet run is the main way VPV reaches factory owners: a
-- printed card reaches a managing director's desk through his guard, which
-- no social post ever does. Each print run is its own campaign — a city, a
-- batch, a trade show — and each one needs its own answer to "did it work?".
--
-- Until now a batch was only a free-typed `campaign` string on each code.
-- That cannot hold the one number the whole run is judged on: HOW MANY WE
-- PRINTED. Without the denominator, "64 scans" is unreadable — 64 out of
-- 220 is a good print run, 64 out of 5,000 is a waste of money.
--
-- So a folder is a real row. It owns:
--   • how many were printed and when they were handed out (the denominator),
--   • the city and channel, so two cities can be compared,
--   • its codes, each of which knows whether it actually reached a desk.
--
-- WHAT THIS FILE ALSO FIXES. analytics.sql grew the two columns that make a
-- code personal (person_name, person_company) AFTER it had already been run
-- on production, so the live table never got them and /admin/marketing/buyers
-- could not work. They are re-applied here; the add is idempotent either way.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── campaign_folders ──────────────────────────────
create table if not exists public.campaign_folders (
  id             uuid primary key default gen_random_uuid(),
  -- Used in /admin/marketing/folders/<slug>. Lower-case so it is safe to
  -- type and cannot collide with a differently-cased duplicate.
  slug           text not null unique,
  name           text not null,
  city           text,
  state          text,
  -- How it reached them. "pamphlet" is a printed card left at the gate.
  channel        text not null default 'pamphlet',
  -- Where the codes in this folder land by default.
  destination    text not null default '/',
  -- THE DENOMINATOR: how many pieces were actually printed. Null means we
  -- never recorded it, which is shown as such rather than guessed from the
  -- number of codes.
  printed_count  integer,
  -- When the batch went out. Scans before this date are a proof run, not a
  -- customer, and the folder page says so.
  distributed_at date,
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  archived_at    timestamptz
);

comment on table public.campaign_folders is
  'One marketing campaign / print run. Owns its codes and the printed count that every rate is measured against.';

-- Constraints as a DO block: Postgres has no "add constraint if not exists",
-- and this file must survive being run twice.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_folders_slug_shape') then
    alter table public.campaign_folders
      add constraint campaign_folders_slug_shape
      check (slug ~ '^[a-z0-9][a-z0-9_-]{1,48}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campaign_folders_channel_known') then
    alter table public.campaign_folders
      add constraint campaign_folders_channel_known
      check (channel in ('pamphlet','tradeshow','courier','visit','email','whatsapp','other'));
  end if;

  -- The destination is a path on our own site, never an absolute URL: the
  -- same rule campaign_codes.destination carries, so a folder can never
  -- hand our domain to a phishing page.
  if not exists (select 1 from pg_constraint where conname = 'campaign_folders_destination_path') then
    alter table public.campaign_folders
      add constraint campaign_folders_destination_path
      check (destination ~ '^/' and destination !~ '^//' and destination !~ '\\');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campaign_folders_printed_sane') then
    alter table public.campaign_folders
      add constraint campaign_folders_printed_sane
      check (printed_count is null or (printed_count >= 0 and printed_count <= 1000000));
  end if;
end $$;

create index if not exists campaign_folders_active_idx
  on public.campaign_folders (active, created_at desc);

-- ──────────────────── campaign_codes: folder + the person ──────────────────
alter table public.campaign_codes
  -- From analytics.sql; re-applied because production never received them.
  add column if not exists person_name     text,
  add column if not exists person_company  text,
  -- Which folder this code belongs to.
  add column if not exists folder_id       uuid references public.campaign_folders(id) on delete set null,
  -- Did this piece actually reach a desk? A code that was printed but never
  -- handed over must not count against the scan rate.
  add column if not exists delivery_state  text not null default 'made',
  add column if not exists delivered_at    timestamptz,
  -- Who it was for, for the follow-up call. Owner-only table (RLS below).
  add column if not exists recipient_role  text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_email text,
  -- Position in the printed sheet, so a code can be found on the physical
  -- stack: "folder GGN-OCT26, piece 137".
  add column if not exists print_seq       integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_codes_delivery_state_known') then
    alter table public.campaign_codes
      add constraint campaign_codes_delivery_state_known
      check (delivery_state in ('made','printed','delivered','refused','lost'));
  end if;
end $$;

create index if not exists campaign_codes_folder_idx
  on public.campaign_codes (folder_id, print_seq);
create index if not exists campaign_codes_person_idx
  on public.campaign_codes (campaign) where person_name is not null;
create index if not exists campaign_codes_delivery_idx
  on public.campaign_codes (delivery_state);

-- ──────────────── campaign_scans: what device opened it ────────────────────
-- A factory owner scanning at his desk on a phone behaves differently from
-- a purchase officer opening the link on a laptop later. Parsed server-side
-- from the user agent, so nothing extra is asked of the browser.
alter table public.campaign_scans
  add column if not exists device  text,
  add column if not exists os      text,
  add column if not exists browser text,
  -- False for the first scan of a code, true for every scan after it. The
  -- second scan is usually the piece being shown to somebody else, which is
  -- the strongest interest signal a printed card can produce.
  add column if not exists is_repeat boolean not null default false;

-- ──────────────────── site_visitors: device, once ──────────────────────────
alter table public.site_visitors
  add column if not exists device  text,
  add column if not exists os      text,
  add column if not exists browser text;

-- ───────────────────────── backfill: one folder per batch ──────────────────
-- Codes made before folders existed are grouped by their `campaign` string,
-- so no history is stranded. A no-op on a database whose codes already have
-- a folder.
do $$
declare
  r record;
  v_slug text;
  v_id   uuid;
begin
  for r in
    select campaign, count(*) as n, min(created_at) as first_at
      from public.campaign_codes
     where folder_id is null and campaign is not null and btrim(campaign) <> ''
     group by campaign
  loop
    -- "Gurugram, Oct 26" -> "gurugram-oct-26"
    v_slug := lower(regexp_replace(regexp_replace(r.campaign, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));
    v_slug := left(nullif(v_slug, ''), 48);
    if v_slug is null then
      v_slug := 'batch-' || substr(md5(r.campaign), 1, 8);
    end if;
    -- A slug already taken by a different batch gets a suffix.
    if exists (select 1 from public.campaign_folders where slug = v_slug) then
      v_slug := left(v_slug, 39) || '-' || substr(md5(r.campaign), 1, 8);
    end if;

    insert into public.campaign_folders (slug, name, channel, printed_count, created_at)
    values (v_slug, r.campaign, 'pamphlet', r.n, r.first_at)
    returning id into v_id;

    update public.campaign_codes
       set folder_id = v_id
     where folder_id is null and campaign = r.campaign;
  end loop;
end $$;

-- ─────────────────────────── RLS: server only ──────────────────────────────
-- Same stance as campaign_codes: RLS on and no policy, so the browser can
-- neither read nor write. Everything goes through the service role in our
-- own owner-guarded route handlers. This matters more here than elsewhere:
-- these rows carry buyers' names, phone numbers and e-mail addresses.
alter table public.campaign_folders enable row level security;
revoke all on public.campaign_folders from anon, authenticated;

-- ──────────────── first-touch device, written once ─────────────────────────
-- Kept separate from vpv_touch_visitor rather than added to its arguments:
-- changing that function's signature would create a second overload and
-- make every existing call ambiguous.
create or replace function public.vpv_set_visitor_device(
  p_visitor uuid,
  p_device  text default null,
  p_os      text default null,
  p_browser text default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.site_visitors set
    device  = coalesce(device,  p_device),
    os      = coalesce(os,      p_os),
    browser = coalesce(browser, p_browser)
  where visitor_id = p_visitor
    and (device is null or os is null or browser is null);
$$;

revoke all on function public.vpv_set_visitor_device(uuid, text, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ──────────────── one scan, recorded atomically ────────────────────────────
-- "Is this the first time this card was scanned?" cannot be answered by a
-- read followed by a write: two taps arriving together would both read
-- "none yet" and both be filed as first. So the EXISTS runs inside the
-- insert, against the table as it stands before this row is added.
--
-- A repeat scan is the strongest signal a printed card can produce: it
-- almost always means the card was handed to somebody else.
--
-- NOTE on delivery_state: a scan does NOT mark a code delivered. Delivery
-- is what the distribution team recorded by hand, and it is the honest
-- denominator for "reached a desk". If a scan set it automatically, the
-- delivered count could never be lower than the scanned count and the step
-- would always read 100% — a number that looks like information and is not.
create or replace function public.vpv_record_scan(
  p_code       text,
  p_visitor    uuid default null,
  p_referrer   text default null,
  p_user_agent text default null,
  p_ip         text default null,
  p_country    text default null,
  p_city       text default null,
  p_device     text default null,
  p_os         text default null,
  p_browser    text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.campaign_scans
    (code, visitor_id, referrer, user_agent, ip, country, city,
     device, os, browser, is_repeat)
  select
    p_code, p_visitor, left(p_referrer, 300), left(p_user_agent, 400), p_ip,
    p_country, p_city, p_device, p_os, p_browser,
    exists (select 1 from public.campaign_scans s where s.code = p_code);
$$;

revoke all on function public.vpv_record_scan(
  text, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

notify pgrst, 'reload schema';
