-- How a paying customer says they plan to use VPV.
--
-- Asked once, on the page a customer lands on after paying
-- (/assessment/welcome). The answers tell us how buyers really use a
-- virtual plant visit, so marketing can be positioned around it.
--
-- One row per paid order. Written only by the server (the service role),
-- through /api/billing/usage, and read only by the platform owner through
-- /api/admin/usage. No browser can read or write this table directly.
--
-- Safe to run more than once.

create table if not exists public.order_usage (
  order_id    uuid primary key references public.billing_orders(id) on delete cascade,
  uses        text[] not null check (cardinality(uses) between 1 and 12),
  other_text  text check (other_text is null or char_length(other_text) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.order_usage is
  'What a customer said they will use VPV for, asked on the page after payment. One row per paid order.';
comment on column public.order_usage.uses is
  'Option ids from lib/purchaseUsage.ts (exhibitions, followup, distributors, qr, oem, website, other).';

alter table public.order_usage enable row level security;
revoke all on public.order_usage from anon, authenticated;
