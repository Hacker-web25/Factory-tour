# VPV payments — set-up, test and go-live guide

Everything runs from **one app on myvpv.com** (policy pages, checkout,
webhook, dashboards). There is nothing to upload anywhere else.

Work in this order. Steps 1 to 5 are TEST mode: no KYC, no real money.

**The commercial rules built in**

| | |
|---|---|
| Basic licence | one-time, 2–20 scenes, price per scene falls as scenes rise |
| Annual hosting & support | **₹9,999 / year** (GST inclusive). **The first year is free.** |
| After the support year ends | day 0–7: a renewal pop-up on **every click** · day 7: the workspace **locks** (editor and public tours) until renewed · renewing unlocks instantly · nothing is deleted |
| Pro / Ultra | not self-serve; created by you in `/admin/customers` |

---

## 1. Database

Supabase → SQL editor. Run these **in this order** (every file is safe to re-run):

1. `supabase/billing.sql`
2. `supabase/billing_hardening.sql`  ← the exactly-once payments, refunds,
   credit notes, lock-out and tamper-proof ledger. **Re-run it every time it changes.**
3. `supabase/rate_limits_and_audit.sql` (only if you have never run it; the
   payment routes still rate-limit in memory without it)

Check:

```sql
select public.vpv_support_nag_days();                              -- 7
select count(*) from public.billing_orders;                        -- 0 is fine; an error means billing.sql was not run
select proname from pg_proc where proname = 'admin_billing_health'; -- one row = hardening is applied
```

**Look at who can edit `profiles` and `organizations`** (one-minute safety check).
A customer must never be able to change their own `role`, `org_id` or plan from
the browser. Run this and read the result:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'organizations')
order by tablename, cmd;
```

If any `UPDATE` policy on `profiles` lets a user update **any column** of their
own row, ask me to add a column guard. (`organizations` is already protected
by a trigger in `billing_hardening.sql`.)

## 2. Razorpay: test keys and webhook

Razorpay dashboard → switch **Test Mode ON** (toggle at the top) first.

1. **API keys:** Account & Settings → API Keys → *Generate Test Key*.
   You get a **Key Id** (`rzp_test_…`) and a **Key Secret** (shown once —
   save it in a password manager).
2. **Webhook:** Account & Settings → Webhooks → *Add New Webhook*
   - URL: `https://myvpv.com/api/billing/webhook`
   - Secret: **at least 20 characters**. Make one in a terminal:
     `openssl rand -hex 24` (48 characters). You will paste the *same*
     string into Vercel in step 3.
   - Active events — tick all of these:
     `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`,
     `refund.created`, `refund.processed`, `refund.failed`,
     `payment.dispute.created`, `payment.dispute.won`, `payment.dispute.lost`,
     `payment.dispute.closed`
   (Test mode and Live mode have **separate** keys and **separate**
   webhooks. You repeat this in Live mode at go-live.)
3. **Payment methods:** Account & Settings → Payment Methods → make sure
   Cards, UPI, Netbanking and Wallets are switched on.

## 3. Vercel environment variables

Project → Settings → Environment Variables → add each for **Production**
(and Preview if you test there with *test* keys). **Redeploy afterwards** —
Vercel only applies new variables to new deployments.

### The error you saw, and why

Vercel does not allow a variable whose name starts with `NEXT_PUBLIC_` to be
marked *Sensitive*, because `NEXT_PUBLIC_` means "copy this into the
browser", so it cannot be secret. Typing it as a secret is what was rejected.

**You do not need that variable.** The server reads `RAZORPAY_KEY_ID` (no
`NEXT_PUBLIC_`), and hands the key id to the browser itself when checkout
opens. So use `RAZORPAY_KEY_ID` and mark it Sensitive.

The webhook secret check is a different message: the app now refuses any
webhook secret shorter than 20 characters. A 6–10 character word would also
be easy to guess. Use the 48-character one from step 2.

