-- supabase/workspace_address.sql — the address a customer chooses, and
-- the address our crew drives to.
--
-- Run this once in the Supabase SQL editor. Safe to run twice.
--
-- WHY requested_slug: a workspace lives at <slug>.myvpv.com, and that is
-- what a customer prints on a business card. It used to be generated at
-- fulfilment time, which appended a random number whenever the plain
-- name was taken — that is how the company "LiveTest" ended up at
-- livetest-407.myvpv.com. Now the customer picks it at checkout, we
-- check it is free before taking the money, and fulfilment uses exactly
-- what they chose.
--
-- WHY the address parts: until now the funnel never collected a street
-- address at all, so invoices went out with no address on them — and
-- the shoot crew had only a city. Both needs are answered by the same
-- four fields, asked once.

alter table public.billing_orders
  add column if not exists requested_slug     text,
  add column if not exists buyer_address_line text,
  add column if not exists buyer_city         text,
  add column if not exists buyer_pincode      text;

-- One order per address, so two people cannot pay for the same one in
-- the same minute. Partial, because most historical rows have none.
create unique index if not exists billing_orders_requested_slug_live
  on public.billing_orders (requested_slug)
  where requested_slug is not null and status in ('created', 'paid');

comment on column public.billing_orders.requested_slug is
  'The workspace address the customer chose at checkout (<slug>.myvpv.com). Fulfilment uses this exactly.';
comment on column public.billing_orders.buyer_pincode is
  'Plant PIN code — printed on the tax invoice and used by the shoot crew.';
