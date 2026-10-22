// Quick manual check: apply base schema + real migrations to a fresh in-memory Postgres.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const db = new PGlite();
const files = [
  "tests/billing/harness/baseSchema.sql",
  "supabase/plan_tiers.sql",
  "supabase/rate_limits_and_audit.sql",
  "supabase/billing.sql",
  "supabase/billing_hardening.sql",
  "supabase/coupons.sql",
  "supabase/funnel.sql",
];
for (const f of files) {
  try {
    await db.exec(fs.readFileSync(path.join(root, f), "utf8"));
    console.log("OK   ", f);
  } catch (e) {
    console.log("FAIL ", f, "\n      ", e.message, e.position ? "(pos " + e.position + ")" : "");
    process.exit(1);
  }
}
const r = await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'billing_%'");
console.log("billing_* functions:", r.rows[0].n);