| Name | Value | Sensitive? |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_…` | yes |
| `RAZORPAY_KEY_SECRET` | the Key Secret (≥ 16 characters) | yes |
| `RAZORPAY_WEBHOOK_SECRET` | the 48-character string from step 2 — **identical** in Razorpay | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | yes |
| `CRON_SECRET` | another random string, ≥ 16 characters (`openssl rand -hex 24`). Vercel sends it automatically to the daily checker. | yes |
| `RESEND_API_KEY` | from Resend (step 4) | yes |
| `RESEND_FROM` | `VPV <billing@myvpv.com>` | no |

Do **not** create `NEXT_PUBLIC_RAZORPAY_KEY_ID`. If it is already there, delete it.

Safety nets built into the code:
- A `rzp_live_` key is **refused outside the Production deployment**, so a
  Preview deploy or a laptop can never take real money by mistake.
- No webhook secret (or a short one) → every webhook is refused with 503
  instead of being trusted.
- No `CRON_SECRET` → the daily checker refuses to run (never "open by default").
- Missing keys make checkout say "payment is not available". Nothing breaks.

The daily checker (`/api/billing/reconcile`, 03:30 UTC) is in `vercel.json`.
Vercel's free Hobby plan allows one run a day, which is what is configured.

## 4. E-mail (Resend)

The welcome e-mail carries the new customer's first password; invoices,
credit notes and renewal reminders also go by e-mail.

1. resend.com → Domains → Add `myvpv.com`.
2. Resend shows DNS records (SPF, DKIM, MX for `send`). Add them in
   **Vercel → Domains → myvpv.com → DNS Records**.
3. When Resend says *Verified*, create an API key and add it in step 3.

Until it is verified, a test buyer can still sign in with **Forgot
password** on the login page.

## 5. Test script (Razorpay test mode)

Open `https://myvpv.com/get-started`, pick 2 scenes, use your own e-mail
(Gmail `you+test1@gmail.com` aliases are fine, one per test).

| Test | Details | Expected |
|---|---|---|
| Card (Visa) | `4100 2800 0000 1007`, any future expiry, any CVV | success page, workspace created |
| Card (Mastercard) | `5500 6700 0000 1002` | success |
| Card (RuPay) | `6527 6589 0000 1005` | success |
| International card | `5555 5555 5555 4444` | success |
| UPI success | VPA `success@razorpay` | success |
| UPI failure | VPA `failure@razorpay` | "payment did not go through", retry offered |
| Netbanking / Wallet | pick any bank/wallet, click **Success** or **Failure** | success / failure |
| Close the window | dismiss checkout | back to the form, no workspace |

### The "only charged once" drills

| Do this | Must happen |
|---|---|
| Click **Pay** twice, fast | one order, one Razorpay checkout |
| Pay, then immediately close the tab | workspace still appears (webhook / daily check finishes it); one e-mail each |
| Open checkout in two tabs and pay both | second payment is **refunded automatically**; one workspace |
| Change the scene slider after opening checkout | a new order replaces the old one |
| Refund the payment in the Razorpay dashboard | workspace is cancelled, credit note e-mailed, `/admin/payments` shows the refund |
| Kill your network after paying | `/admin/payments` → *Check Razorpay* completes it |

After each success check:
- `/admin/customers` shows the organisation (its `<slug>.myvpv.com` works)
- the welcome and invoice e-mails arrived (invoice numbers say `TEST/…` in test mode)
- `/admin/payments` says **All clear**
- Razorpay → Webhooks → delivery log shows `200`

### The support lapse, on demand

Use a test workspace's slug. In the SQL editor:

```sql
-- Day 2 past the support year  → pop-up on every click
update public.organizations set support_until = now() - interval '2 days'  where slug = 'your-test-slug';
-- Day 9 past                   → LOCKED (editor + public tours)
update public.organizations set support_until = now() - interval '9 days'  where slug = 'your-test-slug';
-- Back to normal (or pay ₹9,999 in /billing: it unlocks by itself)
update public.organizations set support_until = now() + interval '200 days' where slug = 'your-test-slug';
```

(Editing `plan_status` or the plan columns from the browser is blocked; the SQL
editor and the server can.)

## 6. Automated tests (run before every deploy that touches payments)

About 317 checks run the **real database migrations** in an in-memory
Postgres against a fake Razorpay: double clicks, races, lost webhooks,
partial failures, refunds, chargebacks, forged and replayed requests, GST,
the lock-out, the owner tools, and every finding of an independent
review (late money, out-of-order refunds, lost webhooks, two tabs, set-up
mistakes).

