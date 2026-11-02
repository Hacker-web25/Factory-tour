/**
 * lib/server/backupStore.ts — talk to the private backup Worker. SERVER ONLY.
 *
 * A second, separate Cloudflare Worker from the media one in lib/media.ts — see
 * cloudflare/backup-worker.js and cloudflare/BACKUPS.md. It is never reached from a
 * browser, so there is no need for the media Worker's short-lived upload slips: one
 * long-lived secret (BACKUP_UPLOAD_SECRET), known only to this server and to the
 * Worker, is checked on every request including reads — unlike tour pictures, a
 * backup holds every customer's data and is never public.
 *
 * `BACKUP_BASE_URL` empty = not set up yet; every function below then resolves to
 * `{ ok: false, reason: "not_configured" }` rather than throwing, so the nightly
 * cron route can report that plainly instead of erroring on a fresh install.
 */

// Read fresh each call, not cached at import time: in production the env is set
// before this module is ever loaded, so it makes no difference there, but it lets
// a test (or a future admin toggle) change these without re-importing the module.
function base(): string {
  return (process.env.BACKUP_BASE_URL || "").trim().replace(/\/+$/, "");
}
function secretValue(): string {
  return process.env.BACKUP_UPLOAD_SECRET || "";
}

export function backupStoreConfigured(): boolean {
  return Boolean(base() && secretValue());
}

type Ok<T> = { ok: true } & T;
type NoExtra = Record<never, never>;
type Err = { ok: false; reason: string };

function auth(): HeadersInit {
  return { authorization: `Bearer ${secretValue()}` };
}

export async function putBackup(filename: string, body: Buffer): Promise<Ok<NoExtra> | Err> {
  if (!backupStoreConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(`${base()}/${filename}`, {
      method: "PUT",
      headers: { ...auth(), "content-type": "application/gzip" },
      body: new Uint8Array(body),
    });
    if (!res.ok) return { ok: false, reason: `upload ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "upload failed" };
  }
}

export type BackupListing = { key: string; size: number; uploaded: string };

export async function listBackups(): Promise<Ok<{ files: BackupListing[] }> | Err> {
  if (!backupStoreConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(`${base()}/`, { headers: auth(), cache: "no-store" });
    if (!res.ok) return { ok: false, reason: `list ${res.status}` };
    const body = (await res.json().catch(() => null)) as { files?: unknown } | null;
    const files = Array.isArray(body?.files)
      ? (body!.files as unknown[]).filter(
          (f): f is BackupListing =>
            !!f && typeof f === "object" && typeof (f as BackupListing).key === "string" && typeof (f as BackupListing).size === "number"
        )
      : [];
    return { ok: true, files };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "list failed" };
  }
}

export async function deleteBackup(filename: string): Promise<Ok<NoExtra> | Err> {
  if (!backupStoreConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(`${base()}/${filename}`, { method: "DELETE", headers: auth() });
    if (!res.ok && res.status !== 404) return { ok: false, reason: `delete ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "delete failed" };
  }
}

/** Oldest-first keys beyond `keep` most recent — file names sort chronologically
 *  (backupFilename uses an ISO-shaped timestamp), so a plain string sort is enough. */
export function backupsToPrune(files: BackupListing[], keep: number): string[] {
  const sorted = [...files].map((f) => f.key).sort();
  return sorted.length > keep ? sorted.slice(0, sorted.length - keep) : [];
}
