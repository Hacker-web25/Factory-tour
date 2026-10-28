-- ─────────────────────────────────────────────────────────────────────────────
-- campaign_outreach.sql — who has been contacted, and what came of it.
--
-- The campaign pages tell you WHO to call. This is where you write down that
-- you called. Without it the hot list is a list you re-read every morning,
-- not knowing which names you have already tried.
--
-- One row per person already exists (campaign_codes), so the follow-up lives
-- on it rather than in a table of its own: a person is a code, and a code has
-- at most one live conversation.
--
-- Additive and safe to run twice. Nothing existing is changed or dropped, and
-- the app falls back gracefully (and says so) when this has not been run yet.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.campaign_codes
  add column if not exists outreach_state text not null default 'new',
  add column if not exists contacted_at   timestamptz,
  add column if not exists rep_notes      text,
  add column if not exists follow_up_on   date;

-- new           nobody has tried yet
-- tried         called or messaged, no answer
-- spoke         had a conversation
-- booked        a call or a shoot is booked
-- won           paid
-- declined      said no
-- wrong_person  the card reached someone who is not the decision maker
alter table public.campaign_codes
  drop constraint if exists campaign_codes_outreach_state_known;
alter table public.campaign_codes
  add constraint campaign_codes_outreach_state_known
  check (outreach_state in ('new', 'tried', 'spoke', 'booked', 'won', 'declined', 'wrong_person'));

alter table public.campaign_codes
  drop constraint if exists campaign_codes_rep_notes_len;
alter table public.campaign_codes
  add constraint campaign_codes_rep_notes_len
  check (rep_notes is null or char_length(rep_notes) <= 4000);

-- The call list is read as "everyone due today": keep that cheap.
create index if not exists campaign_codes_follow_up_idx
  on public.campaign_codes (follow_up_on)
  where follow_up_on is not null;

-- campaign_codes is already locked to the service role (RLS on, nothing
-- granted to anon or authenticated); adding columns does not reopen it.
