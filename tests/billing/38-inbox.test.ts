/**
 * The VPV Inbox: support@myvpv.com as a shared team mailbox.
 *
 * What is pinned here, in the order a customer meets it:
 *   - Mail only enters through a correctly signed webhook, and the same
 *     message delivered twice is stored once.
 *   - A new message becomes a numbered ticket and the sender gets ONE
 *     acknowledgement with the ticket number and a reply time counted in
 *     office hours. Robots never get one (that is how two auto-replies loop),
 *     and there are brakes per sender and per day.
 *   - A reply that carries the [VPV-1001] tag, or answers a known message,
 *     joins its conversation; a stranger quoting the tag does not.
 *   - Only the owner and the people the owner added can read or answer, and
 *     only with a confirmed e-mail; only admins change the auto-reply.
 *   - Staff replies go out from support@myvpv.com with threading headers, a
 *     failed send is kept visible, notes are never e-mailed, and the app
 *     never hands out the raw HTML of mail from the internet.
 */

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

import {
  addWorkingMinutes,
  automatedReason,
  buildAck,
  cleanSubject,
  DEFAULT_OFFICE,
  DEFAULT_SETTINGS,
  etaPhrase,
  htmlToText,
  isOwnAddress,
  parseAddress,
  replySubject,
  splitQuoted,
  ticketFromSubject,
} from "@/lib/inboxMail";
import { verifyWebhook } from "@/lib/server/inboxMailer";
import { makeWorld, type World } from "./harness/world";

/* ───────────────────────── pure rules ───────────────────────── */

describe("reading an address", () => {
  it("takes a plain address, a named one and a quoted-comma one", () => {
    assert.deepEqual(parseAddress("Asha@Acme.in"), { email: "asha@acme.in", name: "" });
    assert.deepEqual(parseAddress("Asha Rao <asha@acme.in>"), { email: "asha@acme.in", name: "Asha Rao" });
    assert.deepEqual(parseAddress('"Rao, Asha" <asha@acme.in>'), { email: "asha@acme.in", name: "Rao, Asha" });
  });
  it("refuses things that are not addresses", () => {
    for (const bad of ["", "nobody", "a@b", "a b@c.com", "<>", 42, null, "x@y.com, z@y.com"]) {
      assert.equal(parseAddress(bad), null, String(bad));
    }
  });
  it("knows our own domain, subdomains included, and not look-alikes", () => {
    assert.equal(isOwnAddress("a@myvpv.com"), true);
    assert.equal(isOwnAddress("a@mail.myvpv.com"), true);
    assert.equal(isOwnAddress("a@notmyvpv.com"), false);
    assert.equal(isOwnAddress("a@myvpv.com.evil.io"), false);
  });
});

describe("ticket numbers in subjects", () => {
  it("finds the tag and ignores anything that is not one", () => {
    assert.equal(ticketFromSubject("Re: Hello [VPV-1042]"), 1042);
    assert.equal(ticketFromSubject("RE: [ vpv-1001 ] pricing"), 1001);
    assert.equal(ticketFromSubject("VPV-1042 without brackets"), null);
    assert.equal(ticketFromSubject("[VPV-12]"), null);
    assert.equal(ticketFromSubject("[VPV-99999999999999999999]"), null);
    assert.equal(ticketFromSubject(null), null);
  });
  it("cleans a subject of Re:/Fwd: chains and our tag, and re-tags a reply", () => {
    assert.equal(cleanSubject("Re: RE: Fwd: Pricing for Basic [VPV-1001]"), "Pricing for Basic");
    assert.equal(cleanSubject("   "), "(no subject)");
    assert.equal(replySubject(1001, "Re: Pricing"), "Re: Pricing [VPV-1001]");
    assert.equal(replySubject(1001, "Re: Pricing [VPV-1001]"), "Re: Pricing [VPV-1001]");
  });
});

describe("is it a robot?", () => {
  const person = { from: "asha@acme.in", subject: "Question", headers: {} };
  it("lets a person through", () => {
    assert.equal(automatedReason(person), null);
    assert.equal(automatedReason({ ...person, headers: { "Auto-Submitted": "no" } }), null);
  });
  it("catches the usual machine signals", () => {
    const cases: [string, Parameters<typeof automatedReason>[0]][] = [
      ["auto-submitted", { ...person, headers: { "Auto-Submitted": "auto-replied" } }],
      ["precedence", { ...person, headers: { Precedence: "bulk" } }],
      ["auto-response-suppress", { ...person, headers: { "X-Auto-Response-Suppress": "All" } }],
      ["mailing-list", { ...person, headers: { "List-Unsubscribe": "<mailto:x@y.z>" } }],
      ["null-sender", { ...person, headers: { "Return-Path": "<>" } }],
      ["system-sender", { ...person, from: "no-reply@bank.com" }],
      ["system-sender", { ...person, from: "mailer-daemon@googlemail.com" }],
      ["auto-subject", { ...person, subject: "Out of office: back Monday" }],
      ["auto-subject", { ...person, subject: "Undeliverable: your message" }],
    ];
    for (const [why, c] of cases) assert.equal(automatedReason(c), why, JSON.stringify(c));
  });
  it("does not mistake a real person with 'info' or 'sales' for a robot", () => {
    assert.equal(automatedReason({ ...person, from: "info@acme.in" }), null);
    assert.equal(automatedReason({ ...person, from: "noreplyfan@acme.in" }), null);
    assert.equal(automatedReason({ ...person, from: "notifier@acme.in" }), null);
  });
});