```bash
npm i --no-save tsx @electric-sql/pglite     # once; does not touch package.json
npm run test:billing                          # ~1–2 minutes
```

Every suite must say `pass` and `fail 0`. If one fails, do not deploy.

## 7. Before going live

0. Open **`/admin/payments`** and read the **set-up check** at the top. It must
   say *"Live payments — set-up is complete"*. In live mode, checkout
   **refuses to open** while anything it lists is missing (e-mail provider,
   webhook secret, cron secret, service key), so a customer can never pay for
   something we could not deliver. In test mode it only warns — and it warns
   loudly if **test keys are active on the production site**, because anyone
   can then "buy" a real workspace with a test card. Switch to live keys
   before you announce the site.

1. Complete Razorpay KYC / activation (website `https://myvpv.com`).
2. Put your support phone number in `lib/company.ts` (`COMPANY.phone`) —
   Razorpay checks it and invoices carry it.
3. Razorpay Live Mode → generate **live** keys; create the **live** webhook
   (same URL and events, **new** secret).
4. In Vercel (Production only) replace `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
   and `RAZORPAY_WEBHOOK_SECRET` with the live values; redeploy.
5. Razorpay → Settings: keep only the payment methods you want, keep
   international cards off unless you sell abroad, and switch on e-mail alerts
   for disputes.
6. Make one real payment to yourself for the smallest pack, then refund it
   from the Razorpay dashboard and confirm the credit note arrives.
7. Have your CA confirm the SAC code (`998434`, in `lib/pricing.ts`) and the
   GST treatment, and whether you want PDF invoices.

Test data does **not** have to be deleted: test invoices use their own
`TEST/…` number series, so live invoices start at `VPV/2026-27/0001`. Tax
records are tamper-proof (they cannot be edited or deleted, even by the app).
If you really want a clean slate, do it deliberately in the SQL editor:

```sql
begin;
set local vpv.allow_billing_delete = 'on';
delete from public.billing_orders where livemode = false;   -- test orders and what hangs off them
delete from public.billing_invoice_counters where fy like 'TEST %';
commit;
```

Then delete the test organisations and their users from `/admin/customers` or Supabase.

---

## How the money flows

```
Customer picks 7 scenes on the slider
        │
        ▼
POST /api/billing/order     ← server prices it from lib/pricing.ts (browser never sends an amount).
        │                     One open order per buyer: a double click returns the SAME order.
        ▼
Razorpay hosted checkout    ← card / UPI details never touch our servers
        │
        ├──► browser callback ──► POST /api/billing/confirm   (fast success page)
        │                         verifies the signature, then re-reads the payment from Razorpay
        │
        └──► Razorpay server ──►  POST /api/billing/webhook   (source of truth)
                                  verifies the signature on the raw body
                                  records each event once; failed events are retried
                                          │
        both paths, and the daily checker, end in ONE function:
                                          ▼
                       billing_record_payment   exact amount + currency + status "captured";
                                                a second capture on a paid order is auto-refunded
                                          ▼
                       billing_claim_fulfilment only one worker builds at a time
                                          ▼
                       organisation + <slug>.myvpv.com + admin login + quota + free year
                       GST invoice (gap-free number, same transaction)
                       welcome + invoice e-mails (each sent once)
