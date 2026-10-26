-- supabase/invoice_lines.sql — the itemised rows a tax invoice prints.
--
-- Run this once in the Supabase SQL editor. Safe to run twice.
--
-- WHY: until now an invoice carried one line of prose ("VPV Authority —
-- 8 areas, 3 process videos, …"). A buyer's accountant cannot work with
-- that: they need to see the plan, the extras, the discount and the
-- travel as separate rows, with the discount visible, because under GST
-- a discount is only outside the taxable value when the invoice shows it.
--
-- The rows are written when the ORDER is created, from the same quote
-- the customer approved and the same quote the card was charged from,
-- and are never updated afterwards. The invoice reads them back when it
-- is printed. An order created before this column existed simply has
-- none, and prints as the single line it always did.

alter table public.billing_orders
  add column if not exists line_items jsonb;

comment on column public.billing_orders.line_items is
  'Printed rows of the tax invoice, frozen at order time: [{title, detail, qty, unitInr, amountInr}]. Null for orders taken before October 2026.';
