import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codeCandidates, decodeGreeting, greetingName, hiSlug, hiUrl, slugifyName } from "@/lib/hiLinks";

describe("slugifyName — the name part of a link", () => {
  it("is the first name, lower case, letters and digits only", () => {
    assert.equal(slugifyName("Aryan"), "aryan");
    assert.equal(slugifyName("Rajesh Kumar"), "rajesh-kumar");
    assert.equal(slugifyName("Ørsted"), "orsted");
    assert.equal(slugifyName("José"), "jose");
  });
  it("is empty for a name with nothing Latin in it, so the link is just the code", () => {
    assert.equal(slugifyName("आर्यन"), "");
    assert.equal(slugifyName(""), "");
    assert.equal(slugifyName(null), "");
  });
  it("never ends in a hyphen and stays short enough for a sparse QR", () => {
    const s = slugifyName("Abcdefghijklmn Opqrstuv");
    assert.ok(s.length <= 14);
    assert.ok(!s.endsWith("-"));
  });
});

describe("greetingName — what the welcome writes", () => {
  it("is the first word of the name", () => {
    assert.equal(greetingName("Aryan Kapoor"), "Aryan");
  });
  it("skips titles and lone initials", () => {
    assert.equal(greetingName("Dr. Rajesh Kumar Sharma"), "Rajesh");
    assert.equal(greetingName("Shri Mahesh Patel"), "Mahesh");
    assert.equal(greetingName("R. K. Sharma"), "Sharma");
    assert.equal(greetingName("CA Anil Gupta"), "Anil");
  });
  it("lets the owner's override win outright", () => {
    assert.equal(greetingName("Dr. Rajesh Kumar Sharma", "Dr. Sharma"), "Dr. Sharma");
    assert.equal(greetingName("Aryan", "  Aryan  ji "), "Aryan ji");
  });
  it("is null when there is nothing to say, so the welcome just says welcome", () => {
    assert.equal(greetingName(null), null);
    assert.equal(greetingName(""), null);
    assert.equal(greetingName("Dr."), null);
  });
  it("keeps a name in another script, trimmed of stray punctuation", () => {
    assert.equal(greetingName("आर्यन कपूर"), "आर्यन");
    assert.equal(greetingName("Aryan,"), "Aryan");
  });
  it("never returns more than 24 characters", () => {
    assert.ok((greetingName("A".repeat(80)) ?? "").length <= 24);
  });
});

describe("hiSlug and hiUrl", () => {
  it("joins the FIRST name and the lower-cased code", () => {
    assert.equal(hiSlug("Aryan Kapoor", "K7M2XQ"), "aryan-k7m2xq");
    assert.equal(hiSlug("Dr. Rajesh Kumar Sharma", "K7M2XQ"), "rajesh-k7m2xq");
    assert.equal(hiUrl("Aryan", "K7M2XQ"), "https://myvpv.com/hi/aryan-k7m2xq");
  });
  it("is just the code when the name has nothing Latin in it", () => {
    assert.equal(hiSlug("आर्यन", "K7M2XQ"), "k7m2xq");
  });
});

describe("codeCandidates — finding the code at the end of a link", () => {
  it("offers the last part and the last two parts, longest first", () => {
    assert.deepEqual(codeCandidates("aryan-k7m2xq"), ["aryan-k7m2xq", "k7m2xq"]);
    assert.deepEqual(codeCandidates("aryan-ggn-k7m2xq"), ["ggn-k7m2xq", "k7m2xq"]);
    assert.deepEqual(codeCandidates("k7m2xq"), ["k7m2xq"]);
  });
  it("refuses anything that is not a link slug", () => {
    for (const bad of ["", "%%%", "a b", "../x", "a/b", "x".repeat(300) + "!", null, undefined, 5]) {
      assert.deepEqual(codeCandidates(bad as never), [], JSON.stringify(bad));
    }
  });
  it("decodes a percent-encoded slug", () => {
    assert.deepEqual(codeCandidates("aryan%2Dk7m2xq"), ["aryan-k7m2xq", "k7m2xq"]);
  });
});

describe("decodeGreeting", () => {
  it("reads the cookie value back and never throws", () => {
    assert.equal(decodeGreeting("Rajesh%20ji"), "Rajesh ji");
    assert.equal(decodeGreeting("%E0%A4%86"), "आ");
    assert.equal(decodeGreeting("%E0%A4%A"), null);
    assert.equal(decodeGreeting(""), null);
    assert.equal(decodeGreeting(undefined), null);
  });
});
