/**
 * lib/server/backupTables.ts — every table the nightly backup copies. SERVER ONLY.
 *
 * Supabase Free has no automatic backups (security-review-2026-10.md). Until the
 * project is on a paid plan with point-in-time recovery, this list plus
 * lib/server/dbBackup.ts is the only way to get the data back after a mistake
 * or an outage.
 *
 * PostgREST (the API the app's service-role key talks to) has no "list every
 * table" endpoint, so the list is kept here by hand rather than read from the
 * database at run time. Checked against the live project on 2 Nov 2026 with:
 *
 *   select table_name from information_schema.tables
 *   where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;
 *
 * IMPORTANT: when a migration adds a new public table, add its name here too,
 * or that table is silently left out of every backup from then on.
 */

export const BACKUP_TABLES: readonly string[] = [
  "active_sessions",
  "asset_folders",
  "billing_alerts",
  "billing_credit_notes",
  "billing_invoice_counters",
  "billing_invoices",
  "billing_orders",
  "billing_payments",
  "billing_refunds",
  "billing_webhook_events",
  "calendar_events",
  "campaign_codes",
  "campaign_folders",
  "campaign_scans",
  "clients",
  "coupons",
  "email_campaigns",
  "email_recipient_stats",
  "folders",
  "funnel_leads",
  "funnel_otp",
  "hotspots",
  "invite_codes",
  "login_attempts",
  "order_usage",
  "organizations",
  "plan_events",
  "presence",
  "presentation_sessions",
  "profiles",
  "qualification_leads",
  "rate_limits",
  "recent_uploads",
  "recording_stops",
  "sales_enquiries",
  "scenes",
  "security_audit_log",
  "share_links",
  "site_events",
  "site_visitors",
  "support_reminders",
  "tour_assignments",
  "tour_events",
  "tours",
  "vpv_secrets",
  "vpv_unlock_attempts",
] as const;
