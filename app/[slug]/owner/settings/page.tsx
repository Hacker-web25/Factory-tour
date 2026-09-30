/**
 * /[slug]/owner/settings — org-admin settings page.
 *
 * Lives at aryan.myvpv.com/settings (the subdomain middleware rewrites
 * /settings → /[slug]/owner/settings under the hood).
 *
 * Sections:
 *   • Account — display name, email (read-only), signed-in-as banner
 *   • Security — change password
 *
 * More sections (org profile, team, billing) can drop in as new
 * <section> blocks — the shell is stable.
 */

import ChangePassword from "@/components/dashboard/ChangePassword";
import AccountInfo from "@/components/dashboard/AccountInfo";

export default function SettingsPage() {
  return (
    <div
      style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "32px 24px 80px",
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "var(--vpv-ink, #0f172a)",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Settings
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--vpv-ink-muted, #64748b)",
            margin: "6px 0 0",
          }}
        >
          Manage your account and organisation.
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--vpv-ink, #0f172a)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "0 0 12px",
          }}
        >
          Account
        </h2>
        <AccountInfo />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--vpv-ink, #0f172a)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "0 0 12px",
          }}
        >
          Security
        </h2>
        <ChangePassword />
      </section>
    </div>
  );
}
