/**
 * lib/server/inboxDb.ts — everything the VPV Inbox does to the database. SERVER ONLY.
 *
 * Route handlers stay thin and call these. All reads and writes use the
 * service-role client, so every entry point checks the caller FIRST
 * (inboxGuard) or is the signed webhook (processInbound).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authenticateRequest } from "@/lib/server/requestAuth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, UUID_RE } from "@/lib/server/billingGuard";
import { fetchReceivedEmail, sendMail } from "@/lib/server/inboxMailer";
import {
  DEFAULT_SETTINGS,
  automatedReason,
  buildAck,
  buildReply,
  cleanSubject,
  dueFor,
  htmlToText,
  isOwnAddress,
  parseAddress,
  quoteForReply,
  replySubject,
  ticketFromSubject,
  type InboxSettings,
} from "@/lib/inboxMail";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const MIGRATION_HINT = "Run supabase/inbox.sql in the Supabase SQL editor: it creates the inbox tables.";

/** A relation that does not exist yet (the SQL has not been run). */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /relation .* does not exist|schema cache/i.test(err.message ?? "");
}

/* ───────────────────────────── who may use it ───────────────────────────── */

export type Staff = {
  sb: SupabaseClient;
  /** Lower-case e-mail of the signed-in person. */
  email: string;
  name: string;
  isOwner: boolean;
  /** Owner, or a member whose role is admin: may change the auto-reply. */
  isAdmin: boolean;
};

/**
 * The platform owner, or a person the owner added in the inbox members list,
 * signed in with a CONFIRMED e-mail address (so nobody can claim a colleague's
 * address by signing up with it).
 */
type Viewer = { email: string; name: string; confirmed: boolean; isOwner: boolean };

/**
 * Who is calling? A person with a VPV profile is read from it. A teammate who
 * only signed in (for example with Google) may have no profile row at all, and
 * that must not lock them out of the inbox, so the token alone is checked then.
 */
async function viewerOf(req: Request): Promise<Viewer | null> {
  const auth = await authenticateRequest(req);
  if (auth) {
    const email = String(auth.user.email || auth.profile.email || "").trim().toLowerCase();
    return {
      email,
      name: auth.profile.full_name || email,
      confirmed: Boolean(auth.user.email_confirmed_at),
      isOwner: auth.profile.role === "owner",
    };
  }
  if (process.env.NODE_ENV === "test") return null;

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || token.length > 4096 || !url || !anon) return null;
  const { data, error } = await createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth.getUser(token);
  if (error || !data?.user?.email) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const email = data.user.email.trim().toLowerCase();
  return {
    email,
    name: String(meta.full_name ?? meta.name ?? email),
    confirmed: Boolean(data.user.email_confirmed_at),
    // The owner always has a profile; without one nobody is the owner.
    isOwner: false,
  };
}

/**
 * The platform owner, or a person the owner added in the inbox members list,
 * signed in with a CONFIRMED e-mail address (so nobody can claim a colleague's
 * address by signing up with it).
 */
export async function inboxGuard(
  req: Request,
  opts: { admin?: boolean; owner?: boolean } = {}
): Promise<{ staff: Staff } | { error: Response }> {
  const v = await viewerOf(req);
  if (!v) return { error: fail(401, "unauthorized") };
  const sb = supabaseAdmin();
  if (!sb) return { error: fail(503, "not_configured", "SUPABASE_SERVICE_ROLE_KEY is not set.") };

  if (v.isOwner) return { staff: { sb, email: v.email, name: v.name, isOwner: true, isAdmin: true } };
  if (opts.owner) return { error: fail(403, "forbidden", "Platform owner only.") };

  if (!v.email || !v.confirmed) {
    return { error: fail(403, "forbidden", "Confirm your e-mail address to use the inbox.") };
  }
  const { data, error } = await sb.from("inbox_members").select("email, name, role").eq("email", v.email).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { error: fail(503, "migration_needed", MIGRATION_HINT) };
    return { error: fail(500, "server_error") };
  }
  if (!data) return { error: fail(403, "forbidden", "You have not been added to the inbox.") };
  const isAdmin = (data as any).role === "admin";
  if (opts.admin && !isAdmin) return { error: fail(403, "forbidden", "Inbox admins only.") };
  return { staff: { sb, email: v.email, name: (data as any).name || v.name, isOwner: false, isAdmin } };
}

