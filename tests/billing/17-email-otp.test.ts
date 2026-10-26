/**
 * The billing page's e-mail check: a code is e-mailed, and if the e-mail
 * provider refuses to send it the buyer is TOLD (it used to say "sent" while
 * nothing had gone out, which looked like mail lost to spam).
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, freshIp, type World } from "./harness/world";

describe("funnel e-mail OTP", () => {
  let w: World;
  let send: (body: unknown) => Promise<Response>;
  let verify: (body: unknown) => Promise<Response>;

  before(async () => {
    w = await makeWorld();
    const sendRoute = await import("@/app/api/funnel/otp/send/route");
    const verifyRoute = await import("@/app/api/funnel/otp/verify/route");
    send = (body) => sendRoute.POST(w.request("/api/funnel/otp/send", { body, ip: freshIp() }));
    verify = (body) => verifyRoute.POST(w.request("/api/funnel/otp/verify", { body, ip: freshIp() }));
  });
  after(async () => w.reset?.());
  beforeEach(() => {
    w.gw.emails = [];
    w.gw.emailsDown = false;
  });

  const ADDR = "buyer@factory-example.in";

  it("e-mails a six-digit code, with a plain-text copy, and the code then verifies", async () => {
    const res = await send({ email: ADDR });
    const body = await w.readJson(res);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.sent, true);
    assert.equal(w.gw.emailsTo(ADDR).length, 1);
    const mail = w.gw.emailsTo(ADDR)[0];
    const code = mail.subject.match(/^(\d{6}) is your VPV/)?.[1];
    assert.ok(code, "the code leads the subject so it shows in the notification");
    assert.ok(mail.text && mail.text.includes(code!), "a plain-text part carries the code too");
    assert.ok(!JSON.stringify(body).includes(code!), "the response never contains the code");

    const wrong = await verify({ email: ADDR, code: code === "000000" ? "111111" : "000000" });
    assert.equal(wrong.status, 400);
    const ok = await verify({ email: ADDR, code });
    assert.equal(ok.status, 200);
  });

  it("tells the buyer when the e-mail provider refuses to send, instead of saying it was sent", async () => {
    w.gw.emailsDown = true;
    const res = await send({ email: "other@factory-example.in" });
    const body = await w.readJson(res);
    assert.equal(res.status, 502, JSON.stringify(body));
    assert.equal(body.error, "email_not_sent");
    assert.match(body.message, /could not send the e-mail/i);
    assert.equal(w.gw.emails.length, 0);
  });
});
