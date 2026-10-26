/**
 * lib/purchaseUsage.ts — the one question asked after a customer pays:
 * "How do you plan to use your virtual plant visit?"
 *
 * Pure, so the page, the API route and the admin report all share one list
 * and one validation rule. Option ids are stored in the database, so an id
 * must never be renamed; change the wording freely.
 */

export type UsageId = "exhibitions" | "followup" | "distributors" | "qr" | "oem" | "website" | "other";

export type UsageOption = {
  id: UsageId;
  title: string;
  detail: string;
};

export const USAGE_OPTIONS: readonly UsageOption[] = [
  {
    id: "exhibitions",
    title: "At exhibitions and trade fairs",
    detail: "Walk visitors through your plant right at your booth.",
  },
  {
    id: "followup",
    title: "In follow-up e-mails",
    detail: "Send it with your company profile, so buyers see your plant and recall your booth.",
  },
  {
    id: "distributors",
    title: "With distributors and dealers",
    detail: "Your sales team shows it in every distributor meeting.",
  },
  {
    id: "qr",
    title: "On business cards and brochures",
    detail: "A QR code that says “Scan to visit our plant”.",
  },
  {
    id: "oem",
    title: "In OEM and key-account meetings",
    detail: "Show your capacity and processes before anyone books a site visit.",
  },
  {
    id: "website",
    title: "On our website and LinkedIn",
    detail: "Let anyone, anywhere, visit your plant online.",
  },
  {
    id: "other",
    title: "Something else",
    detail: "Tell us in your own words.",
  },
] as const;

export const USAGE_IDS: ReadonlySet<string> = new Set(USAGE_OPTIONS.map((o) => o.id));
export const OTHER_MAX = 500;

export type UsageAnswer = { uses: UsageId[]; other: string | null };

/**
 * Check an answer from the browser. At least one option is required, and
 * "Something else" needs a few words. Unknown ids are an error, not
 * silently dropped, so a tampered request is refused rather than stored.
 */
export function parseUsageAnswer(
  rawUses: unknown,
  rawOther: unknown
): { ok: true; answer: UsageAnswer } | { ok: false; error: string; message: string } {
  if (!Array.isArray(rawUses) || rawUses.length === 0) {
    return { ok: false, error: "no_choice", message: "Please choose at least one." };
  }
  if (rawUses.length > USAGE_OPTIONS.length) {
    return { ok: false, error: "bad_choice", message: "Please choose from the list." };
  }
  const uses: UsageId[] = [];
  for (const u of rawUses) {
    if (typeof u !== "string" || !USAGE_IDS.has(u)) {
      return { ok: false, error: "bad_choice", message: "Please choose from the list." };
    }
    if (!uses.includes(u as UsageId)) uses.push(u as UsageId);
  }
  // Same order as the list, so reports read consistently.
  uses.sort((a, b) => USAGE_OPTIONS.findIndex((o) => o.id === a) - USAGE_OPTIONS.findIndex((o) => o.id === b));

  const other =
    typeof rawOther === "string"
      ? rawOther
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u2028\u2029]/g, " ")
          .replace(/[ \t]+/g, " ")
          .trim()
      : "";
  if (other.length > OTHER_MAX) {
    return { ok: false, error: "too_long", message: `Please keep it under ${OTHER_MAX} characters.` };
  }
  if (uses.includes("other")) {
    if (other.length < 3) {
      return { ok: false, error: "other_empty", message: "Please tell us how you will use it." };
    }
    return { ok: true, answer: { uses, other } };
  }
  return { ok: true, answer: { uses, other: null } };
}

/** "At exhibitions and trade fairs" for "exhibitions"; the id itself for anything unknown. */
export function usageTitle(id: string): string {
  return USAGE_OPTIONS.find((o) => o.id === id)?.title ?? id;
}
