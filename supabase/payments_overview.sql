-- supabase/payments_overview.sql — one honest picture of the shop.
--
-- Run this once in the Supabase SQL editor. Safe to run twice.
--
-- /admin/payments used to answer one question: "did anything break?".
-- That is the wrong first question. The first questions are: did money
-- come in, is anybody waiting on us, and are the customers we already
-- have actually using the thing? This function answers all of those in
-- a single round trip, in the order a person actually asks them:
--
--   1. money          what came in, this month and in all
--   2. waiting        paid but not set up — somebody is waiting RIGHT NOW
--   3. review         a person has to decide something
--   4. failed         payments that did not go through
--   5. customers      who is set up, and what they do with it
--   6. housekeeping   alerts, webhooks, refunds, invoice numbering
--
-- Test-mode orders are counted separately everywhere, so a dry run can
-- never be mistaken for a sale.

create or replace function public.admin_payments_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_tours boolean := to_regclass('public.tours') is not null;
  v_has_usage boolean := to_regclass('public.order_usage') is not null;
  v_fy        text    := public.vpv_financial_year(now());
  v_customers jsonb;
begin
  if not public.is_platform_owner() then
    raise exception 'Only the platform owner can view payments';
  end if;

  -- Who is set up, and what they have done since. Built with dynamic SQL
  -- only because `tours` and `order_usage` arrive in later migrations: a
  -- database that has not had them yet should still show the rest.
  execute format($q$
    select coalesce(jsonb_agg(x order by x->>'paid_at' desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'order_id',    o.id,
        'company',     o.buyer_company,
        'email',       o.buyer_email,
        'phone',       o.buyer_phone,
        'slug',        g.slug,
        'city',        coalesce(o.buyer_city, ''),
        'amount_paise',o.amount_paise,
        'paid_at',     o.paid_at,
        'livemode',    o.livemode,
        'areas',       g.scene_quota,
        'support_until', g.support_until,
        'tours',       %s,
        'uses',        %s,
        'usage_note',  %s
      ) as x
      from public.billing_orders o
      join public.organizations g on g.id = o.org_id
      where o.provisioned_at is not null
        and o.status = 'paid'
        and o.revoked_at is null
      order by o.paid_at desc
      limit 200) s $q$,
    case when v_has_tours then '(select count(*) from public.tours t where t.org_id = g.id)' else '0' end,
    case when v_has_usage then '(select u.uses from public.order_usage u where u.order_id = o.id)' else 'null' end,
    case when v_has_usage then '(select u.other_text from public.order_usage u where u.order_id = o.id)' else 'null' end
  ) into v_customers;

  return jsonb_build_object(
    'fy', v_fy,

    /* 1 ── money ─────────────────────────────────────────────────── */
    'money', (
      select jsonb_build_object(
        'live_orders',  count(*) filter (where livemode),
        'live_paise',   coalesce(sum(amount_paise) filter (where livemode), 0),
        'month_orders', count(*) filter (where livemode and paid_at >= date_trunc('month', now() at time zone 'Asia/Kolkata')),
        'month_paise',  coalesce(sum(amount_paise) filter (where livemode and paid_at >= date_trunc('month', now() at time zone 'Asia/Kolkata')), 0),
        'test_orders',  count(*) filter (where not livemode)
      )
      from public.billing_orders
      where status = 'paid' and revoked_at is null),

    /* 2-5 ── the four queues, as counts ──────────────────────────── */
    'counts', jsonb_build_object(
      'paid_not_setup', (select count(*) from public.billing_orders where status = 'paid' and provisioned_at is null),
      'needs_review',   (select count(*) from public.billing_orders where review_flag is not null),
      'failed',         (select count(*) from public.billing_orders where status = 'failed' and created_at > now() - interval '30 days'),
      'customers',      (select count(*) from public.billing_orders where provisioned_at is not null and status = 'paid' and revoked_at is null),
      -- Started checkout, never paid. A rising number here is either a
      -- pricing objection or a broken Pay button — both worth knowing.
      'abandoned',      (select count(*) from public.billing_orders
                          where status = 'created' and created_at between now() - interval '30 days' and now() - interval '30 minutes'),
      'open_alerts',    (select count(*) from public.billing_alerts where resolved_at is null),
      'failed_webhooks',(select count(*) from public.billing_webhook_events where error is not null),
      'renewals_60d',   (select count(*) from public.organizations
                          where support_until is not null
                            and support_until between now() and now() + interval '60 days'),
      'usage_unanswered', case when v_has_usage then (
          select count(*) from public.billing_orders o
           where o.provisioned_at is not null and o.status = 'paid' and o.revoked_at is null
             and not exists (select 1 from public.order_usage u where u.order_id = o.id))
        else 0 end
    ),

    /* 4 ── the failed payments themselves ────────────────────────── */
    'failed_payments', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc) from (
        select jsonb_build_object(
          'id', o.id, 'company', o.buyer_company, 'email', o.buyer_email,
          'amount_paise', o.amount_paise, 'created_at', o.created_at,
          'razorpay_order_id', o.razorpay_order_id, 'livemode', o.livemode) as x
        from public.billing_orders o
        where o.status = 'failed' and o.created_at > now() - interval '30 days'
        order by o.created_at desc limit 50) s), '[]'::jsonb),

    /* 5 ── the customers ─────────────────────────────────────────── */
    'customers', v_customers,

    /* 6 ── invoice numbering, for the accountant ─────────────────── */
    'invoices', (
      select jsonb_build_object(
        'fy', v_fy,
        'count', count(*),
        'highest', coalesce(max((regexp_replace(invoice_no, '^.*/', ''))::int), 0))
      from public.billing_invoices where fy = v_fy)
  );
end;
$$;

revoke all on function public.admin_payments_overview() from public, anon;
grant execute on function public.admin_payments_overview() to authenticated;
