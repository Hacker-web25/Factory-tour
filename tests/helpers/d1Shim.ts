/**
 * A pretend Cloudflare D1 database backed by a real SQLite engine (node:sqlite).
 *
 * D1 is SQLite, so running the Worker's actual SQL here proves the statements
 * (upserts, JSON functions, batch transactions) work, not just that the
 * JavaScript around them runs. Mirrors the parts of the D1 API the Worker uses:
 * prepare().bind().first() / all() / run(), and batch() as one transaction.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;

class Stmt {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: unknown[] = []
  ) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params);
  }
  async first(col?: string) {
    const row = this.db.prepare(this.sql).get(...(this.params as never[])) as Row | undefined;
    if (!row) return null;
    return col ? row[col] : row;
  }
  async all() {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[])) as Row[];
    return { results: rows, success: true, meta: { changes: 0 } };
  }
  async run() {
    return this.runSync();
  }
  runSync() {
    const info = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { results: [] as Row[], success: true, meta: { changes: Number(info.changes) } };
  }
  allSync() {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[])) as Row[];
    return { results: rows, success: true, meta: { changes: 0 } };
  }
  isRead() {
    return /^\s*(select|with)\b/i.test(this.sql);
  }
}

export class D1Shim {
  readonly raw: DatabaseSync;
  constructor() {
    this.raw = new DatabaseSync(":memory:");
  }
  prepare(sql: string) {
    return new Stmt(this.raw, sql);
  }
  /** One transaction: if any statement throws, none of them stays. */
  async batch(stmts: Stmt[]) {
    this.raw.exec("BEGIN");
    try {
      const out = stmts.map((s) => (s.isRead() ? s.allSync() : s.runSync()));
      this.raw.exec("COMMIT");
      return out;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
  exec(sql: string) {
    this.raw.exec(sql);
  }
}

/** A fresh database with the real schema file applied. */
export function newLanguageDb(): D1Shim {
  const db = new D1Shim();
  db.exec(readFileSync(path.join(process.cwd(), "cloudflare", "language-schema.sql"), "utf8"));
  return db;
}
