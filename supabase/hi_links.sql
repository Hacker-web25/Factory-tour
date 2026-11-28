-- ─────────────────────────────────────────────────────────────────────────────
-- hi_links.sql — the personal welcome on a printed letter.
--
-- When somebody scans their QR, the page greets them by name ("welcome Aryan").
-- The greeting is the first word of campaign_codes.person_name by default, with
-- Dr./Mr./Shri and lone initials skipped. greeting_name is the OVERRIDE: fill it
-- in when the default would be wrong, for example "Dr. Sharma" or "Rajesh ji".
--
-- Additive and safe to run twice. Nothing existing is changed or dropped, and
-- the redirect works (without the override) until this has been run: it asks
-- for the column, and carries on without it if it is not there yet.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.campaign_codes
  add column if not exists greeting_name text;

alter table public.campaign_codes
  drop constraint if exists campaign_codes_greeting_name_len;
alter table public.campaign_codes
  add constraint campaign_codes_greeting_name_len
  check (greeting_name is null or char_length(greeting_name) <= 24);

-- campaign_codes is already locked to the service role (RLS on, nothing
-- granted to anon or authenticated); adding a column does not reopen it.
