# VPV payments — set-up and test guide

Everything runs from **one app on myvpv.com** (policy pages, checkout,
webhook, dashboards). There is nothing to upload anywhere else.

Work in this order. Steps 1 to 4 are TEST mode: no KYC, no real money.

---

## 1. Database

Supabase → SQL editor → paste all of `supabase/billing.sql` → Run (safe to
re-run). Check:

```sql
select count(*) from public.billing_orders;      -- 0 is fine; an error means it was not run
select slug, plan, scene_quota, support_until from public.organizations;
```

## 2. Razorpay: test keys and webhook

Razorpay dashboard → switch **Test Mode ON** (toggle at the top) first.

1. **API keys:** Account & Settings → API Keys → *Generate Test Key*.
   You get a **Key Id** (`rzp_test_…`) and a **Key Secret** (shown once —
   save it in a password manager).
2. **Webhook:** Account & Settings → Webhooks → *Add New Webhook*
   - URL: `https://myvpv.com/api/billing/webhook`
   - Secret: invent a long random string (30+ characters). You will paste
     the same string into Vercel in step 3.
   - Active events: `payment.captured`, `payment.failed`, `order.paid`,
     `refund.processed`
   (Test mode and Live mode have **separate** keys and **separate**
   webhooks. You will repeat this in Live mode at go-live.)
3. **Payment methods:** Account & Settings → Payment Methods → make sure
   Cards, UPI, Netbanking and Wallets are switched on.

## 3. Vercel environment variables

Project → Settings → Environment Variables (Production). Mark every one
*Sensitive* except the first. Redeploy afterwards.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_test_…` (public by design) |
| `RAZORPAY_KEY_SECRET` | the Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | the webhook secret from step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `RESEND_API_KEY` | from Resend (step 4) |
| `RESEND_FROM` | `VPV <billing@myvpv.com>` |

Missing Razorpay or Supabase keys make the checkout say "payment is not
available". Nothing breaks.

## 4. E-mail (Resend)

The welcome e-mail carries the new customer's first password, and the
invoice goes by e-mail too.

1. resend.com → Domains → Add `myvpv.com`.
2. Resend shows DNS records (SPF, DKIM, MX for `send`). Add them in
   **Vercel → Domains → myvpv.com → DNS Records** (your nameservers are
   Vercel's, so records go there).
3. When Resend says *Verified*, create an API key and add it in step 3.

Until it is verified, a test buyer can still sign in with **Forgot
password** on the login page.

## 5. Test script (Razorpay test mode)

Open `https://myvpv.com/get-started`, pick 2 scenes, use your own e-mail
(Gmail `you+test1@gmail.com` style aliases are fine, one per test).

| Test | Details | Expected |
|---|---|---|
| Card (Visa) | `4100 2800 0000 1007`, any future expiry, any CVV | success page, workspace created |
| Card (Mastercard) | `5500 6700 0000 1002` | success |
| Card (RuPay) | `6527 6589 0000 1005` | success |
| International card | `5555 5555 5555 4444` | success |
| UPI success | VPA `success@razorpay` | success |
| UPI failure | VPA `failure@razorpay` | "payment did not go through", retry offered |
| Netbanking / Wallet | pick any bank/wallet, click **Success** or **Failure** on the mock page | success / failure |
| Close the window | dismiss checkout | back to the form, no workspace |

After each success check:
- `/admin/customers` shows the new organisation (and its `<slug>.myvpv.com` address works)
- the welcome and invoice e-mails arrived
- Supabase → Table editor → `billing_webhook_events` has the events with no `error`
- Razorpay → Webhooks → delivery log shows `200`

## 6. Before going live

Test purchases create real rows in the same database and use up invoice
numbers. Before the first real sale:

```sql
delete from public.billing_orders;            -- cascades payments and invoices
delete from public.billing_webhook_events;
delete from public.plan_events;
update public.billing_invoice_counters set last_number = 0;
```

Then delete the test organisations (Admin → Customers or Supabase) and
their auth users, and:

1. Complete Razorpay KYC / activation (website `https://myvpv.com`).
2. Live Mode → generate **live** keys, create the **live** webhook (same URL
   and events, new secret).
3. Replace the three Razorpay variables in Vercel with the live values;
   redeploy.
4. Make one real payment to yourself for the smallest pack and refund it
   from the Razorpay dashboard.

---

## How the money flows

```
Customer picks 7 scenes on the slider
        │
        ▼
POST /api/billing/order          ← the server prices it from lib/pricing.ts.
        │                          The browser never sends an amount.
        ▼
Razorpay hosted checkout         ← card / UPI details never touch our servers
        │
        ├──► browser callback ──► POST /api/billing/confirm   (fast success page)
        │                         verifies HMAC signature
        │
        └──► Razorpay server ──►  POST /api/billing/webhook   ← SOURCE OF TRUTH
                                  verifies HMAC signature
                                  refuses a replayed event
                                  refuses an amount that does not match
                                          │
                                          ▼
                                  creates the organisation + <slug>.myvpv.com
                                  creates the admin login
                                  sets scene quota = 7
                                  sets support_until = today + 1 year (FREE)
                                  issues GST invoice VPV/2026-27/0001
                                  e-mails welcome + invoice
```

Both paths end in the same function, and it refuses to run twice. If the
customer closes the tab the instant they pay, the webhook still does
everything.

---

## Day to day

- **`/admin/customers`** — every customer, plan, scene count and support
  badge. *Change plan* (Pro/Ultra after a bank transfer, scene count,
  support) and *New customer* (creates organisation, subdomain and login;
  the password is shown once).
- **`/billing`** — what customers see: plan, support expiry, invoices,
  buttons to renew support or buy more scenes.

## Things to watch

- Support-renewal reminders are not automatic yet; `/admin/customers`
  shows who is due within 30 days.
- Invoices are e-mails, not PDFs. They carry invoice number, taxable
  value, GST and total.
- Confirm the SAC code (`998434` in `lib/pricing.ts`) with your CA.
- UPI usually caps one payment at ₹1,00,000; the largest Basic pack is
  below that.

## Changing a price later

Edit `lib/pricing.ts` and redeploy. E-mail existing customers at least 30
days before it applies to them, as the Terms promise.
