# VPV introduction e-mail (Zoho Campaigns)

Files
- `vpv-intro.html` — the e-mail (table layout, inline styles, 600 px, works on phones). Paste into Zoho Campaigns > Create campaign > Content > "Code your own" (HTML editor).
- `vpv-intro.txt` — the plain-text version. Paste into the campaign's plain-text tab. A real text part lowers the spam score.
- Images live in `public/email/` and are served from `https://myvpv.com/email/…` once this is deployed:
  - `factory-tour-demo.gif` — 3-second 360° pan of the "CNC machining" scene from the public demo tour (rendered from `public/demo/vee-tee/31-4k.webp`, 520 px, ~0.9 MB). It is the in-e-mail demo; it links to the person's own link. Outlook desktop shows the first frame only, which is also a good picture.
  - `vpv-logo.png`, `vpv-clients.jpg`.

Merge tags used (check spelling in the Zoho editor's Merge Tags menu)
- `$[FNAME|there|there]$` first name, falls back to "there".
- `$[UD:VPV_LINK]$` the person's own `myvpv.com/q/EM-…` link (Contact Custom Tags > VPV Link). Used three times: the GIF, the button, the .txt.
- `$[LI:UNSUBLINK]$` unsubscribe (or Footer tags > Unsubscribe).
- Zoho's "Send Test Mail" does NOT fill merge tags (they show as raw text). To test, send the real campaign to a one-person list.

Where the link lands: set "Where the links land" to `/demo` when creating the VPV campaign, so the personal link opens the live demo.

## Not landing in spam: the setup
Found 4 Nov 2026 in the public DNS of myvpv.com (zone is on Vercel DNS): there are Resend records (`resend._domainkey`, `send`, `rsend`) for app e-mail, but **no SPF, no DMARC, no Zoho DKIM and no MX** at the root. Mail from an `@myvpv.com` address through Zoho Campaigns would fail authentication; mail from a Gmail address through Zoho fails Gmail's own sender rules. Both go to spam.

1. Send from an address on myvpv.com (for example `aryan@myvpv.com`), never a gmail.com one. Zoho Campaigns > Settings > Senders & Authentication > Add Sender, click the verification link.
2. Authenticate the domain (Setup next to the domain). Add in Vercel > Domains > myvpv.com > DNS Records:
   - SPF: TXT, name `@`, value `v=spf1 include:zcsend.net ~all` (only one SPF record per name; the Resend ones are on subdomains, no conflict).
   - DKIM: TXT, the name and value Zoho shows (`<number>._domainkey`, value starts `k=rsa; p=`).
   - DMARC: TXT, name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:<your address>` (start with `none`).
   - Custom return path: CNAME, name `zma`, value as shown by Zoho (do this after SPF and DKIM).
   Click Authenticate, wait up to 24 hours.
3. Receive replies: there is no MX record, so nothing can currently be delivered to `@myvpv.com` (including `support@myvpv.com`). Set up a mailbox (Zoho Mail or Google Workspace) and add its MX records. Replies are a strong positive signal.
4. Warm up: first send to ~50–100 of the most engaged contacts, then double every day or two. Do not send the whole 4,742 at once.
5. Clean list: remove bounces and old addresses; send first to people who opened before.
6. Content: one button, real text (not one big image), no all-caps/exclamation marks/"free"/"guaranteed", no link shorteners, links and images on myvpv.com only, a plain-text part, an unsubscribe link, a company address in the footer (Zoho footer tag).
7. Before the real send, send the campaign to https://www.mail-tester.com (a one-address list) and aim for 9/10 or better.
