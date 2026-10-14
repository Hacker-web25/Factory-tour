/**
 * The test "world": an in-memory Postgres running the real migrations, a fake
 * Razorpay/Resend, and helpers to call the real route handlers.
 */

import crypto from "node:crypto";
import { createTestDb, type PgliteSupabase } from "./pgliteSupabase";
import { FakeGateway, TEST_KEY_ID, TEST_KEY_SECRET, TEST_WEBHOOK_SECRET } from "./fakeGateway";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const BUYER = {
  name: "Asha Rao",
  email: "asha@acme-steel.in",
  phone: "+919800000000",
  company: "Acme Steel Pvt Ltd",
  gstin: "",
  address: "12 Industrial Area, Gurugram",
  state: "Haryana",
};

let ipCounter = 0;
export const freshIp = () => `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${++ipCounter & 255}`;

export type World = Awaited<ReturnType<typeof makeWorld>>;

export async function makeWorld() {
  (process.env as any).NODE_ENV = "test";
  process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.CRON_SECRET = "cron_secret_value_for_tests_0123456789";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  delete process.env.VERCEL_ENV;
  delete process.env.RAZORPAY_ALLOW_LIVE_OUTSIDE_PRODUCTION;

  const { sb, raw, reset: resetDb } = await createTestDb(process.cwd());
  const gw = new FakeGateway();
  gw.install();

  const { __setSupabaseAdminForTests } = await import("@/lib/server/supabaseAdmin");
  __setSupabaseAdminForTests(sb as any);
  const { __setAuthenticatorForTests } = await import("@/lib/server/requestAuth");
  const { __resetBillingRateLimitMemory } = await import("@/lib/server/billingGuard");

  // The "session": Authorization: Bearer <profile id> acts as that user.
  __setAuthenticatorForTests(async (r: Request) => {
    const h = r.headers.get("authorization") || "";
    const id = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!id) return null;
    const { data: profile } = await sb.from("profiles").select("id, email, full_name, role, org_id").eq("id", id).maybeSingle();
    if (!profile) return null;
    return { sb: sb.as("authenticated", id) as any, user: { id } as any, profile: profile as any };
  });

  const routes = {
    order: (await import("@/app/api/billing/order/route")) as any,
    confirm: (await import("@/app/api/billing/confirm/route")) as any,
    webhook: (await import("@/app/api/billing/webhook/route")) as any,
    status: (await import("@/app/api/billing/status/route")) as any,
    reconcile: (await import("@/app/api/billing/reconcile/route")) as any,
    enquiry: (await import("@/app/api/billing/enquiry/route")) as any,
    provision: (await import("@/app/api/admin/provision/route")) as any,
    adminBilling: (await import("@/app/api/admin/billing/route")) as any,
  };

  /* ─────────────── request helpers ─────────────── */

  const request = (
    path: string,
    o: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string>; ip?: string; as?: string } = {}
  ) => {
    const method = o.method ?? "POST";
    const headers: Record<string, string> = {
      "x-vpv-ip": o.ip ?? freshIp(),
      ...(method !== "GET" ? { "content-type": "application/json" } : {}),
      ...(o.as ? { authorization: `Bearer ${o.as}` } : {}),
      ...(o.headers ?? {}),
    };
    return new Request(`http://localhost${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : (o.raw ?? JSON.stringify(o.body ?? {})),
    });
  };

  const readJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { _text: text };
    }
  };

  /* ─────────────── seeding ─────────────── */

  const q = async (sql: string, params: unknown[] = []) => (await raw.query(sql, params)).rows;

  async function seedOrg(o: {
    name?: string;
    slug?: string;
    plan?: "basic" | "pro" | "ultra";
    quota?: number | null;
    supportUntil?: string | null;
    planStatus?: string;
    state?: string | null;
  } = {}) {
    const slug = o.slug ?? `org-${crypto.randomBytes(3).toString("hex")}`;
    const rows = await q(
      `insert into public.organizations (name, slug, plan, scene_quota, basic_scene_cap, plan_status, support_until, billing_state)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        o.name ?? "Seed Org",
        slug,
        o.plan ?? "basic",
        o.quota === undefined ? 5 : o.quota,
        Math.min(10, Math.max(1, o.quota ?? 2)),
        o.planStatus ?? "active",
        o.supportUntil === undefined ? new Date(Date.now() + 200 * 86_400_000).toISOString() : o.supportUntil,
        o.state === undefined ? "Haryana" : o.state,
      ]
    );
    return { id: rows[0].id as string, slug };
  }

  async function seedUser(o: { email: string; role?: string; orgId?: string | null; lastSignIn?: boolean }) {
    const u = await q(
      `insert into auth.users (email, encrypted_password, last_sign_in_at) values (lower($1), 'pw:seed', $2) returning id`,
      [o.email, o.lastSignIn ? new Date().toISOString() : null]
    );
    await q(`insert into public.profiles (id, email, full_name, role, org_id) values ($1,$2,$3,$4,$5)`, [
      u[0].id,
      o.email.toLowerCase(),
      "Seed User",
      o.role ?? "org_admin",
      o.orgId ?? null,
    ]);
    return u[0].id as string;
  }

  async function seedTour(orgId: string, scenes: number) {
    const t = await q(`insert into public.tours (org_id, name) values ($1,'Tour') returning id`, [orgId]);
    for (let i = 0; i < scenes; i++) {
      await q(`insert into public.scenes (tour_id, order_index, name) values ($1,$2,$3)`, [t[0].id, i, `Scene ${i + 1}`]);
    }
    return t[0].id as string;
  }

  /* ─────────────── flows ─────────────── */

  /** POST /api/billing/order for a new Basic customer. */
  async function openOrder(o: { scenes?: number; buyer?: Partial<typeof BUYER>; ip?: string } = {}) {
    const res = await routes.order.POST(
      request("/api/billing/order", {
        ip: o.ip,
        body: { purpose: "basic_licence", scenes: o.scenes ?? 5, buyer: { ...BUYER, ...(o.buyer ?? {}) } },
      })
    );
    const body = await readJson(res);
    return { res, body, status: res.status };
  }

  /** The customer completes checkout: gateway captures, browser callback fires. */
  async function payInBrowser(order: { razorpayOrderId: string; orderId: string }, pay?: Parameters<FakeGateway["pay"]>[1]) {
    const p = gw.pay(order.razorpayOrderId, pay);
    const res = await routes.confirm.POST(
      request("/api/billing/confirm", {
        body: {
          orderId: order.orderId,
          razorpay_order_id: order.razorpayOrderId,
          razorpay_payment_id: p.id,
          razorpay_signature: gw.checkoutSignature(order.razorpayOrderId, p.id),
        },
      })
    );
    return { payment: p, res, body: await readJson(res) };
  }

  async function deliver(wh: { body: string; headers: Record<string, string> }) {
    const res = await routes.webhook.POST(
      new Request("http://localhost/api/billing/webhook", { method: "POST", headers: wh.headers, body: wh.body })
    );
    return { res, status: res.status, text: await res.clone().text() };
  }

  async function reconcile(secret = process.env.CRON_SECRET) {
    const res = await routes.reconcile.GET(
      new Request("http://localhost/api/billing/reconcile", {
        method: "GET",
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      })
    );
    return { res, status: res.status, body: await readJson(res) };
  }

  async function poll(orderId: string, ip?: string) {
    const res = await routes.status.GET(request(`/api/billing/status?orderId=${orderId}`, { method: "GET", ip }));
    return { res, status: res.status, body: await readJson(res) };
  }

  /** Deliberately edit a protected billing record (tests only) — the same switch an operator would use. */
  async function unprotected<T>(fn: () => Promise<T>): Promise<T> {
    await raw.query(`select set_config('vpv.allow_billing_delete', 'on', false)`);
    try {
      return await fn();
    } finally {
      await raw.query(`select set_config('vpv.allow_billing_delete', '', false)`);
    }
  }

  /* ─────────────── inspection ─────────────── */

  const count = async (table: string, where = "true", params: unknown[] = []) =>
    Number((await q(`select count(*)::int as n from public.${table} where ${where}`, params))[0].n);

  async function reset() {
    await resetDb();
    gw.reset();
    __resetBillingRateLimitMemory();
  }

  return { sb: sb as PgliteSupabase, raw, q, unprotected, gw, routes, request, readJson, seedOrg, seedUser, seedTour, openOrder, payInBrowser, deliver, reconcile, poll, count, reset };
}
