# VPV — payments, invoices and refunds: the operating guide
Updated 24 Oct 2026. For whoever answers support@myvpv.com.

## 1. What a customer gets after they pay (automatic, nothing for you to do)

| When | What | Where it comes from |
|---|---|---|
| Instantly | Razorpay's own payment screen, then the VPV "payment received" page that waits until the workspace is ready (a few seconds) | Razorpay + VPV |
| Within a minute | **Welcome e-mail**: workspace address, e-mail, first password | VPV |
| Within a minute | **Tax invoice e-mail** (copy BCC'd to support@myvpv.com): invoice no. `VPV/2026-27/0001`, date, your name, address and GSTIN, their name/address/GSTIN, place of supply, SAC 998434, taxable value, CGST + SGST (Haryana buyer) or IGST (anyone else), total, Razorpay payment reference, how they paid | VPV |
| Any time | The invoice list on their **/billing** page | VPV |

Invoices are e-mails, not PDF files. A customer who needs a PDF uses Print → Save as PDF from their mail program. If a buyer's procurement team insists on an attached PDF, tell me and I will add it.

If either e-mail does not arrive, the nightly check re-sends it; you never need to rebuild the workspace by hand.

## 2. A customer asks for a refund — step by step

**Rule from the Refund Policy:** payments are non-refundable by default. Always refunded in full: duplicate charges, excess charges, and payments taken for an order that was never confirmed. Anything else (outage, data loss, a described feature that does not work) is at our discretion. We reply within 2 business days.

1. **Check who is asking.** The e-mail must come from the account address or the billing contact on the invoice. If it does not, ask them to write from the right address. Never refund to a different account or by bank transfer.
2. **Find the payment.** Razorpay Dashboard → **Transactions → Payments**, search by the customer's e-mail, the payment id (`pay_…`, printed on their invoice) or the invoice number. Also open **myvpv.com/admin/payments** and check the order is *paid/ready* there.
3. **Decide** using section 1 of the Refund Policy. Reply to the customer (templates in section 6) *before* you press refund, so they are not surprised.
4. **Refund it in Razorpay, not anywhere else.** Open the payment → **Refund** → choose **full** or **partial** amount → add a short note with the reason → choose the speed:
   - **Normal**: free, reaches the customer in 5 to 7 business days.
   - **Instant** ("Refund Instantly"): tries to send by IMPS/NEFT/UPI so it arrives right away; if that fails Razorpay falls back to Normal. Check the dashboard for any fee before using it.
   - A refund **cannot be cancelled** once issued. Do not press the button twice.
5. **Leave the rest to the system.** Within about a minute, with nothing for you to click:
   - the order becomes *refunded* (or *partially refunded*);
   - a **full** refund closes the workspace (purchased scenes or support year are taken back; nothing is deleted), a **partial** refund changes nothing in the workspace;
   - a **credit note** is issued (`VPV/CN/2026-27/0001`) against the original invoice;
   - the customer receives the **refund e-mail** with the credit note, the Razorpay refund reference (`rfnd_…`) and the 5-7 day timeline; you get the BCC and an info alert;
   - the refund shows under **/admin/payments → Recent refunds**.
6. **Confirm it worked (30 seconds).** In /admin/payments → Recent refunds, the refund shows **processed**, and the refund e-mail is in the support inbox (BCC). If the refund shows **created** (pending) for more than a few hours, see section 3.

### What a refund costs you
- Razorpay **does not return the fee it charged on the original payment**. A refund is therefore a real cost to VPV: the fee plus the GST on it. Weigh this when deciding on goodwill refunds.
- The credit note reduces the GST you owe for that month. Tell your CA to report credit notes in the same month's GST return; the credit notes are listed in the database table `billing_credit_notes`.

### Razorpay balance
A refund is paid out of your Razorpay balance. If the balance is lower than the refund, Razorpay will not let it go through until more payments arrive. When money has already been settled to your bank, check the dashboard balance **before** promising a date; if it is too low, ask Razorpay support how to fund it. I could not confirm from Razorpay's public documents whether a top-up is possible, so ask them first.

## 3. How we make sure the money is not stuck

| Stage | Where you can see it | What to do |
|---|---|---|
| Refund created (**pending**) | Razorpay → Transactions → Refunds shows *Pending*; VPV shows *created* | Nothing: banks take 5 to 7 business days |
| Refund **processed** | Razorpay: *Processed*. VPV: credit note issued, customer e-mailed | Nothing |
| Refund **failed** | You get a critical e-mail "refund_failed" | Open the refund in Razorpay, read the reason (usually a closed card or bank account), contact the customer for another route |
| Pending for **10 days** | You get a critical e-mail "refund_stuck" with the refund id | Raise it with Razorpay support quoting the `rfnd_…` id; tell the customer |

Every night (03:30 UTC) VPV asks Razorpay about every refund still pending, so a lost notification can never leave an order half-finished.

**If the customer says "I never got my money":**
1. Check the refund in Razorpay is *Processed*. If *Pending*, wait until 7 business days after the date on the refund e-mail.
2. If *Processed* and 7 business days have passed: ask the customer to take the **refund reference (`rfnd_…`) and Razorpay's name** to their bank and ask them to look for an incoming credit. Cards and some banks list it as "refund" with the merchant name; UPI refunds return to the same UPI account.
3. Still missing: open a ticket with Razorpay support with the payment id and refund id and ask for the **ARN** (acquirer reference number) for card refunds. Give the ARN to the customer's bank.
4. Reply to the customer at each step. The nightly alerts mean you will usually know before they write.

## 4. Other money situations
- **Duplicate payment** (customer paid twice): the system refunds the second one automatically and flags it. You do not need to do anything; the customer gets one invoice.
- **Chargeback / dispute** (the bank takes the money back): you get a critical e-mail. Respond in Razorpay before the deadline. If we lose, VPV treats it exactly like a full refund (workspace closed, credit note).
- **Refund bigger than the order**: critical e-mail "refund_exceeds_order": check Razorpay, the customer may have been refunded twice.
- **Refund made by hand elsewhere** (bank transfer outside Razorpay): the system cannot see it and issues no credit note. Always use the Razorpay refund button.

## 5. Before you announce
One live end-to-end test: buy the cheapest plan to yourself (Gurugram), read the invoice, refund it from Razorpay, and confirm (a) the refund e-mail with the credit note arrives, (b) /admin/payments shows *processed*, (c) the money returns to your card/UPI within 7 business days. Put the **support phone** in `lib/company.ts` first; Razorpay asks for it and invoices should carry it.

## 6. Reply templates
**Received (send first):** "Thank you for writing. I am looking at payment pay_… (invoice VPV/…) now and will confirm within 2 business days."
**Approved:** "We have approved a refund of ₹X for invoice VPV/…. It has been sent through Razorpay to the same card/UPI/bank account you paid with. You will get an e-mail from us with the credit note and a refund reference (rfnd_…). It normally appears within 5 to 7 business days. If it has not after that, reply to this e-mail and we will chase it."
**Declined:** "Thank you for explaining. We have reviewed this against our Refund Policy (link) and cannot refund this payment because …. You can ask for a second review by a senior member of the team by replying to this e-mail. You can stop future renewals at any time; there are no cancellation fees."
