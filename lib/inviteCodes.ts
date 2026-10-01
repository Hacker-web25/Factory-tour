import { supabase } from "@/lib/supabase";

/** Generate a short human-readable invite code — 8 alphanumeric chars,
 *  upper-case, ambiguity-free (no 0/O/1/I). */
export function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Create an invite code row that a sales team member can redeem on
 *  /signup/sales to join `orgId` as a presenter.
 *
 *  - maxUses: how many distinct people can redeem this code. 1 for a
 *    personal single-use code, N for a bulk hiring code.
 *  - deviceLimit: how many devices EACH redeemer can be active on at
 *    once. Default 1 (strict anti-sharing).
 */
export async function createInviteCode(opts: {
  orgId: string;
  createdBy?: string | null;
  maxUses?: number;
  expiresInDays?: number;
  deviceLimit?: number;
}): Promise<{ code: string } | { error: string }> {
  const code = generateCode();
  const expires = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 86400000).toISOString()
    : null;
  const { error } = await supabase.from("invite_codes").insert({
    code,
    org_id: opts.orgId,
    created_by: opts.createdBy ?? null,
    max_uses: opts.maxUses ?? 1,
    expires_at: expires,
    device_limit: opts.deviceLimit ?? 1,
  });
  if (error) return { error: error.message };
  return { code };
}

/** Validate + mark used. Returns the org_id the code belongs to, or
 *  an error message. Also copies the code's device_limit onto the
 *  redeeming profile so the login flow can enforce it. */
export async function redeemInviteCode(
  code: string,
  userId: string
): Promise<{ orgId: string; deviceLimit: number } | { error: string }> {
  const clean = code.trim().toUpperCase();
  const { data: row } = await supabase
    .from("invite_codes")
    .select("*")
    .eq("code", clean)
    .maybeSingle();
  if (!row) return { error: "Invite code not found." };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { error: "This invite code has expired." };
  }
  if (row.max_uses && row.used_count >= row.max_uses) {
    return { error: "This invite code has reached its usage limit." };
  }
  const usedBy: string[] = row.used_by ?? [];
  const deviceLimit = row.device_limit ?? 1;
  if (usedBy.includes(userId)) {
    // Idempotent — already redeemed by this user.
    return { orgId: row.org_id, deviceLimit };
  }
  // Mark the code consumed by this user + bump the counter.
  await supabase
    .from("invite_codes")
    .update({
      used_count: (row.used_count ?? 0) + 1,
      used_by: [...usedBy, userId],
    })
    .eq("code", clean);
  // Carry the device_limit over to the profile — the login flow reads
  // it from profiles.device_limit when deciding whether to accept a
  // new device.
  await supabase
    .from("profiles")
    .update({ invited_via_code: clean, device_limit: deviceLimit })
    .eq("id", userId);
  return { orgId: row.org_id, deviceLimit };
}
