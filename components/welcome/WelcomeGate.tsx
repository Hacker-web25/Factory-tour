import { WELCOME_GATE_JS } from "@/lib/welcome/gate";

/**
 * The first few hundred bytes of the personal welcome (see lib/welcome/gate.ts).
 * A no-op for everyone except a person who scanned their own printed QR.
 * Rendered once, in the root layout's <head>, as a plain inline script so it
 * runs while the page is still being parsed (a next/script would wait for
 * Next's own bundles first, and the homepage would flash before the welcome).
 * The marketing pages carry the same text from lib/site/home.ts.
 */
export default function WelcomeGate() {
  return <script id="vpv-hi-gate" dangerouslySetInnerHTML={{ __html: WELCOME_GATE_JS }} />;
}
