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
  hot: "Left contact details, pressed call or WhatsApp, chose a plan or reached the bill. Call today.",
  warm: "Started the assessment, studied the price, came back, asked questions, or showed many small signs together.",
  curious: "Read for half a minute, or looked around a little.",
  glanced: "Scanned the card and left within seconds.",
  unopened: "Has not scanned the card.",
};

/** At or above this many seconds of reading, they were more than curious. */
export const CURIOUS_SECONDS = 30;
/** This long on a price page is studying it, not scrolling past. */
export const PRICE_STUDY_SECONDS = 20;
/** This long in total, with nothing else, is serious reading. */
export const WARM_READING_SECONDS = 90;

/**
 * Engagement points (0–100) weigh many small signs together, so that someone
 * who read four pages, watched the demo and clicked twice is not "Curious"
 * just because no single number crossed a line. Points can lift a person from
 * Glanced to Curious, or from Curious to Warm, never to Hot: Hot is reserved
 * for the strong actions (contact left, plan chosen, bill reached, pay clicked).
 */
export const WARM_POINTS = 40;
export const CURIOUS_POINTS = 18;

/** Hot / warm / cold: the three words used when talking to a sales team. */
export type Temperature = "hot" | "warm" | "cold";
export const TEMPERATURE_LABELS: Record<Temperature, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};
export function temperatureOf(level: Interest): Temperature {
  if (level === "customer" || level === "hot") return "hot";
  if (level === "warm") return "warm";
  return "cold";
}

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
  /** Buttons pressed that mean interest: CTA, outbound, video, tour. */
  clicks?: number;
  /** Distinct public pages looked at. */
  pagesViewed?: number;
  /** Deepest scroll on any page, 0–100. */
  maxScroll?: number;
  /** Watched a video, opened the tour or spent time on the demo. */
  sawDemo?: boolean;
  /** Pressed phone, WhatsApp or email on the site: reaching out to us. */
  reachedOut?: boolean;
};

export type InterestResult = {
  level: Interest;
  /** The same level in three words for a sales team. */
  temperature: Temperature;
  /** 0–100 weighed engagement; the reason behind a promotion to Curious or Warm. */
  points: number;
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

/**
 * Weighed engagement, 0–100. Each part is capped so no single behaviour can
 * carry a person alone: ten minutes on one page is still only 25 points.
 */
export function engagementPoints(i: InterestInput): number {
  const time = Math.min(25, i.activeSeconds / 8);
  const pages = Math.min(15, Math.max(0, (i.pagesViewed ?? 0) - 1) * 3);
  const scroll = (i.maxScroll ?? 0) >= 75 ? 6 : (i.maxScroll ?? 0) >= 40 ? 3 : 0;
  const clicks = Math.min(15, (i.clicks ?? 0) * 3);
  const demo = i.sawDemo ? 10 : 0;
  const price = Math.min(12, i.priceSeconds / 3);
  const faq = Math.min(9, i.objections * 3);
  const returns = Math.min(16, Math.max(0, i.visits - 1) * 8);
  return Math.min(100, Math.round(time + pages + scroll + clicks + demo + price + faq + returns));
}

export function interestOf(i: InterestInput): InterestResult {
  const rank = STAGE_RANK[i.stage ?? ""] ?? 0;
  const atBill = rank >= (STAGE_RANK.billing ?? 99);
  const chosePlan = rank >= (STAGE_RANK.plan ?? 99);
  const startedAssessment = rank >= (STAGE_RANK.info ?? 99);
  const studiedPrice = i.priceSeconds >= PRICE_STUDY_SECONDS;
  const cameBack = i.visits >= 2;
  const points = engagementPoints(i);

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
  } else if (i.clickedPay || atBill || chosePlan || i.leftContact || i.reachedOut) {
    level = "hot";
    say(!!i.reachedOut && !i.leftContact, "Pressed call, WhatsApp or email on the site");
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
    i.activeSeconds >= WARM_READING_SECONDS ||
    points >= WARM_POINTS
  ) {
    level = "warm";
    say(!!i.pickedPlan, "Picked a plan on the pricing page");
    say(startedAssessment, "Started the assessment");
    say(studiedPrice, `Spent ${formatSeconds(i.priceSeconds)} on the price`);
    say(cameBack, `Came back (${i.visits} visits)`);
    say(i.objections > 0, `Opened ${i.objections} question${i.objections === 1 ? "" : "s"} on the FAQ`);
    say(i.activeSeconds >= WARM_READING_SECONDS, `Read for ${formatSeconds(i.activeSeconds)}`);
    // Warm on points alone: say what the points were made of.
    say(
      points >= WARM_POINTS && why.length === 0,
      `Engaged across the site (${points} of 100): ${pointParts(i)}`
    );
  } else if (i.activeSeconds >= CURIOUS_SECONDS || points >= CURIOUS_POINTS) {
    level = "curious";
    say(i.activeSeconds >= CURIOUS_SECONDS, `Read for ${formatSeconds(i.activeSeconds)}`);
    say(i.activeSeconds < CURIOUS_SECONDS, `Looked around (${points} of 100): ${pointParts(i)}`);
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
  if (level === "hot" || level === "warm" || level === "customer") {
    say(!!i.sawDemo, "Watched the demo or tour");
    say((i.clicks ?? 0) >= 2, `${i.clicks} clicks`);
    say((i.pagesViewed ?? 0) >= 3, `Read ${i.pagesViewed} pages`);
  }

  const bonusRaw =
    rank * 3 +
    Math.min(10, i.activeSeconds / 30) +
    Math.max(0, i.visits - 1) * 2 +
    (studiedPrice ? 3 : 0) +
    (i.objections > 0 ? 2 : 0) +
    (i.leftContact ? 4 : 0) +
    points / 12;
  const bonus = Math.min(BONUS_CAP[level], Math.round(bonusRaw));
  const score = Math.min(100, BASE[level] + bonus);

  return { level, temperature: temperatureOf(level), points, score, why };
}

/** The parts of the points a person actually earned, in words. */
function pointParts(i: InterestInput): string {
  const parts: string[] = [];
  if (i.activeSeconds >= 20) parts.push(`${formatSeconds(i.activeSeconds)} on site`);
  if ((i.pagesViewed ?? 0) >= 2) parts.push(`${i.pagesViewed} pages`);
  if ((i.maxScroll ?? 0) >= 40) parts.push(`scrolled ${i.maxScroll}%`);
  if ((i.clicks ?? 0) >= 1) parts.push(`${i.clicks} click${i.clicks === 1 ? "" : "s"}`);
  if (i.sawDemo) parts.push("demo");
  if (i.priceSeconds >= 6) parts.push(`${formatSeconds(i.priceSeconds)} on price`);
  if (i.objections > 0) parts.push(`${i.objections} FAQ`);
  if (i.visits >= 2) parts.push(`${i.visits} visits`);
  return parts.join(", ") || "small signs";
}
