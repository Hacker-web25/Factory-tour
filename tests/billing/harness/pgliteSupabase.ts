/**
 * A small stand-in for supabase-js that runs the REAL billing SQL on an
 * in-memory Postgres (PGlite). Only the slice of the client the server code
 * uses is implemented: from().select/insert/update/upsert/delete with the
 * common filters, rpc(), and auth.admin.*.
 *
 * It exists so the tests exercise the actual migrations and the actual
 * route handlers — not mocks of them.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Role = "service" | "anon" | "authenticated";

type PGliteLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }>;
  exec: (sql: string) => Promise<unknown>;
  transaction: <T>(fn: (tx: PGliteLike) => Promise<T>) => Promise<T>;
};

export async function loadPGlite(): Promise<any> {
  const dir =
    process.env.PGLITE_DIR || path.join(os.homedir(), "vpv-test-tools", "node_modules", "@electric-sql", "pglite");
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const entry = pkg.exports?.["."]?.import?.default ?? pkg.exports?.["."]?.import ?? pkg.module ?? pkg.main;
  const entryPath = typeof entry === "string" ? entry : "dist/index.js";
  return import(pathToFileURL(path.join(dir, entryPath)).href);
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

type Filter = { sql: (push: (v: unknown) => string) => string };

class Query implements PromiseLike<any> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private rows: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> = {};
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private conflict: string | null = null;

  constructor(private readonly client: PgliteSupabase, private readonly table: string) {}

  select(cols = "*") {
    if (this.op === "select") this.columns = cols;
    else {
      this.returning = true;
      this.columns = cols;
    }
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], opts: { onConflict?: string } = {}) {
    this.op = "upsert";
    this.rows = Array.isArray(values) ? values : [values];
    this.conflict = opts.onConflict ?? "id";
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.patch = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private add(col: string, f: (c: string, push: (v: unknown) => string) => string) {
    this.filters.push({ sql: (push) => f(ident(col), push) });
    return this;
  }
  eq(col: string, v: unknown) {
    return this.add(col, (c, p) => `${c} = ${p(v)}`);
  }
  neq(col: string, v: unknown) {
    return this.add(col, (c, p) => `${c} <> ${p(v)}`);
  }
  lt(col: string, v: unknown) {
    return this.add(col, (c, p) => `${c} < ${p(v)}`);
  }
  lte(col: string, v: unknown) {
    return this.add(col, (c, p) => `${c} <= ${p(v)}`);
  }
  gt(col: string, v: unknown) {
    return this.add(col, (c, p) => `${c} > ${p(v)}`);
  }
  gte(col: string, v: unknown) {
    return this.add(col, (c, p) => `${c} >= ${p(v)}`);
  }
  in(col: string, vs: unknown[]) {
    return this.add(col, (c, p) => (vs.length ? `${c} in (${vs.map(p).join(",")})` : "false"));
  }
  is(col: string, v: null | boolean) {
    return this.add(col, (c) => `${c} is ${v === null ? "null" : v ? "true" : "false"}`);
  }
  not(col: string, op: string, v: unknown) {
    if (op === "is") return this.add(col, (c) => `${c} is not ${v === null ? "null" : String(v)}`);
    if (op === "eq") return this.add(col, (c, p) => `${c} <> ${p(v)}`);
    throw new Error(`not(${op}) unsupported in test adapter`);
  }
  ilike(col: string, v: string) {
    return this.add(col, (c, p) => `${c} ilike ${p(v)}`);
  }
  like(col: string, v: string) {
    return this.add(col, (c, p) => `${c} like ${p(v)}`);
  }
  or(expr: string) {
    const parts = expr.split(",").map((term) => {
      const m = term.match(/^([a-z_][a-z0-9_]*)\.(is|eq|neq|lt|gt)\.(.*)$/);
      if (!m) throw new Error(`or() term unsupported: ${term}`);
      return m;
    });
    this.filters.push({
      sql: (push) =>
        "(" +
        parts
          .map(([, col, op, val]) => {
            const c = ident(col);
            if (op === "is") return `${c} is ${val === "null" ? "null" : val}`;
            const sym = { eq: "=", neq: "<>", lt: "<", gt: ">" }[op as "eq"];
            return `${c} ${sym} ${push(val)}`;
          })
          .join(" or ") +
        ")",
    });
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push(`${ident(col)} ${opts.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private build(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const push = (v: unknown) => {
      params.push(toParam(v));
      return `$${params.length}`;
    };
    const t = `public.${ident(this.table)}`;
    const where = this.filters.length ? " where " + this.filters.map((f) => f.sql(push)).join(" and ") : "";
    const cols =
      this.columns === "*"
        ? "*"
        : this.columns
            .split(",")
            .map((c) => ident(c.trim()))
            .join(", ");
    const ret = this.returning ? ` returning ${cols}` : "";

    switch (this.op) {
      case "select": {
        const ord = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
        const lim = this.limitN !== null ? ` limit ${this.limitN}` : "";
        return { sql: `select ${cols} from ${t}${where}${ord}${lim}`, params };
      }
      case "insert":
      case "upsert": {
        const keys = Array.from(new Set(this.rows.flatMap((r) => Object.keys(r))));
        const colsSql = keys.map(ident).join(", ");
        const valsSql = this.rows
          .map((r) => "(" + keys.map((k) => (k in r ? push(r[k]) : "default")).join(", ") + ")")
          .join(", ");
        let sql = `insert into ${t} (${colsSql}) values ${valsSql}`;
        if (this.op === "upsert") {
          const target = (this.conflict as string).split(",").map((c) => ident(c.trim())).join(", ");
          const sets = keys
            .filter((k) => !(this.conflict as string).split(",").map((c) => c.trim()).includes(k))
            .map((k) => `${ident(k)} = excluded.${ident(k)}`);
          sql += sets.length ? ` on conflict (${target}) do update set ${sets.join(", ")}` : ` on conflict (${target}) do nothing`;
        }
        return { sql: sql + ret, params };
      }
      case "update": {
        const keys = Object.keys(this.patch);
        const sets = keys.map((k) => `${ident(k)} = ${push(this.patch[k])}`).join(", ");
        return { sql: `update ${t} set ${sets}${where}${ret}`, params };
      }
      case "delete":
        return { sql: `delete from ${t}${where}${ret}`, params };
    }
  }

  async execute(): Promise<{ data: any; error: any }> {
    try {
      const { sql, params } = this.build();
      const res = await this.client.run(sql, params);
      const wantsRows = this.op === "select" || this.returning;
      if (!wantsRows) return { data: null, error: null };
      const rows = res.rows;
      if (this.mode === "single") {
        if (rows.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
        return { data: rows[0], error: null };
      }
      if (this.mode === "maybe") {
        if (rows.length > 1) return { data: null, error: { message: "multiple rows returned", code: "PGRST116" } };
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message, code: e.code, details: e.detail } };
    }
  }

  then<R1 = any, R2 = never>(
    onfulfilled?: ((value: any) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export class PgliteSupabase {
  readonly auth: any;
  /** When set, the next N calls to the named method fail (for failure-injection tests). */
  private injected = new Map<string, { remaining: number; skip?: number; error: { message: string; code?: string } }>();
  calls: string[] = [];

  constructor(
    readonly db: PGliteLike,
    private readonly role: Role = "service",
    private readonly claims: { sub?: string } = {},
    shared?: { injected: Map<string, any>; calls: string[] }
  ) {
    if (shared) {
      this.injected = shared.injected;
      this.calls = shared.calls;
    }
    this.auth = {
      admin: {
        createUser: async (a: { email: string; password?: string; email_confirm?: boolean; user_metadata?: any }) => {
          const inj = this.takeInjected("auth.createUser");
          if (inj) return { data: { user: null }, error: inj };
          try {
            const r = await this.run(
              `insert into auth.users (email, encrypted_password, raw_user_meta_data) values (lower($1), $2, $3::jsonb) returning id, email`,
              [a.email, a.password ? `pw:${a.password}` : null, JSON.stringify(a.user_metadata ?? {})]
            );
            return { data: { user: r.rows[0] }, error: null };
          } catch (e: any) {
            const dup = e.code === "23505";
            return {
              data: { user: null },
              error: { message: dup ? "A user with this email address has already been registered" : e.message, code: dup ? "email_exists" : e.code },
            };
          }
        },
        getUserById: async (id: string) => {
          const r = await this.run(
            `select id, email, last_sign_in_at, encrypted_password, raw_user_meta_data as user_metadata from auth.users where id = $1`,
            [id]
          );
          const u = r.rows[0];
          return { data: { user: u ?? null }, error: u ? null : { message: "not found" } };
        },
        updateUserById: async (id: string, attrs: { password?: string }) => {
          const inj = this.takeInjected("auth.updateUser");
          if (inj) return { data: { user: null }, error: inj };
          if (attrs.password) {
            await this.run(`update auth.users set encrypted_password = $2 where id = $1`, [id, `pw:${attrs.password}`]);
          }
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          await this.run(`delete from auth.users where id = $1`, [id]);
          return { data: null, error: null };
        },
      },
      getUser: async () => ({ data: { user: null }, error: { message: "unsupported in tests" } }),
    };
  }

  /** Make the next `times` calls of `what` fail — "rpc:<fn>", "auth.createUser", "auth.updateUser", "from:<table>". */
  failNext(
    what: string,
    times = 1,
    error: { message: string; code?: string } = { message: "injected failure" },
    skip = 0
  ) {
    // `skip` lets the first N calls through, so a specific step in a sequence can be failed.
    this.injected.set(what, { remaining: times, skip, error });
  }
  clearFailures() {
    this.injected.clear();
  }
  private takeInjected(what: string) {
    const i = this.injected.get(what);
    if (!i || i.remaining <= 0) return null;
    if (i.skip && i.skip > 0) {
      i.skip -= 1;
      return null;
    }
    i.remaining -= 1;
    return i.error;
  }

  /** Run SQL as this client's role (service = unrestricted, like Supabase's service_role). */
  async run(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    if (this.role === "service") return this.db.query(sql, params);
    return this.db.transaction(async (tx) => {
      await tx.query(`set local role ${this.role}`);
      if (this.claims.sub) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [this.claims.sub]);
      return tx.query(sql, params);
    });
  }

  from(table: string) {
    const inj = this.takeInjected(`from:${table}`);
    const q = new Query(this, table);
    if (inj) {
      // Return a query that resolves to the injected error.
      const failing = Object.create(q);
      failing.execute = async () => ({ data: null, error: inj });
      failing.then = (a: any, b: any) => failing.execute().then(a, b);
      return failing as Query;
    }
    return q;
  }

  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<{ data: any; error: any }> {
    this.calls.push(fn);
    const inj = this.takeInjected(`rpc:${fn}`);
    if (inj) return { data: null, error: inj };
    try {
      const meta = await this.db.query(
        `select p.proretset as is_set, t.typname as ret
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
          where n.nspname = 'public' and p.proname = $1 limit 1`,
        [fn]
      );
      if (meta.rows.length === 0) return { data: null, error: { message: `function public.${fn} does not exist`, code: "PGRST202" } };
      const keys = Object.keys(args);
      const params = keys.map((k) => toParam(args[k]));
      const named = keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ");
      const { is_set: isSet, ret } = meta.rows[0];
      const call = `public.${ident(fn)}(${named})`;
      if (isSet) {
        const r = await this.run(`select * from ${call}`, params);
        return { data: r.rows, error: null };
      }
      const r = await this.run(`select ${call} as v`, params);
      return { data: ret === "void" ? null : r.rows[0]?.v ?? null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message, code: e.code, details: e.detail } };
    }
  }

  /** A client that behaves like a browser: runs as `anon` or as a signed-in user, subject to RLS and GRANTs. */
  as(role: "anon" | "authenticated", sub?: string) {
    return new PgliteSupabase(this.db, role, { sub }, { injected: this.injected, calls: this.calls });
  }
}