```

Anything that goes wrong part-way is repaired by the next run: the status
page, the webhook retry, or the daily check. The daily check does not only
look at orders we know about: it also reads **Razorpay's own list of payments
and refunds** and compares it with our books, so money cannot hide behind a
cancelled order, a pile of abandoned checkouts, or a refund made by hand in the
Razorpay dashboard whose webhook never arrived. An order that used up its
automatic retries during an outage gets a fresh set after six quiet hours. If it still cannot finish, it
appears on `/admin/payments` with a **Retry setup** button, and you are e-mailed.

## What protects the money

| Threat | Defence |
|---|---|
| Customer double-clicks / refreshes / two tabs | one open order per buyer; duplicate captures refunded once (idempotent key); **one workspace per buyer** — a second paid order from the same buyer is refunded, never built |
| Money that arrives late or out of order | a payment captured after the order was refunded is refunded too; a refund that arrives before its payment is looked up at Razorpay (or retried) instead of dropped; a replayed event cannot un-refund a payment; a refund of an auto-refunded duplicate never counts against the real purchase |
| Forged webhook or fake "success" callback | HMAC on raw body / order+payment; payment re-read from Razorpay; strong webhook secret required |
| Tampered price | price computed on the server; exact amount + currency must match; mismatch is flagged, never fulfilled |
| Replayed event | event ledger; every step idempotent |
| Webhook lost / server crash mid-build | resumable build, claim expires after 3 min, daily Razorpay reconciliation |
| Refund / chargeback | workspace and scenes revoked, credit note issued (cannot exceed the invoice), build stopped if it was in progress |
| Fake accounts / card testing | rate limits that fail closed, disposable-email block, GSTIN checksum, one open order per buyer, no moving an existing login into a new workspace |
| Tampering with records | invoices, credit notes and payments cannot be edited or deleted; plan columns cannot be changed from the browser |
| Skipping the lock from the browser | the database itself hides scenes and refuses edits for a locked workspace |
| Live keys used by accident | refused outside Production |
| Going live half-configured | live checkout stays closed until the set-up check passes |
| Passwords in shared inboxes | the e-mail with a customer's first password goes to the customer only (no BCC) |
| Someone burning our rate limits | limiter keys are secret-keyed, so the public API key cannot spend them; malformed requests do not use up the shop-wide allowance; `name+tag@` and Gmail dot tricks share one allowance |

## Day to day

- **`/admin/payments`** — paid-but-not-set-up customers, orders needing a
  decision, open alerts, failed webhooks, refunds. Buttons: *Retry setup*,
  *Check Razorpay*, *Clear flag*, *Mark resolved*. Every press is logged.
  A red number on the Admin home shows when something needs you.
- **`/admin/customers`** — every customer, plan, scenes, support badge
  (Active · Reminding · Locked). *Change plan* and *New customer* (Pro/Ultra).
  When you create a customer by hand, pick their **state** — it decides
  CGST+SGST versus IGST on their invoices. If you leave it blank they are
  asked once, at their first top-up or renewal, and it is remembered.
- **`/billing`** — what customers see: plan, support, invoices, renew,
  buy more scenes.

## Things to know

- Invoices are e-mails, not PDFs (number, taxable value, GST, total).
- UPI usually caps one payment at ₹1,00,000; the largest Basic pack is below that.
- A Basic customer's scenes are capped by their quota in the app and for locked
  workspaces in the database; Pro/Ultra are unlimited by design.
- Changing the Terms for existing customers needs 14 days' e-mail notice
  (the Terms promise it) — do this before switching the lock on for anyone who
  bought under the old text.

## Known limits — decide these before or soon after launch

None of these can lose a payment, but you should know about them:

- **Test keys on production** let anyone "buy" for free with a test card. The
  set-up check warns; the fix is switching to live keys.
- **Public image/audio storage.** Uploaded tour media lives in a public bucket;
  a locked workspace's media files are still readable by anyone who has the exact
  link. Move to signed URLs if that matters to you.
- **Other SQL files** (not the payment ones) expose a few functions to the
  public key: `log_security_event`, `rls_review`, `record_login_attempt` /
  `check_login_rate_limit` (someone could lock a known e-mail out of sign-in
  attempts). Review those when you next touch login security.
- **Profiles and invites.** Invite redemption and profile creation happen from
  the browser. If your `profiles` table policies are not strict, a user could
  edit their own role. Run the diagnostic query in section 1 and tighten, or
  move invite redemption to a server route.
- **A very large distributed flood** can still use up the shop-wide hourly
  allowance (`BILLING_GLOBAL_ORDERS_PER_HOUR`, default 200) and stop *new*
  checkouts for up to an hour. Existing customers and paid orders are
  unaffected. A bot-challenge (Cloudflare Turnstile) on the checkout form is the
  next step if this ever happens.
- Organisation admins can edit their own organisation's billing e-mail and
  name from the browser; invoices already issued are never changed.
- The hand-made customer screen shows the first password once, in the browser.
- Invoices are e-mails, not PDFs; have your CA confirm the SAC code and GST
  treatment.
- Vercel's Hobby plan runs a cron job at most once a day. That is enough for
  the daily check, but a Pro plan allows an hourly one.

## Changing a price later

Edit `lib/pricing.ts` and redeploy. E-mail existing customers at least 30
days before it applies to them, as the Terms promise.