/* ───────────────────────────── settings ───────────────────────────── */

export async function loadSettings(sb: SupabaseClient): Promise<InboxSettings> {
  const { data } = await sb.from("inbox_settings").select("*").eq("id", true).maybeSingle();
  if (!data) return { ...DEFAULT_SETTINGS };
  const d = data as any;
  return {
    support_address: String(d.support_address || DEFAULT_SETTINGS.support_address),
    from_name: String(d.from_name || DEFAULT_SETTINGS.from_name),
    ack_enabled: d.ack_enabled !== false,
    ack_body: String(d.ack_body || DEFAULT_SETTINGS.ack_body),
    reply_target_hours: Number(d.reply_target_hours) || DEFAULT_SETTINGS.reply_target_hours,
    office_start_hour: Number.isInteger(Number(d.office_start_hour)) ? Number(d.office_start_hour) : DEFAULT_SETTINGS.office_start_hour,
    office_end_hour: Number(d.office_end_hour) || DEFAULT_SETTINGS.office_end_hour,
    office_days: Array.isArray(d.office_days) ? d.office_days.map(Number) : DEFAULT_SETTINGS.office_days,
    tz_offset_min: Number.isFinite(Number(d.tz_offset_min)) ? Number(d.tz_offset_min) : DEFAULT_SETTINGS.tz_offset_min,
    signature: String(d.signature ?? DEFAULT_SETTINGS.signature),
  };
}

