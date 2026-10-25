import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, BUYER, type World } from "./harness/world";

/**
 * Real Supabase projects often carry a trigger that writes a profile row the moment
 * ANY login is created, and some give that row the "owner" role by default. A paid
 * order's own brand-new login must not be mistaken for the platform owner (that made
 * every real purchase stop with "email_in_use"), while a login that was NOT made by
 * the order must still be refused.
 */
describe("a database trigger that makes new logins 'owner' by default", () => {
  let w: World;
  before(async () => {
    w = await makeWorld();
    await w.q(`
      create or replace function public.handle_new_user_test() returns trigger language plpgsql as $$
      begin
        insert into public.profiles (id, email, role) values (new.id, new.email, 'owner') on conflict (id) do nothing;
        return new;
      end $$`);
    await w.q(`create trigger on_auth_user_created_test after insert on auth.users for each row execute function public.handle_new_user_test()`);
  });
  beforeEach(async () => {
    await w.reset();
    w.sb.clearFailures();
  });
  after(async () => {
    await w.q(`drop trigger if exists on_auth_user_created_test on auth.users`);
    w.gw.uninstall();
  });

  it("a fresh buyer still gets a workspace, a first password and an invoice, as org admin (not owner)", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    assert.ok(order.orderId, JSON.stringify(order));
    await w.payInBrowser(order);
    assert.equal((await w.poll(order.orderId)).body.status, "ready");

    const [p] = await w.q(`select role, org_id from public.profiles where lower(email) = lower($1)`, [BUYER.email]);
    assert.equal(p.role, "org_admin", "the trigger's default role is replaced, never kept");
    assert.ok(p.org_id, "attached to the new workspace");
    const mails = w.gw.emailsTo(BUYER.email);
    assert.ok(mails.some((m) => /workspace is ready/i.test(m.subject)), "welcome e-mail sent");
    assert.ok(mails.some((m) => /invoice/i.test(m.subject)), "invoice e-mail sent");
  });

  it("a crash after the login was made is recovered on retry, still as org admin", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    // the profile write fails once, after the login (and the trigger's 'owner' profile) exist
    w.sb.failNext("from:profiles", 1);
    await w.payInBrowser(order);
    await w.reconcile();
    await w.reconcile();
    assert.equal((await w.poll(order.orderId)).body.status, "ready");
    const [p] = await w.q(`select role, org_id from public.profiles where lower(email) = lower($1)`, [BUYER.email]);
    assert.equal(p.role, "org_admin");
  });

  it("an existing owner login that the order did not create is still refused", async () => {
    const { body: order } = await w.openOrder({ scenes: 5 });
    assert.ok(order.orderId);
    // someone else's login for that address appears before the build runs (no order stamp on it)
    await w.q(`insert into auth.users (email, raw_user_meta_data) values (lower($1), '{}'::jsonb)`, [BUYER.email]);
    await w.payInBrowser(order);
    const o = (await w.q(`select review_flag, status from public.billing_orders limit 1`))[0];
    assert.equal(o.review_flag, "email_in_use");
    assert.equal((await w.q(`select role from public.profiles where lower(email) = lower($1)`, [BUYER.email]))[0].role, "owner");
  });
});
