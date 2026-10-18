/**
 * Link registry for every public policy / company page. The footer, the
 * compact legal strip, the /legal hub, the sitemap and llms.txt all read
 * from here, so adding a page is a one-line change in one place.
 */

export type PolicyLink = {
  href: string;
  /** Full title, used in the footer and the /legal hub. */
  label: string;
  /** One or two words for the compact strip inside dashboards. */
  short: string;
  /** One-line description for the /legal hub. */
  blurb: string;
};

export const POLICY_LINKS: PolicyLink[] = [
  {
    href: "/terms",
    label: "Terms & Conditions",
    short: "Terms",
    blurb: "The agreement that governs your use of VPV, including fees, support and price changes.",
  },
  {
    href: "/privacy",
    label: "Privacy Policy",
    short: "Privacy",
    blurb: "What personal data we handle, why, who processes it, and the rights you have over it.",
  },
  {
    href: "/refund-policy",
    label: "Cancellation & Refund Policy",
    short: "Refunds",
    blurb: "How to cancel, when a refund is due, and how long it takes to reach you.",
  },
  {
    href: "/shipping-policy",
    label: "Shipping & Delivery Policy",
    short: "Delivery",
    blurb: "VPV is delivered digitally. This explains when and how your workspace is made available.",
  },
  {
    href: "/cookies",
    label: "Cookie Policy",
    short: "Cookies",
    blurb: "The small amount of browser storage VPV uses, and what it is for.",
  },
  {
    href: "/disclaimer",
    label: "Disclaimer",
    short: "Disclaimer",
    blurb: "The limits of what VPV, its analytics and its AI-assisted insights can promise.",
  },
  {
    href: "/security",
    label: "Security",
    short: "Security",
    blurb: "How we protect your tours, your viewers' data and your account.",
  },
];

export const COMPANY_LINKS: { href: string; label: string }[] = [
  { href: "/plans", label: "Pricing" },
  { href: "/assessment", label: "Get started" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
];

/** Every public path, for the sitemap + llms.txt. */
export const PUBLIC_LEGAL_PATHS: string[] = [
  ...POLICY_LINKS.map((l) => l.href),
  ...COMPANY_LINKS.map((l) => l.href),
  "/legal",
];
