/**
 * Server-side audit log writer.
 *
 * Fire-and-forget. If the RPC errors (missing migration, DB down),
 * the error is logged but the caller is never thrown at — audit
 * failures must never block the real work.
 */

import { supabase } from "@/lib/supabase";

export type AuditEvent =
  | "login.success"
  | "login.failure"
  | "login.locked"
  | "login.new_device"
  | "password.changed"
  | "password.reset_requested"
  | "signup.sales"
  | "invite.generated"
  | "invite.redeemed"
  | "share_link.created"
  | "share_link.blocked"
  | "share_link.brute_force"
  | "device.slot_full"
  | "device.slot_released"
  | "apply.submitted"
  | "ratelimit.hit";

export async function logSecurityEvent(args: {
  event: AuditEvent;
  orgId?: string | null;
  subject?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await supabase.rpc("log_security_event", {
      p_event: args.event,
      p_org_id: args.orgId ?? null,
      p_subject: args.subject ?? null,
      p_meta: (args.meta ?? {}) as never,
      p_ip: args.ip ?? null,
      p_user_agent: args.userAgent ?? null,
    });
  } catch (e) {
    if (typeof window === "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[audit] log failed:", (e as Error)?.message);
    }
  }
}
