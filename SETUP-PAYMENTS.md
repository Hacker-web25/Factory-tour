# VPV payments — everything you need to switch this on

Work through this in order. Nothing in it is reversible-by-accident, and
steps 1 to 4 can all be done before you have Razorpay approval.

---

## 1. Put the files in your project

Extract `vpv-payments.zip` into
`C:\Users\Aryan\OneDrive\Desktop\Kuula 360 copy -- mamu\Kuula Copy`
and let it overwrite. Pause OneDrive first, as always.

Then commit and push:

```
git add -A
git status            # check no .env.local and no node_modules
git commit -m "Add Razorpay payments, scene-based Basic plan, admin customer control"
git push origin main
```

---

## 2. Run the database migration

Supabase → SQL editor → paste the whole of `supabase/billing.sql` → Run.
It is safe to re-run. It creates the orders, payments, invoices,
webhook-events, plan-events and enquiries tables, adds `scene_quota` and
`support_until` to organisations, and installs the owner-only functions
behind the admin screen.

Check it worked:

```sql
select slug, plan, scene_quota, support_until from public.organizations;
```

Your existing customers keep exactly the scene count they have today.

---

## 3. Add the environment variables in Vercel

Settings → Environment Variables. Mark every one of these **Sensitive**
except the first.

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_test_…` | Public by design. Swap to `rzp_live_…` at go-live. |
| `RAZORPAY_KEY_SECRET` | from Razorpay | **Never** prefix with NEXT_PUBLIC. |
| `RAZORPAY_WEBHOOK_SECRET` | you choose it | Any long random string. You type the same one into Razorpay in step 5. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | This key can do anything. Sensitive, server-only. |
| `RESEND_API_KEY` | from Resend | Sends the welcome e-mail and the invoice. |
| `RESEND_FROM` | `VPV <billing@myvpv.com>` | The domain must be verified in Resend. |

Redeploy after adding them.

**If `SUPABASE_SERVICE_ROLE_KEY` or the Razorpay keys are missing, the
checkout politely says payment is not available.** Nothing breaks.

---

## 4. Fill in your company details

Open `lib/company.ts` and complete the fields marked `◀ REQUIRED`:

- `entityType` — proprietorship, partnership, LLP or private limited
- `addressLines` — as on your GST certificate
- `gstin` — 15 characters
- `state` — **this one decides CGST+SGST vs IGST on every invoice**
- `phone`
- `grievanceOfficer.name`

Also create `support@myvpv.com` and `billing@myvpv.com` (forwarding
aliases are fine).

---

## 5. Set up Razorpay

**KYC first.** Submit `https://myvpv.com` as your website. The policy
pages must be live there before you submit — see step 6.

Once approved:

1. Razorpay dashboard → Settings → **Webhooks** → Add New Webhook
   - URL: `https://myvpv.com/api/billing/webhook`
   - Secret: the same string you put in `RAZORPAY_WEBHOOK_SECRET`
   - Active events: `payment.captured`, `payment.failed`, `order.paid`,
     `refund.processed`
2. Settings → Configuration → turn **on** the payment methods you want
   (UPI, cards, net banking).

### Test it before going live

With the `rzp_test_` keys in place, open
`https://myvpv.com/get-started` and buy 2 scenes using Razorpay's
test card `4111 1111 1111 1111`, any future expiry, any CVV. You should
get: a new organisation, a welcome e-mail with a password, an invoice
e-mail, and a row in `/admin/customers`.

Then swap the live keys in and repeat once with a real ₹9,000 payment to
yourself. Refund it from the Razorpay dashboard afterwards.

---

## 6. Put the policy pages on myvpv.com (BigRock)

Unchanged from before, but the files are newer — they now carry the
three-plan pricing.

1. BigRock → cPanel → File Manager → `public_html`
2. Upload `bigrock-upload.zip`, right-click → Extract
3. Check `https://myvpv.com/pricing` and `https://myvpv.com/terms`
4. Paste `footer-snippet.html` into `public_html/index.html`, just
   before `</body>`

The static copies carry no JavaScript, so the scene slider cannot move
there — the full price ladder is shown as a table instead, and
"Get started" links to `myvpv.com` where the live calculator runs.

---

## How the money flows, once it is on

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
                                  creates the organisation + subdomain
                                  creates the admin login
                                  sets scene quota = 7
                                  sets support_until = today + 1 year  (FREE)
                                  issues GST invoice VPV/2026-27/0001
                                  e-mails welcome + invoice
```

Both paths end in the same function, and it refuses to run twice. If the
customer closes the tab the instant they pay, the webhook still does
everything.

---

## Your day-to-day

**`/admin/customers`** — every customer, their plan, their scene count,
and a support badge that is green, amber or red. Search by company or
e-mail. Two buttons:

- **Change plan** — switch someone to Pro or Ultra after they pay you by
  bank transfer, set their scene count, extend support. Every change is
  written to `plan_events` with your name on it.
- **New customer** — creates the organisation, the subdomain and the
  login, and e-mails them the details. The password is shown once on
  screen so you can read it out. This replaces your SQL.

**`/billing`** — what your customers see: their plan, their support
expiry, their invoices, and buttons to renew support or buy more scenes.

---

## Things to watch

- **Support renewal reminders are not automatic yet.** The dates are all
  tracked and `/admin/customers` shows who is due within 30 days. Sort by
  that column once a week, or ask me to add the scheduled job.
- **Invoices are e-mails, not PDFs.** They carry the invoice number,
  taxable value, GST and total, which is what the law needs. If your CA
  wants a PDF attachment, say so and I will add it.
- **Check the SAC code** (`998434` in `lib/pricing.ts`) with your CA
  before the first live invoice.
- **UPI usually caps one payment at ₹1,00,000.** Your largest Basic pack
  is ₹54,995, so this never bites — but Pro and Ultra annual payments
  would, which is another reason they go by bank transfer.

---

## Changing a price later

Everything is in `lib/pricing.ts`. Change the number, redeploy, re-run
the static export, re-upload to BigRock. Then e-mail existing customers
at least 30 days before it applies to them — that is what your Terms
promise, and it is the clause Razorpay will read.