/* ───────────────────── database lifecycle ────────────────────────── */

export type TestDb = { raw: PGliteLike; sb: PgliteSupabase; reset: () => Promise<void> };

export async function createTestDb(repoRoot: string): Promise<TestDb> {
  const mod = await loadPGlite();
  const { PGlite, types } = mod;
  const db: PGliteLike = new PGlite({
    parsers: {
      [types.INT8]: (v: string) => Number(v),
      [types.NUMERIC]: (v: string) => Number(v),
      // supabase-js hands back ISO strings, not Date objects.
      [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
      [types.TIMESTAMP]: (v: string) => new Date(v + "Z").toISOString(),
    },
  });

  const files = [
    "tests/billing/harness/baseSchema.sql",
    "supabase/plan_tiers.sql",
    "supabase/rate_limits_and_audit.sql",
    "supabase/billing.sql",
    "supabase/billing_hardening.sql",
    "tests/billing/harness/rlsSchema.sql",
    "supabase/coupons.sql",
    "supabase/funnel.sql",
  ];
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(path.join(repoRoot, f), "utf8"));
    } catch (e: any) {
      throw new Error(`migration failed: ${f}: ${e.message}`);
    }
  }

  const sb = new PgliteSupabase(db);
  const reset = async () => {
    const t = await db.query(
      `select schemaname, tablename from pg_tables
        where (schemaname = 'public') or (schemaname = 'auth' and tablename = 'users')`
    );
    const list = t.rows.map((r) => `${r.schemaname}.${r.tablename}`).join(", ");
    if (list) await db.exec(`truncate ${list} restart identity cascade`);
    sb.clearFailures();
    sb.calls.length = 0;
  };
  return { raw: db, sb, reset };
}
