/**
 * lib/interest.ts — how interested is this person, and how do we know?
 *
 *   Customer   paid
 *   Hot        gave us a phone number or email, chose a plan, or reached the
 *              bill. Somebody should call today.
 *   Warm       started the assessment, studied the price, came back, asked
 *              questions, or read for a couple of minutes. Worth a call.
 *   Curious    read the page for half a minute or more.
 *   Glanced    scanned it, looked, left.
 *   Not opened never scanned.
 *
 * WHY A LADDER AND NOT ONE NUMBER. "Interest 62" cannot be acted on and
 * cannot be argued with. A level with the reasons beside it can: you read
 * "Hot — left a phone number, spent 2 min on pricing" and you know whether
 * you agree. The numeric score exists only to order people WITHIN a level,
 * and it is capped so that it can never lift somebody across one: the
 * strongest Warm person is still below the weakest Hot one.
 *
 * Pure and dependency-light so the rules are tested without a database.
 */

import { STAGE_RANK } from "@/lib/analytics/signals";

export const INTEREST_LEVELS = [
  "customer",
  "hot",
  "warm",
  "curious",
  "glanced",
  "unopened",
] as const;
export type Interest = (typeof INTEREST_LEVELS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  customer: "Customer",
  hot: "Hot",
  warm: "Warm",
  curious: "Curious",
  glanced: "Glanced",
  unopened: "Not opened",
};

/** One line of what each level means, for the legend. */
export const INTEREST_MEANING: Record<Interest, string> = {
  customer: "Has paid.",
  hot: "Left contact details, chose a plan or reached the bill. Call today.",
  warm: "Started the assessment, studied the price, came back or asked questions.",
  curious: "Read the page for at least half a minute.",
  glanced: "Scanned the card and left within seconds.",
  unopened: "Has not scanned the card.",
};

/** At or above this many seconds of reading, they were more than curious. */
export const CURIOUS_SECONDS = 30;
/** This long on a price page is studying it, not scrolling past. */
export const PRICE_STUDY_SECONDS = 20;
/** This long in total, with nothing else, is serious reading. */
export const WARM_READING_SECONDS = 90;

export type InterestInput = {
  /** Scanned, loaded the site, or has a lead: any sign of life. */
  opened: boolean;
  paid: boolean;
  /** Furthest stage key on the assessment ladder, if any. */
  stage: string | null;
  activeSeconds: number;
  /** Seconds on pages that show money. */
  priceSeconds: number;
  visits: number;
  /** FAQ questions opened. */
  objections: number;
  /** They typed a phone number or email into the website. */
  leftContact: boolean;
  clickedPay: boolean;
  /** They pressed a plan's button on the pricing page. */
  pickedPlan?: boolean;
};

export type InterestResult = {
  level: Interest;
  /** 0–100. Orders people within and across levels; never crosses one. */
  score: number;
  /** The reasons, strongest first, in words. */
  why: string[];
};

/** "75 s" · "2 min 10 s" · "1 h 5 min". Whole seconds in, never "0 min". */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h} h ${mm} min` : `${h} h`;
}

const BASE: Record<Interest, number> = {
  customer: 100,
  hot: 70,
  warm: 40,
  curious: 20,
  glanced: 5,
  unopened: 0,
};

/** The most a within-level bonus may add, so no level can overtake the next. */
const BONUS_CAP: Record<Interest, number> = {
  customer: 0,
  hot: 29,
  warm: 29,
  curious: 19,
  glanced: 14,
  unopened: 0,
};

export function interestOf(i: InterestInput): InterestResult {
  const rank = STAGE_RANK[i.stage ?? ""] ?? 0;
  const atBill = rank >= (STAGE_RANK.billing ?? 99);
  const chosePlan = rank >= (STAGE_RANK.plan ?? 99);
  const startedAssessment = rank >= (STAGE_RANK.info ?? 99);
  const studiedPrice = i.priceSeconds >= PRICE_STUDY_SECONDS;
  const cameBack = i.visits >= 2;

  const why: string[] = [];
  const say = (cond: boolean, text: string) => {
    if (cond) why.push(text);
  };

  let level: Interest;
  if (i.paid) {
    level = "customer";
    say(true, "Paid");
  } else if (!i.opened) {
    level = "unopened";
    say(true, "Has not opened the card");
  } else if (i.clickedPay || atBill || chosePlan || i.leftContact) {
    level = "hot";
    say(i.clickedPay, "Clicked pay");
    say(atBill && !i.clickedPay, "Reached the bill");
    say(chosePlan && !atBill, "Chose a plan");
    say(i.leftContact, "Left a phone number or email");
  } else if (
    startedAssessment ||
    i.pickedPlan ||
    studiedPrice ||
    cameBack ||
    i.objections > 0 ||
    i.activeSeconds >= WARM_READING_SECONDS
  ) {
    level = "warm";
    say(!!i.pickedPlan, "Picked a plan on the pricing page");
    say(startedAssessment, "Started the assessment");
    say(studiedPrice, `Spent ${formatSeconds(i.priceSeconds)} on the price`);
    say(cameBack, `Came back (${i.visits} visits)`);
    say(i.objections > 0, `Opened ${i.objections} question${i.objections === 1 ? "" : "s"} on the FAQ`);
    say(i.activeSeconds >= WARM_READING_SECONDS, `Read for ${formatSeconds(i.activeSeconds)}`);
  } else if (i.activeSeconds >= CURIOUS_SECONDS) {
    level = "curious";
    say(true, `Read for ${formatSeconds(i.activeSeconds)}`);
  } else {
    level = "glanced";
    say(true, i.activeSeconds > 0 ? `Looked for ${formatSeconds(i.activeSeconds)}` : "Scanned and left");
  }

  // Colour on the reasons, after the level is fixed: they describe the person
  // and must not change which level they are in.
  if (level === "hot" || level === "customer") {
    say(studiedPrice, `Spent ${formatSeconds(i.priceSeconds)} on the price`);
    say(cameBack, `Came back (${i.visits} visits)`);
    say(i.objections > 0, `Opened ${i.objections} question${i.objections === 1 ? "" : "s"} on the FAQ`);
  }

  const bonusRaw =
    rank * 3 +
    Math.min(10, i.activeSeconds / 30) +
    Math.max(0, i.visits - 1) * 2 +
    (studiedPrice ? 3 : 0) +
    (i.objections > 0 ? 2 : 0) +
    (i.leftContact ? 4 : 0);
  const bonus = Math.min(BONUS_CAP[level], Math.round(bonusRaw));
  const score = Math.min(100, BASE[level] + bonus);

  return { level, score, why };
}
