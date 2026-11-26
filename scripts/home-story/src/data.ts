/**
 * What the home page story says, kept apart from the page code (no browser,
 * no styles) so tests can read it. See story.ts for how it is shown.
 */

/** The calculator's own steps (lakh per lead; leads over five years; conversion %). */
export const CALC_VALUES = [5, 10, 25, 50, 100, 500]; // lakh
export const CALC_LEADS = { min: 100, max: 5_000, step: 50, start: 1_000 };
export const CALC_CONVS = { min: 1, max: 50 };

/**
 * Four example factories for part 2's table. They are worked out with the
 * calculator's own formula (leads × business per lead × conversion), so a
 * visitor who types the same three numbers into the calculator gets the same
 * figures. Illustrative, and labelled as such on the page. Leads are over five
 * years; `lakh` is the business per lead, in lakh. Every value is one of the
 * calculator's own steps, so tapping a row lands exactly on a chip.
 */
export const FACTORIES = [
  { id: "small", name: "Small factory", note: "Many leads, low value", leads: 3_000, lakh: 5, conv: 2 },
  { id: "medium", name: "Medium factory", note: "Many leads, modest value", leads: 2_000, lakh: 10, conv: 3 },
  { id: "large", name: "Large factory", note: "Balanced", leads: 1_000, lakh: 50, conv: 5 },
  { id: "mega", name: "Mega factory", note: "Few leads, high value", leads: 200, lakh: 500, conv: 10 },
] as const;

/** What an example factory wins and loses: the calculator's formula, in rupees. */
export const worked = (f: { leads: number; lakh: number; conv: number }) => {
  const opportunity = f.leads * f.lakh * 1_00_000;
  const won = (opportunity * f.conv) / 100;
  return { opportunity, won, lost: opportunity - won };
};

/**
 * Part 3's video: Mr. Anuj Anand's story, the one /case-studies opens on.
 * `portrait` is false because that video is landscape (16:9); a vertical cut
 * would set it to true and the frame becomes phone-shaped.
 */
export const PROOF = {
  id: "62asCfqRRbw",
  name: "Mr. Anuj Anand",
  role: "Export Head, Kesaria Rubber Industries Pvt. Ltd.",
  portrait: false,
};
/** The button under the logos. One line to change. */
export const CASE_STUDIES_BUTTON = "See all case studies";

/**
 * The five steps, word for word from the How it works page
 * (scripts/hiw-guide/src/guide.ts); tests/billing/45 checks they still match.
 */
export const ORDER_STEPS = [
  { title: "Find your VPV", who: "You", when: "A few minutes, online" },
  { title: "Confirm & pay online", who: "You", when: "A few minutes, online" },
  { title: "Book your shoot", who: "Us", when: "Within 2 working days of payment" },
  { title: "We shoot your plant", who: "Us", when: "1–5 hours on site" },
  { title: "Your VPV goes live", who: "Us", when: "Typically 1–3 weeks after the shoot" },
] as const;

