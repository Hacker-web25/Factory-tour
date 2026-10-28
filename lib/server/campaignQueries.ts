/**
 * lib/server/campaignQueries.ts — everything the campaign pages read.
 *
 * One place, so the list page, the campaign page and the person page ask the
 * database the same questions and cannot drift apart.
 *
 * TWO THINGS THIS FILE EXISTS TO GET RIGHT.
 *
 * 1. PAGING. A single Supabase request returns at most the project's
 *    `max-rows` (1,000 by default) however large `.limit()` is. A report
 *    that quietly stops at 1,000 rows looks fine with 347 people and then
 *    under-counts the day the third campaign lands. Every read here pages
 *    until the database returns nothing, and says so when it hits a ceiling
 *    rather than returning a short list as if it were the whole.
 *
 * 2. LONG `in (...)` LISTS. They travel in the URL. Two hundred ids at a time
 *    keeps every request short enough to send, and fails nowhere but locally
 *    if it is too long, instead of only in production.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FolderEventRow,
  FolderLeadRow,
  FolderScanRow,
  FolderVisitorRow,
} from "@/lib/campaignFolders";
import type { OrderRow } from "@/lib/campaignReport";

export const CHUNK = 200;
const PAGE = 1000;
/** A ceiling per query, so one bad filter cannot read the whole table forever. */
export const MAX_ROWS = 200_000;

export const FOLDER_COLS =
  "id, slug, name, city, state, channel, destination, printed_count, distributed_at, notes, active, created_at";

export const CODE_COLS =
  "code, folder_id, label, person_name, person_company, recipient_role, recipient_phone, recipient_email, delivery_state, delivered_at, print_seq, created_at, outreach_state, contacted_at, rep_notes, follow_up_on";

export const SCAN_COLS = "code, visitor_id, created_at, device, is_repeat, os, browser";

export const VISITOR_COLS =
  "visitor_id, first_code, first_seen_at, last_seen_at, city, device, os, browser, page_views, first_source, first_referrer";

export const EVENT_COLS = "id, visitor_id, session_id, name, path, created_at, meta";

/** The short lead: enough for the lists. */
export const LEAD_COLS_LIST =
  "visitor_id, campaign_code, name, company, phone, email, stage, chosen_plan, quoted_total_inr, factory_city, industry, order_id";

/** The whole lead: everything the enquiry form collected. */
export const LEAD_COLS_FULL =
  "id, created_at, updated_at, visitor_id, campaign_code, stage, name, company, phone, email, email_verified_at, industry, industry_text, factory_city, factory_state, plot_size, areas, processes, aoa_count, video_count, pdf_count, wants_sharing_controls, recommended_plan, chosen_plan, extra_areas, extra_videos, quoted_total_inr, has_sales_team, sales_seats, terms_accepted_at, marketing_consent, order_id";

export const ORDER_COLS_LIST = "id, amount_paise, status";
export const ORDER_COLS_FULL =
  "id, amount_paise, status, created_at, paid_at, refunded_paise, buyer_name, buyer_email, buyer_phone, buyer_company, buyer_city";

export const MIGRATION_HINT =
  "Run supabase/campaign_folders.sql and then supabase/campaign_outreach.sql in the Supabase SQL editor.";

type Err = { message: string } | null;
type Page = { data: unknown; error: Err };

/**
 * Read a whole result, a page at a time.
 *
 * Advances by what actually came back, not by PAGE: if the project caps a
 * request below 1,000 rows, asking for 0–999 returns the cap, and the next
 * ask starts where that one ended. Stops on an empty page.
 */
export async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<Page>
): Promise<{ rows: T[]; error: Err; truncated: boolean }> {
  const rows: T[] = [];
  let from = 0;
  while (rows.length < MAX_ROWS) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows, error, truncated: false };
    const got = (data ?? []) as T[];
    if (got.length === 0) return { rows, error: null, truncated: false };
    rows.push(...got);
    from += got.length;
  }
  return { rows, error: null, truncated: true };
}

/** Run one `in (...)` query over a long list, a chunk at a time, each paged. */
export async function inChunks<T>(
  values: string[],
  build: (slice: string[], from: number, to: number) => PromiseLike<Page>
): Promise<{ rows: T[]; error: Err; truncated: boolean }> {
  const rows: T[] = [];
  let truncated = false;
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    const r = await pageAll<T>((from, to) => build(slice, from, to));
    if (r.error) return { rows, error: r.error, truncated };
    rows.push(...r.rows);
    truncated = truncated || r.truncated;
  }
  return { rows, error: null, truncated };
}

export type CampaignBundle<L extends FolderLeadRow, O extends OrderRow> = {
  scans: FolderScanRow[];
  visitors: FolderVisitorRow[];
  events: FolderEventRow[];
  leads: L[];
  orders: O[];
  /** True if any read hit the ceiling: the numbers are a lower bound. */
  truncated: boolean;
};

