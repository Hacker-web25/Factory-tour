-- Recipient contact info on share links — so the tour owner sees "sent
-- to rajesh@acme.com" or the WhatsApp number, not just an anonymous
-- token. Both are optional; nothing else changes if left blank.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.share_links
  add column if not exists shared_to_email text,
  add column if not exists shared_to_phone text;

notify pgrst, 'reload schema';
