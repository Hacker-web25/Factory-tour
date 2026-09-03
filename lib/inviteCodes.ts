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
 *  /setup to join `orgId` as a presenter. */
export async function createInviteCode(opts: {
  orgId: string;
  createdBy?: string | null;
  maxUses?: number;
  expiresInDays?: number;
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
  });
  if (error) return { error: error.message };
  return { code };
}

/** Validate + mark used. Returns the org_id the code belongs to, or
 *  an error message. */
export async function redeemInviteCode(
  code: string,
  userId: string
): Promise<{ orgId: string } | { error: string }> {
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
    return { error: "This invite code has already been used." };
  }
  const usedBy: string[] = row.used_by ?? [];
  if (usedBy.includes(userId)) {
    // Idempotent — already redeemed by this user.
    return { orgId: row.org_id };
  }
  await supabase
    .from("invite_codes")
    .update({
      used_count: (row.used_count ?? 0) + 1,
      used_by: [...usedBy, userId],
    })
    .eq("code", clean);
  return { orgId: row.org_id };
}
