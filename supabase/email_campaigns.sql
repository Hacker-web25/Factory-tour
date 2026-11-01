-- ============================================================================
-- VPV — e-mail campaigns (Nov 2026)
--
-- An e-mail campaign is an ordinary campaign folder (channel = 'email') whose
-- people each hold one tracked link, plus two extra things:
--
--   email_campaigns         one row per e-mail campaign: the e-mail's subject
--                           and text (so it can be read back in one click),
--                           the Zoho campaign it matches, and the one shared
--                           coupon with how many days it lasts.
--   email_recipient_stats   what Zoho knows about each person (sent, opened,
--                           clicked, bounced, unsubscribed), loaded from the
--                           reports Zoho exports. VPV does NOT track opens: the
--                           mail system already does, and it does it better.
--
-- Safe to run more than once. Run in the Supabase SQL editor.
-- Owner-only: RLS on, no policy, no grants to the browser roles.
-- ============================================================================

create table if not exists public.email_campaigns (
  folder_id            uuid primary key
                         references public.campaign_folders(id) on delete cascade,
  -- The campaign's name inside Zoho, so the two systems can be matched by eye.
  zoho_campaign_name   text,
  subject              text,
  preheader            text,
  -- The e-mail as sent, kept for reference ("what did we tell them?").
  body_text            text,
  -- When the e-mail went (or goes) out. The coupon clock starts here.
  sent_at              timestamptz,
  -- ONE shared coupon for the whole campaign. Its limit and expiry live on
  -- the coupons row; these two say how it was set up.
  coupon_code          text references public.coupons(code) on delete set null,
  coupon_days          integer check (coupon_days between 1 and 365),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.email_campaigns is
  'Extra settings for a campaign folder whose channel is email: the e-mail text, the Zoho name and the shared coupon.';

create table if not exists public.email_recipient_stats (
  code          text primary key
                  references public.campaign_codes(code) on delete cascade,
  sent_at       timestamptz,
  delivered     boolean not null default false,
  opened_at     timestamptz,
  open_count    integer not null default 0 check (open_count >= 0),
  clicked_at    timestamptz,
  click_count   integer not null default 0 check (click_count >= 0),
  bounced       boolean not null default false,
  bounce_reason text,
  unsubscribed  boolean not null default false,
  complained    boolean not null default false,
  updated_at    timestamptz not null default now()
);

comment on table public.email_recipient_stats is
  'Per-recipient e-mail results imported from Zoho. One row per campaign_codes row, removed with it.';

create index if not exists email_recipient_stats_opened_idx
  on public.email_recipient_stats (opened_at) where opened_at is not null;

-- Same stance as campaign_codes: the server (service role) reads and writes;
-- the public anon key can do nothing here.
alter table public.email_campaigns enable row level security;
alter table public.email_recipient_stats enable row level security;
revoke all on public.email_campaigns from anon, authenticated;
revoke all on public.email_recipient_stats from anon, authenticated;
