/**
 * Check a GSTIN the same way the checkout does.
 *   npx tsx scripts/check-gstin.ts 06AACPG7019F2Z3
 */
import { validGstin, stateFromGstin, gstinCheckChar } from "../lib/gstin";

const gstin = (process.argv[2] ?? "").trim().toUpperCase();
if (!gstin) {
  console.log("Usage: npx tsx scripts/check-gstin.ts <GSTIN>");
  process.exit(2);
}
if (validGstin(gstin)) {
  console.log(`OK  ${gstin}  (state: ${stateFromGstin(gstin)})`);
} else {
  const expected = gstin.length === 15 ? gstinCheckChar(gstin.slice(0, 14)) : null;
  console.log(`NOT VALID  ${gstin}${expected ? `  (the last character should be ${expected})` : ""}`);
  process.exit(1);
}