describe("text from mail", () => {
  it("turns HTML into readable text and drops scripts", () => {
    const t = htmlToText('<style>p{}</style><p>Hello&nbsp;<b>Aryan</b></p><script>alert(1)</script><p>Line&amp;two<br>three</p>');
    assert.equal(t, "Hello Aryan\nLine&two\nthree");
  });
  it("cuts a reply from the old message under it", () => {
    const s = splitQuoted("Thanks, Friday works.\n\nOn Tue, 3 Nov 2026 at 10:00, VPV Support <support@myvpv.com> wrote:\n> Hello\n> there");
    assert.equal(s.fresh, "Thanks, Friday works.");
    assert.match(s.quoted, /^On Tue/);
    assert.deepEqual(splitQuoted("Just one message."), { fresh: "Just one message.", quoted: "" });
  });
});

describe("the reply time is counted in office hours (Mon–Sat 10:00–18:00 IST, 4 h)", () => {
  const ist = (iso: string) => new Date(`${iso}+05:30`);
  const due = (iso: string, minutes = 240) => addWorkingMinutes(ist(iso), minutes, DEFAULT_OFFICE);
  const phrase = (iso: string) => etaPhrase(due(iso), ist(iso));

  it("inside the day: just adds the time", () => {
    assert.equal(phrase("2026-11-03T10:00:00"), "today by 2:00 PM IST");
  });
  it("before opening: counts from opening", () => {
    assert.equal(phrase("2026-11-03T08:00:00"), "today by 2:00 PM IST");
  });
  it("late in the day: the rest rolls into the next morning", () => {
    assert.equal(phrase("2026-11-03T17:00:00"), "tomorrow by 1:00 PM IST");
  });
  it("after closing: starts tomorrow", () => {
    assert.equal(phrase("2026-11-03T20:00:00"), "tomorrow by 2:00 PM IST");
  });
  it("skips Sunday", () => {
    assert.equal(phrase("2026-11-07T17:00:00"), "by Mon 9 Nov, 1:00 PM IST");
  });
  it("never promises a time outside office hours", () => {
    for (const h of [0, 3, 9, 10, 12, 15, 17, 18, 22]) {
      const d = due(`2026-11-04T${String(h).padStart(2, "0")}:07:00`, 90);
      const l = new Date(d.getTime() + 330 * 60_000);
      assert.ok(l.getUTCHours() >= 10 && (l.getUTCHours() < 18 || (l.getUTCHours() === 18 && l.getUTCMinutes() === 0)), `h=${h} -> ${d.toISOString()}`);
    }
  });
});

describe("the acknowledgement text", () => {
  const now = new Date("2026-11-03T04:30:00Z"); // 10:00 IST Tuesday
  const due = addWorkingMinutes(now, 240, DEFAULT_OFFICE);
  it("fills in name, ticket and time, and keeps the ticket in the subject", () => {
    const a = buildAck(DEFAULT_SETTINGS, { name: "Asha Rao", ticketNo: 1001, subject: "Re: Pricing", due, now });
    assert.equal(a.subject, "Re: Pricing [VPV-1001]");
    assert.match(a.text, /^Hello Asha,/);
    assert.match(a.text, /VPV-1001/);
    assert.match(a.text, /today by 2:00 PM IST/);
    assert.match(a.html, /VPV-1001/);
    assert.doesNotMatch(a.text + a.html, /\{(name|ticket|eta)\}/);
  });
  it("says 'there' when it does not know a name, and escapes what a customer wrote", () => {
    const a = buildAck(DEFAULT_SETTINGS, { name: "", ticketNo: 1002, subject: "<script>x</script>", due, now });
    assert.match(a.text, /^Hello there,/);
    assert.doesNotMatch(a.html, /<script>/);
  });
});

/* ───────────────────────── webhook signature ───────────────────────── */

