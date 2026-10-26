-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/coupons.sql — coupon codes for the billing page.
--
-- A coupon takes a percentage or a fixed rupee amount off a site plan order
-- (plan, extras, shoot time, sales team; never travel or the support year).
-- The order route looks the code up here and prices the order itself, so a
-- browser can never invent a code or a discount.
--
-- Uses are not stored here: a coupon's use is a PAID order whose notes say
-- "coupon <CODE>", counted by lib/server/coupons.ts. A refunded or abandoned
-- order therefore never uses up a place.
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- TO CREATE A COUPON (examples — change the code and the numbers):
--
--   20% off, for anyone, 10 uses, until the end of the year:
--     insert into public.coupons (code, percent_off, max_uses, expires_at, note)
--     values ('FRIENDS20', 20, 10, '2026-12-31 23:59:59+05:30', 'Friends and family');
--
--   ₹10,000 off, one use only:
--     insert into public.coupons (code, amount_off_inr, max_uses, note)
--     values ('RAHUL10K', 10000, 1, 'Rahul, referred by Anuj');
--
--   Switch a coupon off:
--     update public.coupons set active = false where code = 'FRIENDS20';
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.coupons (
  code            text primary key
                  check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  percent_off     integer check (percent_off between 1 and 100),
  amount_off_inr  integer check (amount_off_inr > 0),
  -- Empty means unlimited.
  max_uses        integer check (max_uses > 0),
  -- Empty means it never expires.
  expires_at      timestamptz,
  active          boolean not null default true,
  -- Who it is for, so you remember later.
  note            text,
  created_at      timestamptz not null default now(),
  -- Exactly one kind of discount.
  constraint coupons_one_discount check ((percent_off is null) <> (amount_off_inr is null))
);

-- Only the server (service role) reads or writes coupons. With RLS on and no
-- policies, the public anon key cannot list them.
alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