function intIn(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Validate a settings change. Returns the clean patch, or the first problem. */
export function parseSettingsPatch(b: Record<string, unknown>): { ok: true; patch: Record<string, unknown> } | { ok: false; message: string } {
  const patch: Record<string, unknown> = {};
  if ("from_name" in b) {
    const s = String(b.from_name ?? "").replace(/[\r\n"<>]/g, " ").trim();
    if (!s || s.length > 60) return { ok: false, message: "Sender name must be 1 to 60 characters." };
    patch.from_name = s;
  }
  if ("ack_enabled" in b) {
    if (typeof b.ack_enabled !== "boolean") return { ok: false, message: "ack_enabled must be true or false." };
    patch.ack_enabled = b.ack_enabled;
  }
  if ("ack_body" in b) {
    const s = String(b.ack_body ?? "").replace(/\r/g, "").trim();
    if (s.length < 10 || s.length > 2000) return { ok: false, message: "The automatic reply must be 10 to 2000 characters." };
    patch.ack_body = s;
  }
  if ("signature" in b) {
    const s = String(b.signature ?? "").replace(/\r/g, "").trim();
    if (s.length > 500) return { ok: false, message: "Signature is too long (500 characters)." };
    patch.signature = s;
  }
  if ("reply_target_hours" in b) {
    const n = intIn(b.reply_target_hours, 1, 240);
    if (n === null) return { ok: false, message: "Reply target must be 1 to 240 hours." };
    patch.reply_target_hours = n;
  }
  for (const k of ["office_start_hour", "office_end_hour"] as const) {
    if (k in b) {
      const n = intIn(b[k], k === "office_start_hour" ? 0 : 1, k === "office_start_hour" ? 23 : 24);
      if (n === null) return { ok: false, message: "Office hours must be whole hours." };
      patch[k] = n;
    }
  }
  if ("office_days" in b) {
    const arr = Array.isArray(b.office_days) ? b.office_days.map(Number) : [];
    const days = Array.from(new Set(arr)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (!days.length || days.length !== arr.length) return { ok: false, message: "Pick at least one working day." };
    patch.office_days = days;
  }
  if ("tz_offset_min" in b) {
    const n = intIn(b.tz_offset_min, -720, 840);
    if (n === null) return { ok: false, message: "Time zone offset is out of range." };
    patch.tz_offset_min = n;
  }
  return { ok: true, patch };
}

/* ───────────────────────────── receiving ───────────────────────────── */

export type InboundResult =
  | { status: "stored"; threadId: string; ticketNo: number; isNew: boolean; acked: boolean }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string }
  | { status: "fetch_failed" };

const MAX_ACKS_PER_SENDER_PER_HOUR = 3;
// Resend's free plan sends 100 mails a day, and invoices and sign-in codes share it.
const MAX_ACKS_PER_DAY = 60;

function messageIdList(...vals: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of vals) for (const m of String(v ?? "").match(/<[^<>\s]{1,300}>/g) ?? []) out.add(m);
  return Array.from(out).slice(0, 20);
}

export async function processInbound(sb: SupabaseClient, emailId: string, now = new Date()): Promise<InboundResult> {
  // Already stored (Resend delivers a webhook more than once now and then).
  const dup = await sb.from("inbox_messages").select("id").eq("provider_id", emailId).maybeSingle();
  if (dup.data) return { status: "duplicate" };

  const mail = await fetchReceivedEmail(emailId);
  if (!mail) return { status: "fetch_failed" };

  const from = parseAddress(mail.from);
  if (!from) return { status: "ignored", reason: "no sender" };

  const settings = await loadSettings(sb);
  const text = (mail.text || htmlToText(mail.html)).slice(0, 100_000);
  const subject = cleanSubject(mail.subject);
  const robot = automatedReason({ from: from.email, subject: mail.subject, headers: mail.headers });
  const own = isOwnAddress(from.email) || from.email === settings.support_address.toLowerCase();

  /* which conversation is this? 1) the [VPV-1042] tag  2) the mail it answers  3) a new one */
  let thread: any = null;
  const tag = ticketFromSubject(mail.subject);
  if (tag !== null) {
    const { data } = await sb.from("inbox_threads").select("*").eq("ticket_no", tag).maybeSingle();
    if (data && (data as any).customer_email === from.email) thread = data;
  }
  if (!thread) {
    const ids = messageIdList(mail.inReplyTo, mail.references);
    if (ids.length) {
      const { data: hit } = await sb.from("inbox_messages").select("thread_id").in("message_id", ids).limit(1);
      const tid = (hit as any[] | null)?.[0]?.thread_id;
      if (tid) {
        const { data } = await sb.from("inbox_threads").select("*").eq("id", tid).maybeSingle();
        if (data && (data as any).customer_email === from.email) thread = data;
      }
    }
  }

  const isNew = !thread;
  if (!thread) {
    const due = dueFor(now, settings);
    const { data, error } = await sb
      .from("inbox_threads")
      .insert({
        subject,
        customer_email: from.email,
        customer_name: from.name || null,
        status: "open",
        message_count: 0,
        unread: true,
        first_inbound_at: now.toISOString(),
        last_message_at: now.toISOString(),
        last_inbound_at: now.toISOString(),
        due_at: due.toISOString(),
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(`inbox thread insert failed: ${error?.message ?? "unknown"}`);
    thread = data;
  }

  const attachments = mail.attachments;
  const ins = await sb.from("inbox_messages").insert({
    thread_id: thread.id,
    direction: "in",
    kind: "mail",
    provider_id: emailId,
    message_id: mail.messageId,
    in_reply_to: mail.inReplyTo,
    refs: mail.references,
    from_email: from.email,
    from_name: from.name || null,
    to_emails: mail.to,
    cc_emails: mail.cc,
    subject: mail.subject.slice(0, 500),
    text_body: text,
    html_body: mail.html ? mail.html.slice(0, 500_000) : null,
    attachments,
    created_at: now.toISOString(),
  });
  if (ins.error) {
    if (isNew) await sb.from("inbox_threads").delete().eq("id", thread.id);
    // The same message arrived twice at once: the other copy won.
    if (ins.error.code === "23505") return { status: "duplicate" };
    throw new Error(`inbox message insert failed: ${ins.error.message}`);
  }

  // A new message from the customer reopens a solved or waiting conversation
  // (spam stays spam).
  const reopen = thread.status === "solved" || thread.status === "waiting";
  await sb
    .from("inbox_threads")
    .update({
      message_count: Number(thread.message_count || 0) + 1,
      unread: true,
      last_message_at: now.toISOString(),
      last_inbound_at: now.toISOString(),
      updated_at: now.toISOString(),
      ...(reopen ? { status: "open" } : {}),
      ...(!isNew && reopen ? { due_at: dueFor(now, settings).toISOString() } : {}),
      ...(thread.customer_name || !from.name ? {} : { customer_name: from.name }),
    })
    .eq("id", thread.id);

  /* the automatic acknowledgement: new conversations only, people only */
  let acked = false;
  if (isNew && settings.ack_enabled && !robot && !own) acked = await sendAck(sb, thread, from, mail, settings, now);

  return { status: "stored", threadId: thread.id, ticketNo: Number(thread.ticket_no), isNew, acked };
}

async function sendAck(
  sb: SupabaseClient,
  thread: any,
  from: { email: string; name: string },
  mail: { messageId: string | null; references: string | null },
  settings: InboxSettings,
  now: Date
): Promise<boolean> {
  // Brakes: a sender cannot make us mail them in a loop, and a flood cannot
  // use up the day's sending allowance.
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const recent = await sb.from("inbox_threads").select("id").eq("customer_email", from.email).gte("ack_sent_at", hourAgo).limit(MAX_ACKS_PER_SENDER_PER_HOUR);
  if ((recent.data?.length ?? 0) >= MAX_ACKS_PER_SENDER_PER_HOUR) return false;
  const today = await sb.from("inbox_threads").select("id").gte("ack_sent_at", dayAgo).limit(MAX_ACKS_PER_DAY);
  if ((today.data?.length ?? 0) >= MAX_ACKS_PER_DAY) return false;

  const due = new Date(thread.due_at);
  const ack = buildAck(settings, { name: from.name, ticketNo: Number(thread.ticket_no), subject: thread.subject, due, now });
  const sent = await sendMail({
    fromName: settings.from_name,
    fromAddress: settings.support_address,
    to: from.email,
    subject: ack.subject,
    text: ack.text,
    html: ack.html,
    inReplyTo: mail.messageId,
    references: [mail.references, mail.messageId].filter(Boolean).join(" ") || null,
    automatic: true,
  });
  await sb.from("inbox_messages").insert({
    thread_id: thread.id,
    direction: "out",
    kind: "ack",
    provider_id: sent.ok && sent.id ? sent.id : null,
    from_email: settings.support_address,
    from_name: settings.from_name,
    to_emails: [from.email],
    subject: ack.subject,
    text_body: ack.text,
    html_body: ack.html,
    delivery: sent.ok ? "sent" : "failed",
    error: sent.ok ? null : sent.error,
  });
  if (sent.ok) {
    await sb
      .from("inbox_threads")
      .update({ ack_sent_at: now.toISOString(), message_count: Number(thread.message_count || 0) + 2 })
      .eq("id", thread.id);
  }
  return sent.ok;
}

/* ───────────────────────────── reading ───────────────────────────── */

export const THREAD_STATUSES = ["open", "waiting", "solved", "spam"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export async function listThreads(
  sb: SupabaseClient,
  f: { status?: string; assignee?: string | null; limit?: number }
): Promise<{ threads: any[]; error?: any }> {
  let q = sb
    .from("inbox_threads")
    .select(
      "id, ticket_no, subject, customer_email, customer_name, status, assignee_email, message_count, unread, last_message_at, last_inbound_at, first_reply_at, due_at, ack_sent_at, created_at"
    );
  if (f.status && (THREAD_STATUSES as readonly string[]).includes(f.status)) q = q.eq("status", f.status);
  if (f.assignee) q = q.eq("assignee_email", f.assignee);
  const { data, error } = await q.order("last_message_at", { ascending: false }).limit(Math.min(Math.max(f.limit ?? 200, 1), 500));
  if (error) return { threads: [], error };
  return { threads: data ?? [] };
}

/** Counts per status, for the tabs. */
export async function threadCounts(sb: SupabaseClient): Promise<Record<string, number>> {
  const out: Record<string, number> = { open: 0, waiting: 0, solved: 0, spam: 0, unread: 0 };
  const { data } = await sb.from("inbox_threads").select("status, unread").limit(5000);
  for (const r of (data as any[]) ?? []) {
    if (r.status in out) out[r.status] += 1;
    if (r.unread && r.status !== "spam" && r.status !== "solved") out.unread += 1;
  }
  return out;
}

const MESSAGE_COLUMNS =
  "id, thread_id, direction, kind, from_email, from_name, to_emails, cc_emails, subject, text_body, author_email, attachments, delivery, error, created_at";

export async function getThread(sb: SupabaseClient, id: string): Promise<{ thread: any; messages: any[] } | null> {
  if (!UUID_RE.test(id)) return null;
  const { data: thread } = await sb.from("inbox_threads").select("*").eq("id", id).maybeSingle();
  if (!thread) return null;
  const { data: messages } = await sb.from("inbox_messages").select(MESSAGE_COLUMNS).eq("thread_id", id).order("created_at", { ascending: true }).limit(500);
  return { thread, messages: messages ?? [] };
}

/** Everyone who can be given a conversation: the owner(s) and the members. */
export async function listTeam(sb: SupabaseClient): Promise<{ email: string; name: string; role: string }[]> {
  const out = new Map<string, { email: string; name: string; role: string }>();
  const { data: owners } = await sb.from("profiles").select("email, full_name").eq("role", "owner").limit(20);
  for (const o of (owners as any[]) ?? []) {
    const email = String(o.email || "").toLowerCase();
    if (email) out.set(email, { email, name: o.full_name || email, role: "owner" });
  }
  const { data: members } = await sb.from("inbox_members").select("email, name, role").order("created_at", { ascending: true }).limit(200);
  for (const m of (members as any[]) ?? []) out.set(m.email, { email: m.email, name: m.name || m.email, role: m.role });
  return Array.from(out.values());
}

/* ───────────────────────────── writing ───────────────────────────── */

export async function updateThread(
  staff: Staff,
  id: string,
  b: Record<string, unknown>
): Promise<{ ok: true; thread: any } | { ok: false; status: number; error: string; message?: string }> {
  if (!UUID_RE.test(id)) return { ok: false, status: 404, error: "not_found" };
  const patch: Record<string, unknown> = {};
  if ("status" in b) {
    if (typeof b.status !== "string" || !(THREAD_STATUSES as readonly string[]).includes(b.status)) {
      return { ok: false, status: 400, error: "bad_status" };
    }
    patch.status = b.status;
  }
  if ("unread" in b) {
    if (typeof b.unread !== "boolean") return { ok: false, status: 400, error: "bad_payload" };
    patch.unread = b.unread;
  }
  if ("assignee_email" in b) {
    if (b.assignee_email === null || b.assignee_email === "") patch.assignee_email = null;
    else {
      const a = parseAddress(b.assignee_email);
      if (!a) return { ok: false, status: 400, error: "bad_assignee" };
      const team = await listTeam(staff.sb);
      if (!team.some((t) => t.email === a.email) && a.email !== staff.email) {
        return { ok: false, status: 400, error: "bad_assignee", message: "That person is not on the inbox team." };
      }
      patch.assignee_email = a.email;
    }
  }
  if (!Object.keys(patch).length) return { ok: false, status: 400, error: "nothing_to_change" };
  patch.updated_at = new Date().toISOString();
  const { data, error } = await staff.sb.from("inbox_threads").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return { ok: false, status: 500, error: "server_error" };
  if (!data) return { ok: false, status: 404, error: "not_found" };
  return { ok: true, thread: data };
}

export type ReplyInput = {
  kind: "reply" | "note";
  text: string;
  cc: string[];
  /** Status after sending. Default: waiting for a reply (reply) / unchanged (note). */
  status?: ThreadStatus;
};

export function parseReplyInput(b: Record<string, unknown>): { ok: true; input: ReplyInput } | { ok: false; error: string; message: string } {
  const kind = b.kind === "note" ? "note" : b.kind === "reply" ? "reply" : null;
  if (!kind) return { ok: false, error: "bad_kind", message: "kind must be reply or note." };
  const text = typeof b.text === "string" ? b.text.replace(/\r/g, "").trim() : "";
  if (!text) return { ok: false, error: "empty", message: "Write something first." };
  if (text.length > 20_000) return { ok: false, error: "too_long", message: "That message is too long (20,000 characters)." };
  const cc: string[] = [];
  if (kind === "reply" && Array.isArray(b.cc)) {
    for (const c of b.cc.slice(0, 10)) {
      const a = parseAddress(c);
      if (!a) return { ok: false, error: "bad_cc", message: `"${String(c).slice(0, 80)}" is not an e-mail address.` };
      if (!cc.includes(a.email)) cc.push(a.email);
    }
    if (cc.length > 5) return { ok: false, error: "bad_cc", message: "At most 5 people in Cc." };
  }
  let status: ThreadStatus | undefined;
  if (b.status !== undefined && b.status !== null && b.status !== "") {
    if (typeof b.status !== "string" || !(THREAD_STATUSES as readonly string[]).includes(b.status)) {
      return { ok: false, error: "bad_status", message: "Unknown status." };
    }
    status = b.status as ThreadStatus;
  }
  return { ok: true, input: { kind, text, cc, status } };
}

export async function addMessage(
  staff: Staff,
  threadId: string,
  input: ReplyInput,
  now = new Date()
): Promise<{ ok: true; message: any; thread: any } | { ok: false; status: number; error: string; message?: string }> {
  const sb = staff.sb;
  const t = await getThread(sb, threadId);
  if (!t) return { ok: false, status: 404, error: "not_found" };
  const { thread, messages } = t;

  if (input.kind === "note") {
    const { data: note, error } = await sb
      .from("inbox_messages")
      .insert({
        thread_id: thread.id,
        direction: "note",
        kind: "note",
        author_email: staff.email,
        from_email: staff.email,
        from_name: staff.name,
        text_body: input.text,
        created_at: now.toISOString(),
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) return { ok: false, status: 500, error: "server_error" };
    const { data: th } = await sb
      .from("inbox_threads")
      .update({
        message_count: Number(thread.message_count || 0) + 1,
        updated_at: now.toISOString(),
        ...(input.status ? { status: input.status } : {}),
      })
      .eq("id", thread.id)
      .select("*")
      .maybeSingle();
    return { ok: true, message: note, thread: th ?? thread };
  }

  const settings = await loadSettings(sb);
  // Answer the newest message the customer wrote; quote it under our reply.
  const lastIn = [...messages].reverse().find((m: any) => m.direction === "in");
  const { data: lastInFull } = lastIn
    ? await sb.from("inbox_messages").select("message_id, refs").eq("id", lastIn.id).maybeSingle()
    : { data: null };
  const quoted = lastIn
    ? quoteForReply(lastIn.from_name ? `${lastIn.from_name} <${lastIn.from_email}>` : String(lastIn.from_email), new Date(lastIn.created_at), lastIn.text_body)
    : undefined;
  const body = buildReply({ text: input.text, signature: settings.signature, quoted });
  const subject = replySubject(Number(thread.ticket_no), thread.subject);
  const refs = [(lastInFull as any)?.refs, (lastInFull as any)?.message_id].filter(Boolean).join(" ") || null;

  const sent = await sendMail({
    fromName: settings.from_name,
    fromAddress: settings.support_address,
    to: thread.customer_email,
    cc: input.cc,
    subject,
    text: body.text,
    html: body.html,
    inReplyTo: (lastInFull as any)?.message_id ?? null,
    references: refs,
  });

  const { data: msg, error } = await sb
    .from("inbox_messages")
    .insert({
      thread_id: thread.id,
      direction: "out",
      kind: "mail",
      provider_id: sent.ok && sent.id ? sent.id : null,
      from_email: settings.support_address,
      from_name: settings.from_name,
      to_emails: [thread.customer_email],
      cc_emails: input.cc,
      subject,
      text_body: input.text,
      html_body: body.html,
      author_email: staff.email,
      delivery: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.error,
      created_at: now.toISOString(),
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) return { ok: false, status: 500, error: "server_error" };

  if (!sent.ok) {
    // Keep the failed attempt visible on the conversation; change nothing else.
    await sb.from("inbox_threads").update({ message_count: Number(thread.message_count || 0) + 1 }).eq("id", thread.id);
    return { ok: false, status: 502, error: "send_failed", message: `The e-mail was not sent (${sent.error}). Your text is kept on the conversation; try again.` };
  }

  const { data: th } = await sb
    .from("inbox_threads")
    .update({
      status: input.status ?? "waiting",
      unread: false,
      message_count: Number(thread.message_count || 0) + 1,
      last_message_at: now.toISOString(),
      updated_at: now.toISOString(),
      first_reply_at: thread.first_reply_at ?? now.toISOString(),
      assignee_email: thread.assignee_email ?? staff.email,
    })
    .eq("id", thread.id)
    .select("*")
    .maybeSingle();
  return { ok: true, message: msg, thread: th ?? thread };
}