describe("webhook signature", () => {
  const secretBytes = crypto.randomBytes(24);
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const sign = (id: string, ts: string, body: string, key = secretBytes) =>
    "v1," + crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);

  it("accepts the right signature", () => {
    const h = headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": sign("msg_1", ts, "{}") });
    assert.equal(verifyWebhook("{}", h, secret, now), true);
  });
  it("accepts when one of several signatures matches (secret rotation)", () => {
    const h = headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,AAAA ${sign("msg_1", ts, "{}")}` });
    assert.equal(verifyWebhook("{}", h, secret, now), true);
  });
  it("refuses a changed body, a wrong secret, a stale timestamp, missing headers, no secret", () => {
    const good = { "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": sign("msg_1", ts, "{}") };
    assert.equal(verifyWebhook('{"a":1}', headers(good), secret, now), false);
    assert.equal(verifyWebhook("{}", headers({ ...good, "svix-signature": sign("msg_1", ts, "{}", crypto.randomBytes(24)) }), secret, now), false);
    assert.equal(verifyWebhook("{}", headers(good), secret, now + 6 * 60_000), false);
    assert.equal(verifyWebhook("{}", headers({ "svix-id": "msg_1" }), secret, now), false);
    assert.equal(verifyWebhook("{}", headers(good), undefined, now), false);
    assert.equal(verifyWebhook("{}", headers({ ...good, "svix-signature": "v2,xxxx" }), secret, now), false);
  });
});

/* ───────────────────────── the whole flow ───────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */

describe("VPV Inbox end to end", () => {
  let w: World;
  let inbound: any, threadsRoute: any, threadRoute: any, messagesRoute: any, settingsRoute: any, membersRoute: any, db: any;

  const SECRET_BYTES = crypto.randomBytes(24);
  const WHSEC = `whsec_${SECRET_BYTES.toString("base64")}`;
  let seq = 0;

  before(async () => {
    w = await makeWorld();
    await w.raw.exec(readFileSync(join(process.cwd(), "supabase/inbox.sql"), "utf8"));
    inbound = await import("@/app/api/inbox/inbound/route");
    threadsRoute = await import("@/app/api/inbox/threads/route");
    threadRoute = await import("@/app/api/inbox/threads/[id]/route");
    messagesRoute = await import("@/app/api/inbox/threads/[id]/messages/route");
    settingsRoute = await import("@/app/api/inbox/settings/route");
    membersRoute = await import("@/app/api/inbox/members/route");
    db = await import("@/lib/server/inboxDb");
  });

  beforeEach(async () => {
    await w.reset();
    await w.raw.exec("insert into public.inbox_settings (id) values (true) on conflict (id) do nothing");
    process.env.RESEND_WEBHOOK_SECRET = WHSEC;
  });

  /** Mail "arrives at Resend" and Resend tells us (signed). */
  function arrive(m: Partial<import("./harness/fakeGateway").FakeReceived> & { id?: string } = {}) {
    const id = m.id ?? `rcv_test_${++seq}`;
    w.gw.received.set(id, {
      id,
      from: "Asha Rao <asha@acme-steel.in>",
      to: ["support@myvpv.com"],
      subject: "Do you shoot plants in Pune?",
      text: "Hello, do you also cover Pune?",
      message_id: `<m${seq}@acme-steel.in>`,
      headers: {},
      ...m,
    });
    return id;
  }

  async function webhook(emailId: string, o: { sign?: boolean; type?: string; secret?: Buffer } = {}) {
    const body = JSON.stringify({ type: o.type ?? "email.received", created_at: new Date().toISOString(), data: { email_id: emailId } });
    const svixId = `msg_${++seq}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig =
      o.sign === false
        ? "v1,AAAA"
        : "v1," + crypto.createHmac("sha256", o.secret ?? SECRET_BYTES).update(`${svixId}.${ts}.${body}`).digest("base64");
    const res = await inbound.POST(
      new Request("http://localhost/api/inbox/inbound", {
        method: "POST",
        headers: { "content-type": "application/json", "svix-id": svixId, "svix-timestamp": ts, "svix-signature": sig },
        body,
      })
    );
    return { res, status: res.status, body: await w.readJson(res) };
  }

  const deliver = async (m: Parameters<typeof arrive>[0] = {}) => (await webhook(arrive(m))).body;
  const threads = () => w.q("select * from public.inbox_threads order by ticket_no");
  const messages = (threadId?: string) =>
    threadId
      ? w.q("select * from public.inbox_messages where thread_id = $1 order by created_at, id", [threadId])
      : w.q("select * from public.inbox_messages order by created_at, id");

  async function staff(role: "owner" | "agent" | "admin" | "stranger", email = `${role}@vpv-team.in`) {
    if (role === "owner") return w.seedUser({ email, role: "owner" });
    const id = await w.seedUser({ email, role: "org_admin" });
    if (role !== "stranger") {
      await w.raw.query("insert into public.inbox_members (email, name, role) values ($1, $2, $3)", [email, role, role]);
    }
    return id;
  }

  /* ───── the front door ───── */

  describe("the webhook", () => {
    it("refuses an unsigned or wrongly signed request and stores nothing", async () => {
      const id = arrive();
      assert.equal((await webhook(id, { sign: false })).status, 401);
      assert.equal((await webhook(id, { secret: crypto.randomBytes(24) })).status, 401);
      assert.equal((await threads()).length, 0);
      assert.equal(w.gw.emails.length, 0);
    });

    it("says it is not set up when the signing secret is missing", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;
      assert.equal((await webhook(arrive())).status, 503);
    });

    it("quietly ignores other event types", async () => {
      const r = await webhook("x", { type: "email.delivered" });
      assert.equal(r.status, 200);
      assert.equal(r.body.ignored, "email.delivered");
      assert.equal((await threads()).length, 0);
    });

    it("answers with an error when the message cannot be read, so Resend retries", async () => {
      const r = await webhook("rcv_missing");
      assert.equal(r.status, 502);
      assert.equal((await threads()).length, 0);
    });
  });

  /* ───── a new customer ───── */

  describe("a first message", () => {
    it("becomes ticket 1001 and the sender gets one acknowledgement", async () => {
      const rid = arrive();
      const r = (await webhook(rid)).body;
      assert.equal(r.status, "stored");
      assert.equal(r.ticketNo, 1001);
      assert.equal(r.isNew, true);
      assert.equal(r.acked, true);

      const [t] = await threads();
      assert.equal(t.ticket_no.toString(), "1001");
      assert.equal(t.customer_email, "asha@acme-steel.in");
      assert.equal(t.customer_name, "Asha Rao");
      assert.equal(t.status, "open");
      assert.equal(t.unread, true);
      assert.ok(t.due_at, "a reply time was promised");
      assert.ok(t.ack_sent_at);

      const ms = await messages(t.id);
      assert.deepEqual(ms.map((m: any) => [m.direction, m.kind]), [["in", "mail"], ["out", "ack"]]);

      assert.equal(w.gw.emails.length, 1);
      const ack = w.gw.emails[0]!;
      assert.deepEqual(ack.to, ["asha@acme-steel.in"]);
      assert.equal(ack.from, "VPV Support <support@myvpv.com>");
      assert.equal(ack.subject, "Re: Do you shoot plants in Pune? [VPV-1001]");
      assert.match(ack.text!, /Hello Asha,/);
      assert.match(ack.text!, /VPV-1001/);
      assert.match(ack.text!, /(today|tomorrow|Mon|Tue|Wed|Thu|Fri|Sat)[^.]*IST/);
      assert.equal(ack.headers?.["Auto-Submitted"], "auto-replied");
      assert.equal(ack.headers?.["In-Reply-To"], w.gw.received.get(rid)!.message_id);
    });

    it("is stored once however many times the webhook is delivered", async () => {
      const id = arrive();
      const a = await webhook(id);
      const b = await webhook(id);
      const c = await webhook(id);
      assert.equal(a.body.status, "stored");
      assert.equal(b.body.status, "duplicate");
      assert.equal(c.body.status, "duplicate");
      assert.equal((await threads()).length, 1);
      assert.equal((await messages()).filter((m: any) => m.direction === "in").length, 1);
      assert.equal(w.gw.emails.length, 1, "one acknowledgement, not three");
    });

    it("takes HTML-only mail as text and never keeps the HTML on the screen path", async () => {
      await deliver({ text: undefined, html: "<p>Hi <b>team</b></p><script>steal()</script>" });
      const [m] = await messages();
      assert.equal(m.text_body, "Hi team");
    });

    it("keeps a record of attachments but not the files", async () => {
      await deliver({ attachments: [{ filename: "drawing.pdf", content_type: "application/pdf", size: 1234 }] });
      const [m] = await messages();
      assert.deepEqual(m.attachments, [{ filename: "drawing.pdf", contentType: "application/pdf", size: 1234 }]);
    });
  });

  /* ───── never answer a robot, never loop ───── */

  describe("robots and brakes", () => {
    it("stores robot mail but does not acknowledge it", async () => {
      const cases: Partial<import("./harness/fakeGateway").FakeReceived>[] = [
        { from: "auto@acme.in", headers: { "Auto-Submitted": "auto-replied" } },
        { from: "news@shop.com", headers: { "List-Unsubscribe": "<mailto:u@shop.com>" } },
        { from: "no-reply@bank.com" },
        { from: "p@acme.in", subject: "Out of office until Monday" },
        { from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification" },
      ];
      for (const c of cases) {
        const r = await deliver(c);
        assert.equal(r.status, "stored");
        assert.equal(r.acked, false, JSON.stringify(c));
      }
      assert.equal((await threads()).length, cases.length);
      assert.equal(w.gw.emails.length, 0);
    });

    it("does not acknowledge mail from our own domain (a teammate, or our own mail coming back)", async () => {
      const r = await deliver({ from: "Aryan <aryan@myvpv.com>" });
      assert.equal(r.status, "stored");
      assert.equal(r.acked, false);
      assert.equal(w.gw.emails.length, 0);
    });

    it("sends one sender at most 3 acknowledgements an hour", async () => {
      const results = [];
      for (let i = 0; i < 5; i++) results.push((await deliver({ subject: `Question number ${i}` })).acked);
      assert.deepEqual(results, [true, true, true, false, false]);
      assert.equal(w.gw.emails.length, 3);
      assert.equal((await threads()).length, 5, "every message is still a ticket");
    });

    it("sends nothing when the automatic reply is switched off", async () => {
      await w.raw.query("update public.inbox_settings set ack_enabled = false");
      const r = await deliver();
      assert.equal(r.status, "stored");
      assert.equal(r.acked, false);
      assert.equal(w.gw.emails.length, 0);
    });

    it("keeps the ticket when the acknowledgement cannot be sent, and records why", async () => {
      w.gw.emailsDown = true;
      const r = await deliver();
      assert.equal(r.status, "stored");
      assert.equal(r.acked, false);
      const [t] = await threads();
      assert.equal(t.ack_sent_at, null);
      const ack = (await messages(t.id)).find((m: any) => m.kind === "ack");
      assert.equal(ack.delivery, "failed");
      assert.match(ack.error, /503/);
    });
  });

  /* ───── which conversation? ───── */

  describe("threading", () => {
    it("a reply carrying the ticket tag joins the conversation, reopens it, and is not acknowledged again", async () => {
      await deliver();
      const [t0] = await threads();
      await w.raw.query("update public.inbox_threads set status = 'solved', unread = false where id = $1", [t0.id]);

      const r = await deliver({ subject: "Re: Do you shoot plants in Pune? [VPV-1001]", text: "Also Nashik?" });
      assert.equal(r.status, "stored");
      assert.equal(r.isNew, false);
      assert.equal(r.acked, false);

      const all = await threads();
      assert.equal(all.length, 1);
      assert.equal(all[0].status, "open");
      assert.equal(all[0].unread, true);
      assert.equal(all[0].message_count, 3, "question + acknowledgement + follow-up");
      assert.equal(w.gw.emails.length, 1);
    });

    it("a stranger quoting someone else's ticket number starts their own conversation", async () => {
      await deliver();
      const r = await deliver({ from: "mallory@evil.io", subject: "Re: hi [VPV-1001]", text: "give me the thread" });
      assert.equal(r.isNew, true);
      assert.equal((await threads()).length, 2);
      const [t1] = await threads();
      assert.equal((await messages(t1.id)).filter((m: any) => m.direction === "in").length, 1, "nothing leaked into ticket 1001");
    });

    it("an answer to a known message joins by In-Reply-To even without the tag", async () => {
      const first = arrive({ message_id: "<orig-1@acme-steel.in>" });
      await webhook(first);
      const r = await deliver({ subject: "different subject entirely", headers: { "In-Reply-To": "<orig-1@acme-steel.in>" } });
      assert.equal(r.isNew, false);
      assert.equal((await threads()).length, 1);
    });

    it("a new subject from the same person is a new ticket", async () => {
      await deliver();
      const r = await deliver({ subject: "Invoice question" });
      assert.equal(r.isNew, true);
      assert.equal(r.ticketNo, 1002);
    });

    it("a message on a spam conversation stays spam", async () => {
      await deliver();
      await w.raw.query("update public.inbox_threads set status = 'spam'");
      await deliver({ subject: "Re: x [VPV-1001]" });
      assert.equal((await threads())[0].status, "spam");
    });
  });

  /* ───── who may use it ───── */

  describe("access", () => {
    it("needs a signed-in person", async () => {
      assert.equal((await threadsRoute.GET(w.request("/api/inbox/threads", { method: "GET" }))).status, 401);
    });

    it("keeps out a signed-in person who is not on the team", async () => {
      const id = await staff("stranger");
      const res = await threadsRoute.GET(w.request("/api/inbox/threads", { method: "GET", as: id }));
      assert.equal(res.status, 403);
    });

    it("lets in the owner, an agent and an admin", async () => {
      for (const role of ["owner", "agent", "admin"] as const) {
        const id = await staff(role);
        const res = await threadsRoute.GET(w.request("/api/inbox/threads", { method: "GET", as: id }));
        assert.equal(res.status, 200, role);
      }
    });

    it("keeps out a team e-mail that has not been confirmed", async () => {
      const id = await staff("agent");
      const res = await threadsRoute.GET(w.request("/api/inbox/threads", { method: "GET", as: id, headers: { "x-test-unconfirmed": "1" } }));
      assert.equal(res.status, 403);
    });

    it("matches the team list in lower case", async () => {
      const id = await w.seedUser({ email: "Sita.Verma@VPV-Team.in", role: "org_admin" });
      await w.raw.query("insert into public.inbox_members (email, role) values ('sita.verma@vpv-team.in', 'agent')");
      const res = await threadsRoute.GET(w.request("/api/inbox/threads", { method: "GET", as: id }));
      assert.equal(res.status, 200);
    });

    it("tells the owner what to run when the tables are missing", async () => {
      await w.raw.exec("alter table public.inbox_threads rename to inbox_threads_x");
      try {
        const id = await staff("owner");
        const res = await threadsRoute.GET(w.request("/api/inbox/threads", { method: "GET", as: id }));
        assert.equal(res.status, 503);
        assert.match((await w.readJson(res)).message, /inbox\.sql/);
      } finally {
        await w.raw.exec("alter table public.inbox_threads_x rename to inbox_threads");
      }
    });

    it("lists conversations by status with counts, and only for staff", async () => {
      await deliver();
      await deliver({ subject: "Second" });
      await w.raw.query("update public.inbox_threads set status = 'solved' where ticket_no = 1002");
      const id = await staff("agent");
      const open = await w.readJson(await threadsRoute.GET(w.request("/api/inbox/threads?status=open", { method: "GET", as: id })));
      assert.deepEqual(open.threads.map((t: any) => Number(t.ticket_no)), [1001]);
      assert.equal(open.counts.open, 1);
      assert.equal(open.counts.solved, 1);
      const all = await w.readJson(await threadsRoute.GET(w.request("/api/inbox/threads?status=all", { method: "GET", as: id })));
      assert.equal(all.threads.length, 2);
    });
  });

  /* ───── answering ───── */

  describe("replying", () => {
    async function openTicket() {
      await deliver({ message_id: "<q1@acme-steel.in>", text: "Do you also cover Pune?" });
      w.gw.emails.length = 0;
      return (await threads())[0];
    }
    const reply = (id: string, threadId: string, body: Record<string, unknown>) =>
      messagesRoute.POST(w.request(`/api/inbox/threads/${threadId}/messages`, { body, as: id }), { params: { id: threadId } });

    it("emails the customer from support@, keeps the thread together, and moves it to waiting", async () => {
      const t = await openTicket();
      const me = await staff("agent");
      const res = await reply(me, t.id, { kind: "reply", text: "Yes, we cover Pune every week." });
      assert.equal(res.status, 200);

      assert.equal(w.gw.emails.length, 1);
      const m = w.gw.emails[0]!;
      assert.deepEqual(m.to, ["asha@acme-steel.in"]);
      assert.equal(m.from, "VPV Support <support@myvpv.com>");
      assert.equal(m.reply_to, "support@myvpv.com");
      assert.equal(m.subject, "Re: Do you shoot plants in Pune? [VPV-1001]");
      assert.equal(m.headers?.["In-Reply-To"], "<q1@acme-steel.in>");
      assert.match(m.text!, /^Yes, we cover Pune every week\./);
      assert.match(m.text!, /VPV Support Team/);
      assert.match(m.text!, /> Do you also cover Pune\?/, "the question is quoted underneath");
      assert.equal(m.headers?.["Auto-Submitted"], undefined, "a person's reply is not marked automatic");

      const [after] = await threads();
      assert.equal(after.status, "waiting");
      assert.equal(after.unread, false);
      assert.equal(after.assignee_email, "agent@vpv-team.in");
      assert.ok(after.first_reply_at);
      const out = (await messages(t.id)).find((x: any) => x.kind === "mail" && x.direction === "out");
      assert.equal(out.author_email, "agent@vpv-team.in");
      assert.equal(out.delivery, "sent");
    });

    it("can mark the conversation solved in the same step", async () => {
      const t = await openTicket();
      const me = await staff("agent");
      await reply(me, t.id, { kind: "reply", text: "Done.", status: "solved" });
      assert.equal((await threads())[0].status, "solved");
    });

    it("sends a copy to people in Cc, and refuses a bad Cc address", async () => {
      const t = await openTicket();
      const me = await staff("agent");
      const ok = await reply(me, t.id, { kind: "reply", text: "Looping in sales.", cc: ["Sales <sales@acme-steel.in>"] });
      assert.equal(ok.status, 200);
      assert.deepEqual(w.gw.emails[0]!.cc, ["sales@acme-steel.in"]);
      const bad = await reply(me, t.id, { kind: "reply", text: "x", cc: ["not-an-address"] });
      assert.equal(bad.status, 400);
    });

    it("keeps a failed send visible and does not pretend it went", async () => {
      const t = await openTicket();
      const me = await staff("agent");
      w.gw.emailsDown = true;
      const res = await reply(me, t.id, { kind: "reply", text: "This will not send." });
      assert.equal(res.status, 502);
      const [after] = await threads();
      assert.equal(after.status, "open", "still waiting for us");
      assert.equal(after.first_reply_at, null);
      const failed = (await messages(t.id)).find((x: any) => x.delivery === "failed" && x.kind === "mail");
      assert.ok(failed, "the attempt is on the conversation");
      assert.match(failed.error, /503/);
    });

    it("does not e-mail an internal note", async () => {
      const t = await openTicket();
      const me = await staff("agent");
      const res = await reply(me, t.id, { kind: "note", text: "Customer is a big Pune account." });
      assert.equal(res.status, 200);
      assert.equal(w.gw.emails.length, 0);
      const note = (await messages(t.id)).find((x: any) => x.kind === "note");
      assert.equal(note.direction, "note");
      assert.equal(note.author_email, "agent@vpv-team.in");
      assert.equal((await threads())[0].status, "open", "a note does not change the status");
    });

    it("refuses empty, oversized and unknown-kind messages, and strangers", async () => {
      const t = await openTicket();
      const me = await staff("agent");
      assert.equal((await reply(me, t.id, { kind: "reply", text: "   " })).status, 400);
      assert.equal((await reply(me, t.id, { kind: "reply", text: "x".repeat(20_001) })).status, 400);
      assert.equal((await reply(me, t.id, { kind: "shout", text: "hi" })).status, 400);
      const nobody = await staff("stranger");
      assert.equal((await reply(nobody, t.id, { kind: "reply", text: "hi" })).status, 403);
      assert.equal(w.gw.emails.length, 0);
    });

    it("gives 404 for a conversation that does not exist", async () => {
      const me = await staff("agent");
      const res = await reply(me, "00000000-0000-4000-8000-000000000000", { kind: "reply", text: "hi" });
      assert.equal(res.status, 404);
    });

    it("never hands the raw HTML of incoming mail to the screen", async () => {
      await deliver({ html: "<p>hello</p><img src=x onerror=alert(1)>", text: "hello" });
      const t = (await threads())[0];
      const me = await staff("agent");
      const res = await threadRoute.GET(w.request(`/api/inbox/threads/${t.id}`, { method: "GET", as: me }), { params: { id: t.id } });
      const body = await w.readJson(res);
      assert.ok(body.messages.length >= 1);
      for (const m of body.messages) assert.equal("html_body" in m, false);
      assert.doesNotMatch(JSON.stringify(body), /onerror/);
    });
  });

  /* ───── organising ───── */

  describe("assigning and closing", () => {
    const patch = (id: string, threadId: string, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
      threadRoute.PATCH(w.request(`/api/inbox/threads/${threadId}`, { method: "PATCH", body, as: id, headers: extra }), { params: { id: threadId } });

    it("changes status and read state", async () => {
      await deliver();
      const t = (await threads())[0];
      const me = await staff("agent");
      assert.equal((await patch(me, t.id, { status: "solved", unread: false })).status, 200);
      const after = (await threads())[0];
      assert.equal(after.status, "solved");
      assert.equal(after.unread, false);
      assert.equal((await patch(me, t.id, { status: "banana" })).status, 400);
      assert.equal((await patch(me, t.id, {})).status, 400);
    });

    it("assigns to a teammate, to yourself, or to nobody — but not to an outsider", async () => {
      await deliver();
      const t = (await threads())[0];
      const me = await staff("agent");
      await staff("admin");
      assert.equal((await patch(me, t.id, { assignee_email: "admin@vpv-team.in" })).status, 200);
      assert.equal((await threads())[0].assignee_email, "admin@vpv-team.in");
      assert.equal((await patch(me, t.id, { assignee_email: "agent@vpv-team.in" })).status, 200);
      assert.equal((await patch(me, t.id, { assignee_email: "stranger@evil.io" })).status, 400);
      assert.equal((await patch(me, t.id, { assignee_email: null })).status, 200);
      assert.equal((await threads())[0].assignee_email, null);
    });
  });

  /* ───── settings and team ───── */

  describe("settings and team", () => {
    const put = (id: string, body: Record<string, unknown>) =>
      settingsRoute.PUT(w.request("/api/inbox/settings", { method: "PUT", body, as: id }));

    it("shows staff who they are, the settings and the team", async () => {
      const id = await staff("agent");
      await staff("owner");
      const body = await w.readJson(await settingsRoute.GET(w.request("/api/inbox/settings", { method: "GET", as: id })));
      assert.equal(body.me.email, "agent@vpv-team.in");
      assert.equal(body.me.isAdmin, false);
      assert.equal(body.settings.reply_target_hours, 4);
      assert.deepEqual(body.team.map((t: any) => t.email).sort(), ["agent@vpv-team.in", "owner@vpv-team.in"]);
    });

    it("lets only admins and the owner change the automatic reply", async () => {
      const agent = await staff("agent");
      assert.equal((await put(agent, { reply_target_hours: 2 })).status, 403);
      const admin = await staff("admin");
      assert.equal((await put(admin, { reply_target_hours: 2 })).status, 200);
      const owner = await staff("owner");
      assert.equal((await put(owner, { reply_target_hours: 6 })).status, 200);
      assert.equal(Number((await w.q("select reply_target_hours from public.inbox_settings"))[0].reply_target_hours), 6);
    });

    it("validates every field", async () => {
      const owner = await staff("owner");
      const bad: Record<string, unknown>[] = [
        { reply_target_hours: 0 },
        { reply_target_hours: 241 },
        { reply_target_hours: 1.5 },
        { ack_body: "short" },
        { ack_body: "x".repeat(2001) },
        { from_name: "" },
        { office_days: [] },
        { office_days: [7] },
        { office_days: [1, 1] },
        { office_start_hour: 18, office_end_hour: 10 },
        { office_start_hour: 24 },
        { tz_offset_min: 9999 },
        { ack_enabled: "yes" },
        {},
      ];
      for (const b of bad) assert.equal((await put(owner, b)).status, 400, JSON.stringify(b));
    });

    it("uses the new wording and target for the next message", async () => {
      const owner = await staff("owner");
      const res = await put(owner, { ack_body: "Hi {name}, ticket {ticket} is with us. We will reply {eta}.", reply_target_hours: 1, signature: "Team VPV" });
      assert.equal(res.status, 200);
      await deliver();
      const ack = w.gw.emails[0]!;
      assert.match(ack.text!, /^Hi Asha, ticket VPV-1001 is with us\. We will reply /);
      assert.match(ack.text!, /Team VPV$/);
    });

    it("lets only the owner add and remove people, and removing someone frees their conversations", async () => {
      const owner = await staff("owner");
      const admin = await staff("admin");
      const addAs = (id: string, email: string, role = "agent") =>
        membersRoute.POST(w.request("/api/inbox/members", { body: { email, name: "New Person", role }, as: id }));

      assert.equal((await addAs(admin, "new@vpv-team.in")).status, 403, "even an inbox admin cannot");
      assert.equal((await addAs(owner, "not an email")).status, 400);
      const ok = await addAs(owner, "New@VPV-Team.in", "admin");
      assert.equal(ok.status, 200);
      const m = (await w.q("select * from public.inbox_members where email = 'new@vpv-team.in'"))[0];
      assert.equal(m.role, "admin");
      assert.equal(m.added_by, "owner@vpv-team.in");

      await deliver();
      await w.raw.query("update public.inbox_threads set assignee_email = 'new@vpv-team.in'");
      const del = await membersRoute.DELETE(w.request("/api/inbox/members", { method: "DELETE", body: { email: "new@vpv-team.in" }, as: owner }));
      assert.equal(del.status, 200);
      assert.equal((await w.q("select 1 from public.inbox_members where email = 'new@vpv-team.in'")).length, 0);
      assert.equal((await threads())[0].assignee_email, null);
    });
  });

  /* ───── the database itself ───── */

  describe("the tables", () => {
    it("are closed to the browser roles", async () => {
      const rows = await w.q(
        `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname like 'inbox\\_%' and c.relkind = 'r' order by 1`
      );
      assert.equal(rows.length, 4);
      for (const r of rows) assert.equal(r.rls, true, r.relname);
    });

    it("hold one settings row only", async () => {
      await assert.rejects(() => w.raw.query("insert into public.inbox_settings (id) values (false)"));
    });

    it("can be run twice", async () => {
      await w.raw.exec(readFileSync(join(process.cwd(), "supabase/inbox.sql"), "utf8"));
    });

    it("number tickets from 1001", async () => {
      await deliver();
      await deliver({ subject: "Another" });
      assert.deepEqual((await threads()).map((t: any) => Number(t.ticket_no)), [1001, 1002]);
    });
  });
});