/**
 * Everything known about a set of codes: who scanned them, who those people
 * are, what they did, what they told us, and what they paid.
 *
 * `events: false` is the list page: the counters on the visitor row answer
 * "did they load the site", and skipping the events keeps it one cheap pass.
 */
export async function loadCampaignBundle<L extends FolderLeadRow, O extends OrderRow>(
  sb: SupabaseClient,
  codeList: string[],
  opts: { events: boolean; leadCols: string; orderCols: string }
): Promise<{ ok: true; bundle: CampaignBundle<L, O> } | { ok: false; error: { message: string } }> {
  if (!codeList.length) {
    return { ok: true, bundle: { scans: [], visitors: [], events: [], leads: [], orders: [], truncated: false } };
  }
  let truncated = false;
  const note = (t: boolean) => {
    truncated = truncated || t;
  };

  const scansQ = await inChunks<FolderScanRow>(codeList, (slice, from, to) =>
    sb
      .from("campaign_scans")
      .select(SCAN_COLS)
      .in("code", slice)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (scansQ.error) return { ok: false, error: scansQ.error };
  note(scansQ.truncated);

  const firstTouchQ = await inChunks<FolderVisitorRow>(codeList, (slice, from, to) =>
    sb
      .from("site_visitors")
      .select(VISITOR_COLS)
      .in("first_code", slice)
      .order("visitor_id", { ascending: true })
      .range(from, to)
  );
  if (firstTouchQ.error) return { ok: false, error: firstTouchQ.error };
  note(firstTouchQ.truncated);

  // Everyone who belongs to these codes: they landed on one, or they scanned
  // one later having arrived some other way first. Robots are not people.
  const visitorIds = new Set<string>(firstTouchQ.rows.map((v) => v.visitor_id));
  for (const s of scansQ.rows) if (s.visitor_id && s.device !== "bot") visitorIds.add(s.visitor_id);
  const ids = [...visitorIds];

  const known = new Set(firstTouchQ.rows.map((v) => v.visitor_id));
  const missing = ids.filter((id) => !known.has(id));
  const extraQ = missing.length
    ? await inChunks<FolderVisitorRow>(missing, (slice, from, to) =>
        sb
          .from("site_visitors")
          .select(VISITOR_COLS)
          .in("visitor_id", slice)
          .order("visitor_id", { ascending: true })
          .range(from, to)
      )
    : { rows: [] as FolderVisitorRow[], error: null as Err, truncated: false };
  if (extraQ.error) return { ok: false, error: extraQ.error };
  note(extraQ.truncated);

  let events: FolderEventRow[] = [];
  if (opts.events && ids.length) {
    const eventsQ = await inChunks<FolderEventRow>(ids, (slice, from, to) =>
      sb
        .from("site_events")
        .select(EVENT_COLS)
        .in("visitor_id", slice)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    );
    if (eventsQ.error) return { ok: false, error: eventsQ.error };
    note(eventsQ.truncated);
    events = eventsQ.rows;
  }

  /* Leads: the ones that name a code, and the ones left by any browser that
     scanned one. Two ways in; the report keeps the furthest-along of them. */
  const byCode = await inChunks<L>(codeList, (slice, from, to) =>
    sb
      .from("funnel_leads")
      .select(opts.leadCols)
      .in("campaign_code", slice)
      .order("created_at", { ascending: true })
      .range(from, to)
  );
  if (byCode.error) return { ok: false, error: byCode.error };
  note(byCode.truncated);

  const byVisitor = ids.length
    ? await inChunks<L>(ids, (slice, from, to) =>
        sb
          .from("funnel_leads")
          .select(opts.leadCols)
          .in("visitor_id", slice)
          .order("created_at", { ascending: true })
          .range(from, to)
      )
    : { rows: [] as L[], error: null as Err, truncated: false };
  if (byVisitor.error) return { ok: false, error: byVisitor.error };
  note(byVisitor.truncated);

  // The same lead can arrive by both doors. Keep one of each.
  const leads: L[] = [];
  const seen = new Set<string>();
  for (const l of [...byCode.rows, ...byVisitor.rows]) {
    const id = (l as unknown as { id?: string }).id;
    const key = id ?? `${l.visitor_id ?? ""}|${l.campaign_code ?? ""}|${l.stage ?? ""}|${l.order_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push(l);
  }

  const orderIds = [...new Set(leads.map((l) => l.order_id).filter((v): v is string => !!v))];
  const ordersQ = orderIds.length
    ? await inChunks<O>(orderIds, (slice, from, to) =>
        sb
          .from("billing_orders")
          .select(opts.orderCols)
          .in("id", slice)
          .order("id", { ascending: true })
          .range(from, to)
      )
    : { rows: [] as O[], error: null as Err, truncated: false };
  if (ordersQ.error) return { ok: false, error: ordersQ.error };
  note(ordersQ.truncated);

  return {
    ok: true,
    bundle: {
      scans: scansQ.rows,
      visitors: [...firstTouchQ.rows, ...extraQ.rows],
      events,
      leads,
      orders: ordersQ.rows,
      truncated,
    },
  };
}
