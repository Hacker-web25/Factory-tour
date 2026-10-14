/**
 * GSTIN checks, shared by the checkout route and the tests.
 *
 * A GSTIN is 15 characters: 2 state digits, the 10-character PAN, an entity
 * number, the letter Z, and a check character. Government-issued numbers
 * always carry a correct check character, so a typo in any other character
 * is caught here instead of printing a wrong GSTIN on a tax invoice (which
 * would stop the customer claiming input tax credit).
 *
 * The first two digits also tell us the customer's state. For a GST-registered
 * customer that state — not whatever the browser sent — is the place of supply,
 * and decides CGST+SGST versus IGST.
 */

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN state codes → the exact spellings in lib/indianStates.ts. */
export const GSTIN_STATE_BY_CODE: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Dadra and Nagar Haveli and Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other / outside India",
};

/** The check character for the first 14 characters of a GSTIN (mod-36 weighted sum). */
export function gstinCheckChar(first14: string): string | null {
  if (first14.length !== 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARSET.indexOf(first14[i]);
    if (v < 0) return null;
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export function validGstin(value: string): boolean {
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return false;
  if (!GSTIN_STATE_BY_CODE[v.slice(0, 2)]) return false;
  return gstinCheckChar(v.slice(0, 14)) === v[14];
}

/** The state a (valid) GSTIN belongs to, or null. */
export function stateFromGstin(value: string): string | null {
  if (!validGstin(value)) return null;
  return GSTIN_STATE_BY_CODE[value.trim().toUpperCase().slice(0, 2)] ?? null;
}
