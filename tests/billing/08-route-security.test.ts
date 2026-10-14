import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { makeWorld, BUYER, freshIp, type World } from "./harness/world";
import { TEST_KEY_ID, TEST_KEY_SECRET, TEST_WEBHOOK_SECRET } from "./harness/fakeGateway";

/**
 * The doors of the system, attacked from the outside: malformed and hostile
 * input, secrets missing or weak, someone else's data, the database API used
 * directly with the public key, and the owner-only tools.
 */
describe("route security", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(() => w.gw.uninstall());

  let n = 0;
  const uniq = (extra: Partial<typeof BUYER> = {}) => {
    n += 1;
    return { email: `person${n}@fresh${n}-co.in`, company: `Fresh ${n} Co`, ...extra };
  };

  const rawOrder = (raw: string, ip = freshIp(), headers: Record<string, string> = {}) =>
    w.routes.order.POST(w.request("/api/billing/order", { raw, ip, headers }));

  /* ───────────────────────────── hostile input to the order route ───────────────────────────── */

  describe("order request", () => {
    it("rejects bodies that are not a JSON object", async () => {
      for (const raw of ["", "not json", "[]", "null", "42", '"text"', "{", '{"a":', "\u0000\u0001"]) {
        const res = await rawOrder(raw);
        assert.equal(res.status, 400, JSON.stringify(raw));
      }
      assert.equal(await w.count("billing_orders"), 0);
    });

    it("refuses an oversized body — declared, or streamed in chunks with no length at all", async () => {
      const big = JSON.stringify({ purpose: "basic_licence", scenes: 5, buyer: { ...BUYER, address: "x".repeat(200_000) } });
      const declared = await rawOrder(big, freshIp(), { "content-length": String(big.length) });
      assert.equal(declared.status, 413);

      const chunk = new TextEncoder().encode("x".repeat(1024));
      let sent = 0;
      const stream = new ReadableStream({
        pull(c) {
          if (sent >= 512) return c.close();
          sent += 1;
          c.enqueue(chunk);
        },
      });
      const req = new Request("http://localhost/api/billing/order", {
        method: "POST",
        headers: { "x-vpv-ip": freshIp(), "content-type": "application/json" },
        body: stream,
        duplex: "half",
      } as RequestInit);
      const res = await w.routes.order.POST(req);
      assert.equal(res.status, 413);
      assert.ok(sent < 512, `the server stopped reading early (read ${sent} KB of 512)`);
    });

    it("only 'basic_licence', 'scene_topup' and 'support_renewal' can be bought online — never Pro, Ultra or anything invented", async () => {
      for (const purpose of ["pro", "ultra", "pro_plan", "admin", "", null, 7, {}, ["basic_licence"], "BASIC_LICENCE", "basic_licence "]) {
        const res = await w.routes.order.POST(w.request("/api/billing/order", { body: { purpose, scenes: 5, buyer: { ...BUYER, ...uniq() } } }));
        assert.ok(res.status === 400 || res.status === 401, `${JSON.stringify(purpose)} → ${res.status}`);
      }
      assert.equal(await w.count("billing_orders"), 0);
    });

    it("prototype-pollution keys in the body do nothing", async () => {
      const buyer = JSON.stringify({ ...BUYER, ...uniq() }).slice(0, -1) + ',"__proto__":{"isAdmin":true},"constructor":{"prototype":{"plan":"ultra"}}}';
      const raw = `{"purpose":"basic_licence","scenes":5,"__proto__":{"polluted":true},"buyer":${buyer}}`;
      const res = await rawOrder(raw);
      assert.equal(res.status, 200, await res.clone().text());
      assert.equal(({} as Record<string, unknown>).polluted, undefined);
      assert.equal(({} as Record<string, unknown>).isAdmin, undefined);
    });

    it("hostile text in names, company and address is stored as plain text and escaped in every e-mail", async () => {
      const evil = {
        name: `<img src=x onerror=alert(1)>`,
        company: `<script>alert('x')</script> & Sons "Pvt" Ltd`,
        address: `1 Road</td><td style="x">'; DROP TABLE billing_orders; --`,
      };
      const b = uniq(evil);
      const { body: order, status } = await w.openOrder({ scenes: 5, buyer: b });
      assert.equal(status, 200, JSON.stringify(order));
      await w.payInBrowser(order);
      await w.poll(order.orderId);
      assert.equal(await w.count("billing_orders"), 1, "the table is still there (parameterised queries)");
      for (const mail of w.gw.emailsTo(b.email)) {
        assert.ok(!/<script>/i.test(mail.html), `raw <script> in "${mail.subject}"`);
        assert.ok(!/<img src=x/i.test(mail.html), `raw <img> in "${mail.subject}"`);
        assert.ok(!/onerror=alert/i.test(mail.html.replace(/&lt;[^&]*&gt;/g, "")), "no live event handler");
      }
      const welcome = w.gw.emailsTo(b.email).find((m) => /workspace/i.test(m.subject))!;
      assert.ok(welcome.html.includes("&lt;script&gt;"), "shown as harmless text");
    });

    it("control characters, newlines and absurd lengths are cleaned or cut", async () => {
      const b = uniq({ company: "Line1\r\nBcc: attacker@evil.in\u0000Line2", name: "N".repeat(300), address: "A".repeat(900) });
      const { body: order, status } = await w.openOrder({ scenes: 5, buyer: b });
      assert.equal(status, 200, JSON.stringify(order));
      const [row] = await w.q(`select buyer_company, buyer_name, buyer_address from public.billing_orders`);
      assert.ok(!/[\r\n\u0000]/.test(row.buyer_company));
      assert.ok(row.buyer_name.length <= 120);
      assert.ok(row.buyer_address.length <= 400);
    });

    it("e-mail addresses that are malformed, header-injecting, wildcard or disposable are refused", async () => {
      const bad = [
        "no-at-sign",
        "two@@signs.in",
        "spaces in@name.in",
        "a@b",
        "a@b..in",
        "victim@x.in\nBcc: evil@x.in",
        "victim@x.in,evil@x.in",
        "<script>@x.in",
        "%@fresh-co.in",
        "a@" + "b".repeat(300) + ".in",
        "x@mailinator.com",
        "x@YOPMAIL.com",
      ];
      for (const email of bad) {
        const r = await w.openOrder({ scenes: 5, buyer: { ...uniq(), email } });
        assert.equal(r.status, 400, JSON.stringify(email));
      }
      assert.equal(await w.count("billing_orders"), 0);
    });

    it("e-mail case and surrounding spaces are normalised, so one person cannot become two accounts", async () => {
      const first = await w.openOrder({ scenes: 5, buyer: { email: "  Owner@Case-Co.IN ", company: "Case Co" } });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      const second = await w.openOrder({ scenes: 5, buyer: { email: "owner@case-co.in", company: "Case Co" } });
      assert.equal(second.body.orderId, first.body.orderId, "same person, same open order");
      assert.equal((await w.q(`select buyer_email from public.billing_orders`))[0].buyer_email, "owner@case-co.in");
    });

    it("a wildcard e-mail can never match, or attach to, somebody else's account", async () => {
      await w.seedUser({ email: "asha@acme-steel.in", orgId: null });
      const r = await w.openOrder({ scenes: 5, buyer: { ...uniq(), email: "%@acme-steel.in" } });
      assert.equal(r.status, 400);
      const r2 = await w.openOrder({ scenes: 5, buyer: { ...uniq(), email: "asha@acme-steel.in" } });
      assert.equal(r2.status, 409, "the real address is recognised as taken");
      assert.equal(r2.body.error, "account_exists");
    });

    it("an address that already has an account is told to sign in, and nothing is created for it", async () => {
      const org = await w.seedOrg({ slug: "taken-co" });
      await w.seedUser({ email: "boss@taken-co.in", orgId: org.id });
      const r = await w.openOrder({ scenes: 5, buyer: { ...uniq(), email: "BOSS@taken-co.in" } });
      assert.equal(r.status, 409);
      assert.equal(await w.count("billing_orders"), 0);
      assert.equal(w.gw.orders.size, 0);
    });

    it("error responses never echo secrets, stack traces or internal names", async () => {
      w.sb.failNext("from:billing_orders", 100, { message: 'relation "billing_orders" violates constraint with key rzp_test_AbCdEf123456 at postgres' });
      w.sb.failNext("rpc:billing_find_auth_user", 100, { message: "SUPABASE_SERVICE_ROLE_KEY leaked in postgres error" });
      const res = await w.routes.order.POST(w.request("/api/billing/order", { body: { purpose: "basic_licence", scenes: 5, buyer: { ...BUYER, ...uniq() } } }));
      const text = await res.text();
      assert.ok(res.status >= 400, `expected an error, got ${res.status}: ${text}`);
      assert.ok(!/rzp_|billing_orders|stack|postgres|SUPABASE|violates|relation|constraint/i.test(text), text);
    });
  });

  /* ───────────────────────────── abuse limits ───────────────────────────── */

  describe("rate limits", () => {
    it("one visitor cannot open more than 10 orders an hour; a different visitor is unaffected", async () => {
      const ip = freshIp();
      let blocked = 0;
      for (let i = 0; i < 14; i++) {
        const r = await w.openOrder({ scenes: 5, buyer: uniq(), ip });
        if (r.status === 429) blocked += 1;
      }
      assert.equal(blocked, 4);
      const other = await w.openOrder({ scenes: 5, buyer: uniq(), ip: freshIp() });
      assert.equal(other.status, 200);
    });

    it("one e-mail address cannot be hammered from many addresses (12 an hour)", async () => {
      const b = uniq();
      let blocked = 0;
      for (let i = 0; i < 16; i++) {
        const r = await w.openOrder({ scenes: 2 + (i % 18), buyer: b, ip: freshIp() });
        if (r.status === 429) blocked += 1;
      }
      assert.ok(blocked >= 3, `blocked ${blocked}`);
    });

    it("a 429 says when to try again", async () => {
      const ip = freshIp();
      let last: Response | null = null;
      for (let i = 0; i < 12; i++) last = await w.routes.order.POST(w.request("/api/billing/order", { ip, body: { purpose: "basic_licence", scenes: 5, buyer: { ...BUYER, ...uniq() } } }));
      assert.equal(last!.status, 429);
      assert.ok(Number(last!.headers.get("retry-after")) > 0);
    });

    it("the global brake stops a flood from many different visitors", async () => {
      const prev = process.env.BILLING_GLOBAL_ORDERS_PER_HOUR;
      process.env.BILLING_GLOBAL_ORDERS_PER_HOUR = "5";
      try {
        const results: number[] = [];
        for (let i = 0; i < 8; i++) results.push((await w.openOrder({ scenes: 5, buyer: uniq(), ip: freshIp() })).status);
        assert.equal(results.filter((s) => s === 200).length, 5, results.join());
        assert.equal(results.filter((s) => s === 429).length, 3);
      } finally {
        if (prev === undefined) delete process.env.BILLING_GLOBAL_ORDERS_PER_HOUR;
        else process.env.BILLING_GLOBAL_ORDERS_PER_HOUR = prev;
      }
    });

    it("a stranger holding the PUBLIC key cannot burn the checkout's counters to lock real customers out", async () => {
      const anon = w.sb.as("anon");
      const ip = freshIp();
      const email = "victim@target-co.in";
      // The attacker guesses every readable key the checkout could be using and hammers each one.
      const guesses = ["billing-order:all", `billing-order:ip:${ip}`, `billing-order:email:${email}`, "billing-order:all:"];
      for (const key of guesses) {
        for (let i = 0; i < 260; i++) {
          await anon.rpc("check_and_bump_rate", { p_key: key, p_max: 100000, p_window_seconds: 3600 });
        }
      }
      const real = await w.openOrder({ scenes: 5, ip, buyer: { email, company: "Target Co" } });
      assert.equal(real.status, 200, JSON.stringify(real.body));
      // ...and the stored counters are not readable text.
      const keys = (await w.q(`select key from public.rate_limits where key like 'bk:%'`)).map((r) => r.key as string);
      assert.ok(keys.length > 0, "billing counters are stored under keyed names");
      assert.ok(keys.every((k) => !k.includes("billing-order") && !k.includes(email) && !k.includes(ip)));
    });

    it("the limiter never fails open: with the database limiter broken it still limits (in memory)", async () => {
      w.sb.failNext("rpc:check_and_bump_rate", 1000);
      const ip = freshIp();
      const statuses: number[] = [];
      for (let i = 0; i < 14; i++) statuses.push((await w.openOrder({ scenes: 5, buyer: uniq(), ip })).status);
      assert.ok(statuses.includes(429), statuses.join());
    });

    it("X-Forwarded-For / client-sent IP headers cannot be used to dodge the limit when the trusted header is present", async () => {
      const ip = freshIp();
      let blocked = 0;
      for (let i = 0; i < 13; i++) {
        const res = await w.routes.order.POST(
          w.request("/api/billing/order", {
            ip,
            headers: { "x-forwarded-for": `9.9.9.${i}`, "cf-connecting-ip": `8.8.8.${i}`, "x-real-ip": `7.7.7.${i}` },
            body: { purpose: "basic_licence", scenes: 5, buyer: { ...BUYER, ...uniq() } },
          })
        );
        if (res.status === 429) blocked += 1;
      }
      assert.ok(blocked >= 3, `blocked ${blocked}`);
    });

    it("the middleware replaces any client-supplied x-vpv-ip with the platform's own header", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return import("@/middleware").then(({ middleware }) => {
        const req = new NextRequest("https://myvpv.com/api/billing/order", {
          method: "POST",
          headers: { "x-vpv-ip": "6.6.6.6", "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "5.5.5.5", host: "myvpv.com" },
        });
        const res = middleware(req);
        assert.equal(res.headers.get("x-middleware-request-x-vpv-ip"), "203.0.113.9");
      });
    });
  });

  /* ───────────────────────────── secrets and configuration ───────────────────────────── */

  describe("configuration safety", () => {
    const withEnv = async (patch: Record<string, string | undefined>, fn: () => Promise<void>) => {
      const saved: Record<string, string | undefined> = {};
      for (const k of Object.keys(patch)) {
        saved[k] = process.env[k];
        if (patch[k] === undefined) delete process.env[k];
        else process.env[k] = patch[k];
      }
      try {
        await fn();
      } finally {
        for (const k of Object.keys(saved)) {
          if (saved[k] === undefined) delete process.env[k];
          else process.env[k] = saved[k];
        }
      }
    };

    it("a LIVE key is refused outside the production deployment — no order, no call to Razorpay", async () => {
      await withEnv({ RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", VERCEL_ENV: "preview" }, async () => {
        const r = await w.openOrder({ scenes: 5, buyer: uniq() });
        assert.equal(r.status, 503);
        assert.equal(w.gw.requests.length, 0);
        assert.equal(await w.count("billing_orders"), 0);
      });
      await withEnv({ RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", VERCEL_ENV: undefined }, async () => {
        assert.equal((await w.openOrder({ scenes: 5, buyer: uniq() })).status, 503, "a laptop with live keys cannot take real money");
      });
    });

    it("a malformed key id or a missing / too-short key secret switches payments off instead of half-working", async () => {
      for (const patch of [
        { RAZORPAY_KEY_ID: "not-a-razorpay-key" },
        { RAZORPAY_KEY_ID: undefined, NEXT_PUBLIC_RAZORPAY_KEY_ID: undefined },
        { RAZORPAY_KEY_SECRET: undefined },
        { RAZORPAY_KEY_SECRET: "short" },
      ]) {
        await withEnv(patch as Record<string, string | undefined>, async () => {
          const r = await w.openOrder({ scenes: 5, buyer: uniq() });
          assert.equal(r.status, 503, JSON.stringify(patch));
        });
      }
      assert.equal(w.gw.requests.length, 0);
    });

    it("the older NEXT_PUBLIC_RAZORPAY_KEY_ID name still works as a fallback (and the new RAZORPAY_KEY_ID wins)", async () => {
      await withEnv({ RAZORPAY_KEY_ID: undefined, NEXT_PUBLIC_RAZORPAY_KEY_ID: TEST_KEY_ID }, async () => {
        const r = await w.openOrder({ scenes: 5, buyer: uniq() });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.keyId, TEST_KEY_ID);
      });
    });

    it("the webhook refuses to work without a strong secret — even for a 'correctly signed' request", async () => {
      const { body: order } = await w.openOrder({ scenes: 5, buyer: uniq() });
      const pay = w.gw.pay(order.razorpayOrderId);
      for (const secret of [undefined, "", "short", "x".repeat(19)]) {
        await withEnv({ RAZORPAY_WEBHOOK_SECRET: secret }, async () => {
          // An attacker who knows (or guesses) the weak secret can sign anything with it.
          const forged = w.gw.signedWebhook("payment.captured", { payment: { entity: pay } }, { secret: secret ?? "" });
          const res = await w.deliver(forged);
          assert.equal(res.status, 503, `secret=${JSON.stringify(secret)}`);
        });
      }
      assert.equal(await w.count("organizations"), 0);
      assert.equal(await w.count("billing_webhook_events"), 0);
      assert.equal((await w.deliver(w.gw.paymentEvent("payment.captured", pay))).status, 200, "and works again once configured");
    });

    it("the key secret is never sent to the browser, in any response, ever", async () => {
      const r = await w.openOrder({ scenes: 5, buyer: uniq() });
      assert.ok(!JSON.stringify(r.body).includes(TEST_KEY_SECRET));
      assert.ok(!JSON.stringify(r.body).includes(TEST_WEBHOOK_SECRET));
      const poll = await w.poll(r.body.orderId);
      assert.ok(!JSON.stringify(poll.body).includes(TEST_KEY_SECRET));
    });

    it("test fixtures can only be injected under NODE_ENV=test", async () => {
      const prev = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string>).NODE_ENV = "production";
        const { __setSupabaseAdminForTests } = await import("@/lib/server/supabaseAdmin");
        const { __setAuthenticatorForTests } = await import("@/lib/server/requestAuth");
        assert.throws(() => __setSupabaseAdminForTests(null as never), /test/i);
        assert.throws(() => __setAuthenticatorForTests(null as never), /test/i);
      } finally {
        (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
      }
    });
  });

  /* ───────────────────────────── the owner-only tools ───────────────────────────── */

  describe("admin provisioning", () => {
    const provision = async (as: string | undefined, body: Record<string, unknown>, ip = freshIp()) => {
      const res = await w.routes.provision.POST(w.request("/api/admin/provision", { as, body, ip }));
      return { res, status: res.status, body: await w.readJson(res) };
    };
    const ownerId = () => w.seedUser({ email: "owner@vpv.in", role: "owner" });

    it("signed-out visitors, presenters and organisation admins are all refused", async () => {
      const org = await w.seedOrg({ slug: "some-co" });
      const admin = await w.seedUser({ email: "admin@some-co.in", orgId: org.id, role: "org_admin" });
      const presenter = await w.seedUser({ email: "pres@some-co.in", orgId: org.id, role: "presenter" });
      const body = { company: "Evil Co", adminEmail: "evil@evil-co.in", plan: "ultra" };
      assert.equal((await provision(undefined, body)).status, 401);
      assert.equal((await provision(admin, body)).status, 403);
      assert.equal((await provision(presenter, body)).status, 403);
      assert.equal((await provision("00000000-0000-4000-8000-000000000000", body)).status, 401);
      assert.equal(await w.count("organizations", "name = 'Evil Co'"), 0);
    });

    it("the owner provisions a Pro customer: workspace, login, welcome e-mail, audit trail", async () => {
      const owner = await ownerId();
      const r = await provision(owner, { company: "Big Plant Ltd", adminEmail: "head@bigplant.in", adminName: "Head", plan: "pro", note: "signed on call" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.match(r.body.tempPassword, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const [org] = await w.q(`select plan, plan_status, scene_quota from public.organizations where slug = $1`, [r.body.slug]);
      assert.equal(org.plan, "pro");
      assert.equal(org.plan_status, "active");
      const [ev] = await w.q(`select actor, note from public.plan_events`);
      assert.match(ev.actor, /^owner:/);
      assert.equal(ev.note, "signed on call");
      assert.ok(w.gw.emailsTo("head@bigplant.in").some((m) => /workspace/i.test(m.subject)));
      assert.ok(!JSON.stringify(r.body).includes("service-role"), "no keys in the response");
    });

    it("an e-mail that already belongs to a workspace is refused — accounts are never moved", async () => {
      const owner = await ownerId();
      const other = await w.seedOrg({ slug: "other-co" });
      await w.seedUser({ email: "shared@other-co.in", orgId: other.id });
      const r = await provision(owner, { company: "New Co", adminEmail: "SHARED@other-co.in", plan: "pro" });
      assert.equal(r.status, 409);
      assert.equal(r.body.error, "email_in_use");
      const [p] = await w.q(`select org_id from public.profiles where email = 'shared@other-co.in'`);
      assert.equal(p.org_id, other.id);
      assert.equal(await w.count("organizations", "name = 'New Co'"), 0);
    });

    it("wildcard e-mails match nobody", async () => {
      const owner = await ownerId();
      const other = await w.seedOrg({ slug: "other-co" });
      await w.seedUser({ email: "someone@other-co.in", orgId: other.id });
      const r = await provision(owner, { company: "Wild Co", adminEmail: "%@other-co.in", plan: "pro" });
      assert.equal(r.status, 400);
    });

    it("an existing account with no workspace is attached, keeping its own password", async () => {
      const owner = await ownerId();
      await w.seedUser({ email: "free@agent.in", orgId: null, role: "presenter" });
      const r = await provision(owner, { company: "Agent Co", adminEmail: "free@agent.in", plan: "pro" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.tempPassword, null);
      assert.equal((await w.q(`select count(*)::int n from auth.users where email = 'free@agent.in'`))[0].n, 1);
      assert.equal((await w.q(`select role from public.profiles where email = 'free@agent.in'`))[0].role, "org_admin");
    });

    it("another owner's account cannot be hijacked into a workspace", async () => {
      const owner = await ownerId();
      await w.seedUser({ email: "boss2@vpv.in", role: "owner", orgId: null });
      const r = await provision(owner, { company: "Hijack Co", adminEmail: "boss2@vpv.in", plan: "pro" });
      assert.equal(r.status, 409);
    });

    it("a failure part-way leaves nothing behind (no orphan workspace, login or profile), and a retry works", async () => {
      const owner = await ownerId();
      w.sb.failNext("auth.createUser", 1);
      const bad = await provision(owner, { company: "Retry Co", adminEmail: "a@retry-co.in", plan: "pro" });
      assert.equal(bad.status, 500);
      assert.equal(await w.count("organizations", "name = 'Retry Co'"), 0);

      w.sb.failNext("from:profiles", 1, { message: "injected failure" }, 1); // let the sign-in lookup through, fail the profile write
      const bad2 = await provision(owner, { company: "Retry Co", adminEmail: "a@retry-co.in", plan: "pro" });
      assert.equal(bad2.status, 500);
      assert.equal(await w.count("organizations", "name = 'Retry Co'"), 0);
      assert.equal((await w.q(`select count(*)::int n from auth.users where email = 'a@retry-co.in'`))[0].n, 0, "the half-made login was removed");

      const good = await provision(owner, { company: "Retry Co", adminEmail: "a@retry-co.in", plan: "pro" });
      assert.equal(good.status, 200, JSON.stringify(good.body));
    });

    it("two companies with the same name get different addresses, and reserved words are never used as one", async () => {
      const owner = await ownerId();
      const a = await provision(owner, { company: "Twin Works", adminEmail: "a@twin-a.in", plan: "pro" });
      const b = await provision(owner, { company: "Twin Works", adminEmail: "b@twin-b.in", plan: "pro" });
      assert.notEqual(a.body.slug, b.body.slug);
      for (const name of ["admin", "www", "api", "login"]) {
        const r = await provision(owner, { company: name, adminEmail: `x@${name}-co.in`, plan: "pro" });
        assert.equal(r.status, 200);
        assert.notEqual(r.body.slug, name, `slug "${name}" must not be handed out`);
      }
    });

    it("bad input is refused: no company, bad e-mail, giant body", async () => {
      const owner = await ownerId();
      assert.equal((await provision(owner, { adminEmail: "a@b-co.in" })).status, 400);
      assert.equal((await provision(owner, { company: "X", adminEmail: "nope" })).status, 400);
      const big = await w.routes.provision.POST(
        w.request("/api/admin/provision", { as: owner, raw: JSON.stringify({ company: "X".repeat(20_000), adminEmail: "a@b-co.in" }) })
      );
      assert.equal(big.status, 413);
    });

    it("an unknown plan name falls back to Basic with the minimum scenes — never to something richer", async () => {
      const owner = await ownerId();
      const r = await provision(owner, { company: "Odd Co", adminEmail: "a@odd-co.in", plan: "platinum-unlimited", scenes: 9999 });
      assert.equal(r.status, 200);
      const [org] = await w.q(`select plan, scene_quota from public.organizations where slug = $1`, [r.body.slug]);
      assert.equal(org.plan, "basic");
      assert.ok(Number(org.scene_quota) <= 20);
    });
  });

  /* ───────────────────────────── the public enquiry form ───────────────────────────── */

  describe("sales enquiry form", () => {
    const enquire = async (body: Record<string, unknown>, ip = freshIp()) => {
      const res = await w.routes.enquiry.POST(w.request("/api/billing/enquiry", { body, ip }));
      return { status: res.status, body: await w.readJson(res) };
    };
    const good = (extra: Record<string, unknown> = {}) => ({ plan: "pro", name: "Ravi", company: "Ravi Steel", email: `ravi${++n}@ravi-steel.in`, message: "Hello", ...extra });

    it("a real enquiry is stored, e-mailed to the founders, and acknowledged to the sender", async () => {
      const b = good();
      const r = await enquire(b);
      assert.equal(r.status, 200);
      assert.equal(await w.count("sales_enquiries"), 1);
      assert.ok(w.gw.emails.some((m) => /enquiry/i.test(m.subject)));
      assert.ok(w.gw.emailsTo(String(b.email)).length === 1, "acknowledgement sent");
    });

    it("the hidden honeypot field silently drops bots — no row, no e-mail", async () => {
      const r = await enquire(good({ website: "http://spam.example" }));
      assert.equal(r.status, 200);
      assert.equal(await w.count("sales_enquiries"), 0);
      assert.equal(w.gw.emails.length, 0);
    });

    it("missing name/company or a bad e-mail is refused", async () => {
      assert.equal((await enquire(good({ name: "" }))).status, 400);
      assert.equal((await enquire(good({ company: "" }))).status, 400);
      assert.equal((await enquire(good({ email: "nope" }))).status, 400);
      assert.equal((await enquire(good({ email: "x@y.in\nBcc: z@z.in" }))).status, 400);
    });

    it("cannot be used as a spam relay: 2 acknowledgements a day per address, 6 enquiries an hour per visitor", async () => {
      const victim = "victim@innocent.in";
      for (let i = 0; i < 5; i++) await enquire(good({ email: victim }), freshIp());
      assert.equal(w.gw.emailsTo(victim).length, 2, "the victim gets at most two e-mails");

      const ip = freshIp();
      const statuses: number[] = [];
      for (let i = 0; i < 9; i++) statuses.push((await enquire(good(), ip)).status);
      assert.equal(statuses.filter((s) => s === 429).length, 3, statuses.join());
    });

    it("disposable addresses are recorded for follow-up but never e-mailed back", async () => {
      const r = await enquire(good({ email: "tmp@mailinator.com" }));
      assert.equal(r.status, 200);
      assert.equal(w.gw.emailsTo("tmp@mailinator.com").length, 0);
    });

    it("hostile text is escaped in the founders' e-mail", async () => {
      await enquire(good({ message: "<script>steal()</script>", company: "<b>Bold</b> Co" }));
      const mail = w.gw.emails.find((m) => /enquiry/i.test(m.subject))!;
      assert.ok(!/<script>steal/.test(mail.html));
      assert.ok(mail.html.includes("&lt;script&gt;"));
    });

    it("an oversized body is refused", async () => {
      const res = await w.routes.enquiry.POST(w.request("/api/billing/enquiry", { raw: JSON.stringify(good({ message: "m".repeat(50_000) })) }));
      assert.equal(res.status, 413);
    });
  });

  /* ───────────────────────────── the database API used directly ───────────────────────────── */

  describe("the public database key cannot touch money", () => {
    const moneyFunctions: Array<[string, Record<string, unknown>]> = [
      ["billing_record_payment", { p_razorpay_order_id: "order_x", p_payment_id: "pay_x", p_amount_paise: 100, p_currency: "INR", p_status: "captured", p_method: null, p_bank: null, p_wallet: null, p_vpa: null, p_card_last4: null, p_fee_paise: null, p_tax_paise: null, p_source: "webhook", p_signature_verified: true, p_error_code: null, p_error_description: null }],
      ["billing_claim_fulfilment", { p_order: "00000000-0000-4000-8000-000000000000" }],
      ["billing_release_fulfilment", { p_order: "00000000-0000-4000-8000-000000000000" }],
      ["billing_create_org_for_order", { p_order: "00000000-0000-4000-8000-000000000000", p_slug: "x", p_scenes: 5, p_support_months: 12 }],
      ["billing_apply_topup", { p_order: "00000000-0000-4000-8000-000000000000" }],
      ["billing_apply_support_renewal", { p_order: "00000000-0000-4000-8000-000000000000" }],
      ["billing_issue_invoice", { p_order: "00000000-0000-4000-8000-000000000000", p_description: "x", p_our_state: "Haryana", p_gst_rate: 0.18, p_sac: "1" }],
      ["billing_apply_refund", { p_refund_id: "r", p_payment_id: "p", p_amount: 1, p_status: "processed" }],
      ["billing_webhook_begin", { p_event_id: "e", p_type: "t", p_payload: {} }],
      ["billing_webhook_finish", { p_event_id: "e", p_error: null, p_retriable: false }],
      ["billing_find_auth_user", { p_email: "asha@acme-steel.in" }],
      ["billing_claim_email", { p_order: "00000000-0000-4000-8000-000000000000", p_which: "welcome" }],
      ["billing_finish_email", { p_order: "00000000-0000-4000-8000-000000000000", p_which: "welcome", p_sent: true }],
      ["billing_claim_support_reminders", {}],
      ["org_access_state_of", { p_org: "00000000-0000-4000-8000-000000000000" }],
    ];

    it("every money-moving function is closed to anonymous and signed-in browsers", async () => {
      const org = await w.seedOrg({ slug: "poke-co" });
      const user = await w.seedUser({ email: "admin@poke-co.in", orgId: org.id });
      for (const [fn, args] of moneyFunctions) {
        for (const client of [w.sb.as("anon"), w.sb.as("authenticated", user)]) {
          const r = await client.rpc(fn, args);
          assert.ok(r.error, `${fn} must be refused`);
          assert.match(String(r.error.message), /permission denied|not exist|must be owner/i, `${fn}: ${r.error.message}`);
        }
      }
    });

    it("the account directory cannot be probed for who has an account", async () => {
      await w.seedUser({ email: "asha@acme-steel.in", orgId: null });
      const r = await w.sb.as("anon").rpc("billing_find_auth_user", { p_email: "asha@acme-steel.in" });
      assert.ok(r.error, "refused");
      assert.equal(r.data, null);
    });

    it("anonymous browsers cannot read or write any billing table", async () => {
      const { body: order } = await w.openOrder({ scenes: 5, buyer: uniq() });
      await w.payInBrowser(order);
      await w.poll(order.orderId);
      const anon = w.sb.as("anon");
      for (const t of ["billing_orders", "billing_payments", "billing_invoices", "billing_refunds", "billing_credit_notes", "billing_alerts", "billing_webhook_events", "plan_events", "sales_enquiries", "support_reminders", "billing_invoice_counters"]) {
        const read = await anon.run(`select count(*)::int n from public.${t}`).then((r) => ({ ok: true, n: r.rows[0].n }), (e: Error) => ({ ok: false, n: -1, e: e.message }));
        assert.ok(!read.ok || read.n === 0, `${t}: anonymous read returned ${JSON.stringify(read)}`);
        const write = await anon.run(`delete from public.${t}`).then(() => "ran", (e: Error) => e.message);
        assert.ok(/permission denied|violates|trigger|cannot_be_deleted|row-level/i.test(write) || write === "ran", `${t}: ${write}`);
      }
      assert.equal(await w.count("billing_orders"), 1, "nothing was deleted");
      assert.equal(await w.count("billing_invoices"), 1);
    });

    it("a customer sees only their own workspace's orders, payments and invoices — never another's — and cannot change any", async () => {
      const a = await w.openOrder({ scenes: 5, buyer: uniq({ email: "a@alpha-works.in", company: "Alpha Works" }) });
      const b = await w.openOrder({ scenes: 6, buyer: uniq({ email: "b@beta-works.in", company: "Beta Works" }) });
      await w.payInBrowser(a.body);
      await w.payInBrowser(b.body);
      await w.poll(a.body.orderId);
      await w.poll(b.body.orderId);
      const aAdmin = (await w.q(`select id from public.profiles where email = 'a@alpha-works.in'`))[0].id as string;
      const me = w.sb.as("authenticated", aAdmin);

      for (const t of ["billing_orders", "billing_invoices", "billing_payments"]) {
        const total = Number((await w.q(`select count(*)::int n from public.${t}`))[0].n);
        const mine = (await me.run(`select count(*)::int n from public.${t}`)).rows[0].n;
        assert.equal(total, 2, `${t}: two customers exist`);
        assert.equal(mine, 1, `${t}: but I see only mine`);
      }
      const bOrg = (await w.q(`select org_id from public.billing_orders where id = $1`, [b.body.orderId]))[0].org_id;
      const peek = await me.run(`select * from public.billing_invoices where org_id = $1`, [bOrg]);
      assert.equal(peek.rows.length, 0, "cannot read the other customer's invoice");

      // Writes: refused or affect nothing.
      for (const sql of [
        `update public.billing_orders set amount_paise = 1`,
        `update public.billing_invoices set total_paise = 1`,
        `update public.billing_payments set status = 'refunded'`,
        `delete from public.billing_invoices`,
        `insert into public.billing_alerts (kind, detail) values ('x','y')`,
        `update public.organizations set plan = 'ultra'`,
      ]) {
        const out = await me.run(sql).then((r) => r.rows.length, (e: Error) => `error: ${e.message}`);
        assert.ok(typeof out === "string" || out === 0, `${sql} → ${out}`);
      }
      const [inv] = await w.q(`select total_paise from public.billing_invoices where order_id = $1`, [a.body.orderId]);
      assert.equal(Number(inv.total_paise), 1950000);
      assert.equal((await w.q(`select plan from public.organizations where id = (select org_id from public.billing_orders where id = $1)`, [a.body.orderId]))[0].plan, "basic");
    });

    it("alerts, webhook payloads, refunds and enquiries are visible to the platform owner only", async () => {
      const org = await w.seedOrg({ slug: "peek-co" });
      const user = await w.seedUser({ email: "admin@peek-co.in", orgId: org.id });
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      await w.q(`insert into public.billing_alerts (kind, severity, detail) values ('test', 'info', 'secret detail')`);
      await w.q(`insert into public.sales_enquiries (name, company, email) values ('N', 'C', 'e@x.in')`);
      for (const t of ["billing_alerts", "sales_enquiries", "billing_webhook_events", "billing_refunds", "support_reminders"]) {
        const asUser = (await w.sb.as("authenticated", user).run(`select count(*)::int n from public.${t}`)).rows[0].n;
        assert.equal(asUser, 0, `${t}: a customer sees nothing`);
      }
      assert.equal((await w.sb.as("authenticated", owner).run(`select count(*)::int n from public.billing_alerts`)).rows[0].n, 1);
      assert.equal((await w.sb.as("authenticated", owner).run(`select count(*)::int n from public.sales_enquiries`)).rows[0].n, 1);
    });

    it("the health summary is for the owner only", async () => {
      const org = await w.seedOrg({ slug: "peek-co" });
      const user = await w.seedUser({ email: "admin@peek-co.in", orgId: org.id });
      const owner = await w.seedUser({ email: "owner@vpv.in", role: "owner" });
      const denied = await w.sb.as("authenticated", user).rpc("admin_billing_health", {});
      assert.ok(denied.error);
      assert.match(String(denied.error.message), /platform owner/i);
      const anon = await w.sb.as("anon").rpc("admin_billing_health", {});
      assert.ok(anon.error);
      const ok = await w.sb.as("authenticated", owner).rpc("admin_billing_health", {});
      assert.equal(ok.error, null, JSON.stringify(ok.error));
      assert.ok(ok.data && typeof ok.data === "object");
    });
  });
});
