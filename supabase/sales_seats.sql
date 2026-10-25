-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/sales_seats.sql — Sales Team logins are billed yearly.
--
-- Since 26 Oct 2026 a Sales Team login is a yearly charge (₹199 per login
-- per year for our first 50 customers, ₹999 after), renewed together with
-- support, hosting & security. The workspace remembers how many logins it
-- bought and the price it bought them at, so the renewal bills exactly that.
--
-- Run once in the Supabase SQL editor. Safe to run again. Until it is run,
-- payments still work; the renewal simply bills support alone.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists sales_seats    integer not null default 0 check (sales_seats >= 0),
  add column if not exists sales_seat_inr integer          check (sales_seat_inr >= 0);

comment on column public.organizations.sales_seats is
  'Sales Team logins this workspace pays for each year (set from the paid plan order).';
comment on column public.organizations.sales_seat_inr is
  'Price per login per year, GST excluded, locked at purchase (199 for the first 50 customers). 0 = bought before logins were yearly.';
