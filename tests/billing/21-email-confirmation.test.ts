import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isEmailVerified, normaliseEmail, EMPTY_FUNNEL } from "@/lib/funnel";

/**
 * The code that proves a buyer owns an e-mail address proves it for THAT
 * address. A visitor who confirmed one e-mail and then typed another must be
 * asked for a code again.
 */
describe("e-mail confirmation belongs to an address, not a browser", () => {
  it("is true only for the address that was confirmed", () => {
    assert.equal(isEmailVerified({ email: "a@acme.in", verifiedEmail: "a@acme.in" }), true);
    assert.equal(isEmailVerified({ email: "b@other.in", verifiedEmail: "a@acme.in" }), false);
  });

  it("ignores case and stray spaces, nothing more", () => {
    assert.equal(isEmailVerified({ email: " A@Acme.IN ", verifiedEmail: "a@acme.in" }), true);
    assert.equal(isEmailVerified({ email: "a@acme.in.evil.com", verifiedEmail: "a@acme.in" }), false);
    assert.equal(isEmailVerified({ email: "a+x@acme.in", verifiedEmail: "a@acme.in" }), false);
  });

  it("an empty address is never confirmed, even against an empty record", () => {
    assert.equal(isEmailVerified({ email: "", verifiedEmail: "" }), false);
    assert.equal(isEmailVerified({ email: "   ", verifiedEmail: "  " }), false);
  });

  it("the old yes/no flag, saved by earlier visits, confirms nothing", () => {
    const old = { ...EMPTY_FUNNEL, email: "anyone@x.in", emailVerified: true };
    assert.equal(isEmailVerified(old), false);
  });

  it("normaliseEmail is one spelling", () => {
    assert.equal(normaliseEmail("  Rajesh@Co.IN "), "rajesh@co.in");
  });

  it("the billing step only ever saves a confirmation together with the address", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/funnel/Step5Billing.tsx"), "utf8");
    assert.ok(/saveFunnel\(\{[^}]*verifiedEmail:/.test(src), "must record which address was confirmed");
    assert.ok(!/otp === "verified" &&?\s*s\.termsAccepted/.test(src), "payment must not depend on the bare flag");
    assert.ok(src.includes("isEmailVerified"), "must derive 'confirmed' from the address");
  });
});
