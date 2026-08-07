"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TopBar from "@/components/TopBar";
import {
  getMyProfile,
  invitePresenter,
  type Profile,
} from "@/lib/auth";
import {
  UserPlus,
  Trash2,
  Copy as CopyIcon,
  X,
  BarChart3,
  Share2,
  Link as LinkIcon,
} from "lucide-react";
import type { Tour } from "@/lib/types";
import {
  createPresenterLink,
  listShareLinks,
  type ShareLink,
} from "@/lib/shareLinks";
import Link from "next/link";

/**
 * /team — org_admin invites presenters, sees the team list, revokes
 * accounts. Presenters they invite get a temp password shown once so
 * the admin can pass it along by email/SMS.
 */
export default function TeamPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<{
    email: string;
    password: string;
  } | null>(null);
  // Modal state for per-presenter actions.
  const [assignFor, setAssignFor] = useState<Profile | null>(null);
  const [analyticsFor, setAnalyticsFor] = useState<Profile | null>(null);
  // Org's tours — loaded once, reused by both modals.
  const [orgTours, setOrgTours] = useState<Tour[]>([]);

  async function refresh(profile: Profile) {
    if (!profile.org_id) {
      setTeam([]);
      setOrgTours([]);
      return;
    }
    const [{ data: members }, { data: tours }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("org_id", profile.org_id)
        .neq("id", profile.id)
        .order("created_at", { ascending: false }),
      // Tours belonging to this org — needed by the Assign modal so we
      // can offer a picker without another round-trip per click.
      supabase
        .from("tours")
        .select("id, title, thumbnail_path")
        .eq("org_id", profile.org_id)
        .order("updated_at", { ascending: false }),
    ]);
    setTeam((members ?? []) as Profile[]);
    setOrgTours((tours ?? []) as Tour[]);
  }

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.push("/login?next=/team");
        return;
      }
      if (p.role !== "org_admin" && p.role !== "owner") {
        // Only org_admins and the site owner manage teams.
        setMe(p);
        setLoading(false);
        return;
      }
      setMe(p);
      await refresh(p);
      setLoading(false);
    })();
  }, [router]);

  async function onInvite(email: string, fullName: string) {
    if (!me?.org_id) return;
    const res = await invitePresenter({
      email,
      fullName: fullName || undefined,
      orgId: me.org_id,
    });
    if ("error" in res && res.error) {
      alert("Invite failed: " + (res.error as Error).message);
      return;
    }
    setInviting(false);
    setIssued({ email, password: res.tempPassword! });
    await refresh(me);
  }

  async function removeMember(id: string) {
    if (!confirm("Remove this presenter? Their existing analytics stay.")) return;
    // Detach from org — we don't delete the auth user (that requires
    // admin API). Setting org_id = null removes their team access
    // immediately.
    await supabase.from("profiles").update({ org_id: null }).eq("id", id);
    if (me) await refresh(me);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-neutral-500 grid place-items-center text-sm">
        Loading…
      </div>
    );
  }
  if (!me) return null;
  if (me.role !== "org_admin" && me.role !== "owner") {
    return (
      <div className="min-h-screen text-white">
        <TopBar />
        <main className="max-w-2xl mx-auto px-6 py-10 text-center">
          <div className="text-lg font-semibold mb-2">Not available</div>
          <p className="text-sm text-neutral-400">
            Only organization admins can manage the team.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <TopBar />
      <main className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="eyebrow mb-0.5">Team</div>
            <h1 className="text-[22px] font-semibold leading-tight">
              Presenters
            </h1>
          </div>
          <button
            onClick={() => setInviting(true)}
            className="flex items-center gap-1.5 bg-accent hover:bg-accentHover text-black font-medium px-3 py-1.5 rounded text-[12px]"
          >
            <UserPlus size={14} /> Invite presenter
          </button>
        </div>

        {team.length === 0 ? (
          <div className="border border-dashed border-border rounded p-8 text-center text-sm text-neutral-500">
            No presenters yet. Invite your first one to start sharing tours.
          </div>
        ) : (
          <div className="space-y-1.5">
            {team.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 bg-panelSoft border border-border rounded px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">
                    {p.full_name || p.email}
                  </div>
                  <div className="text-[11px] text-neutral-500 truncate">
                    {p.email} · {p.role}
                  </div>
                </div>
                <button
                  onClick={() => setAssignFor(p)}
                  className="chip !py-1 flex items-center gap-1"
                  title="Assign a tour to this presenter (creates their link)"
                >
                  <Share2 size={11} /> Assign tour
                </button>
                <button
                  onClick={() => setAnalyticsFor(p)}
                  className="chip !py-1 flex items-center gap-1"
                  title="See this presenter's analytics"
                >
                  <BarChart3 size={11} /> Analytics
                </button>
                <button
                  onClick={() => removeMember(p.id)}
                  className="text-neutral-500 hover:text-red-400 p-1"
                  title="Remove from team"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {inviting && (
          <InviteModal
            onCancel={() => setInviting(false)}
            onSubmit={onInvite}
          />
        )}

        {issued && (
          <IssuedPasswordModal
            info={issued}
            onClose={() => setIssued(null)}
          />
        )}

        {assignFor && (
          <AssignTourModal
            presenter={assignFor}
            tours={orgTours}
            onClose={() => setAssignFor(null)}
          />
        )}

        {analyticsFor && (
          <PresenterAnalyticsModal
            presenter={analyticsFor}
            tours={orgTours}
            onClose={() => setAnalyticsFor(null)}
          />
        )}
      </main>
    </div>
  );
}

/** Assign-a-tour modal — lists every tour in the org. Each row shows
 *  whether a presenter link already exists for that (tour, presenter)
 *  pair. Clicking "Create" makes one; clicking "Copy" grabs the URL to
 *  paste into an email. */
function AssignTourModal({
  presenter,
  tours,
  onClose,
}: {
  presenter: Profile;
  tours: Tour[];
  onClose: () => void;
}) {
  const [links, setLinks] = useState<Record<string, ShareLink | undefined>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    (async () => {
      // Load existing presenter links for each tour so we can show
      // "Copy" instead of "Create" where a link already exists.
      const next: Record<string, ShareLink> = {};
      for (const t of tours) {
        const ls = await listShareLinks(t.id);
        const mine = ls.find(
          (l) =>
            l.kind === "presenter" &&
            l.owner_user_id === presenter.id &&
            !l.revoked_at
        );
        if (mine) next[t.id] = mine;
      }
      setLinks(next);
    })();
  }, [tours, presenter.id]);

  async function make(tourId: string) {
    setBusy(tourId);
    const link = await createPresenterLink({
      tourId,
      userId: presenter.id,
    });
    setBusy(null);
    if (link) setLinks((m) => ({ ...m, [tourId]: link }));
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[520px] max-w-full p-5 shadow-panel"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[15px] font-semibold">Assign a tour</h3>
            <p className="text-xs text-neutral-500">
              to {presenter.full_name || presenter.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {tours.length === 0 ? (
          <div className="text-xs text-neutral-500 border border-dashed border-border rounded p-6 text-center">
            No tours in your organization yet. Ask the site owner to attach
            a tour to your org from their admin panel.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {tours.map((t) => {
              const existing = links[t.id];
              const url = existing ? `${origin}/present/${existing.token}` : "";
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 bg-panelSoft border border-border rounded px-2 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {t.title}
                    </div>
                    {existing && (
                      <div className="text-[10px] text-neutral-500 truncate">
                        {url}
                      </div>
                    )}
                  </div>
                  {existing ? (
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(url).catch(() => {})
                      }
                      className="chip !py-1 flex items-center gap-1"
                    >
                      <CopyIcon size={11} /> Copy link
                    </button>
                  ) : (
                    <button
                      onClick={() => make(t.id)}
                      disabled={busy === t.id}
                      className="chip !py-1 text-accent disabled:opacity-50"
                    >
                      {busy === t.id ? "Creating…" : "Create link"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[10px] text-neutral-500 mt-3">
          A link is a URL you send to the presenter. Each session they
          run through it is attributed to them in analytics.
        </div>
      </div>
    </div>
  );
}

/** Presenter-analytics modal — lists every tour in the org and links
 *  to the tour's analytics page pre-filtered to this presenter. */
function PresenterAnalyticsModal({
  presenter,
  tours,
  onClose,
}: {
  presenter: Profile;
  tours: Tour[];
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[480px] max-w-full p-5 shadow-panel"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[15px] font-semibold">Analytics</h3>
            <p className="text-xs text-neutral-500">
              for {presenter.full_name || presenter.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {tours.length === 0 ? (
          <div className="text-xs text-neutral-500 border border-dashed border-border rounded p-6 text-center">
            No tours in your organization yet.
          </div>
        ) : (
          <>
            <p className="text-xs text-neutral-500 mb-3">
              Pick a tour to see this presenter's sessions on it.
            </p>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {tours.map((t) => (
                <Link
                  key={t.id}
                  href={`/analytics/${t.id}?presenter=${presenter.id}`}
                  className="flex items-center gap-2 bg-panelSoft border border-border rounded px-2 py-1.5 hover:border-accent/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {t.title}
                    </div>
                  </div>
                  <span className="chip !py-1 flex items-center gap-1">
                    <LinkIcon size={11} /> Open
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InviteModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (email: string, fullName: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSubmit(email, fullName);
          setBusy(false);
        }}
        className="bg-panel border border-border rounded-lg w-[420px] max-w-full p-5 shadow-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold">Invite presenter</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-neutral-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="eyebrow mb-1">Email</div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field w-full"
              autoFocus
            />
          </div>
          <div>
            <div className="eyebrow mb-1">Name (optional)</div>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="field w-full"
            />
          </div>
        </div>
        <div className="text-[10px] text-neutral-500 mt-3">
          A temporary password will be generated. Copy it from the next
          screen and share it with the presenter — they can change it
          after signing in.
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-neutral-400 hover:text-white px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-accent hover:bg-accentHover text-black text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
          >
            {busy ? "Inviting…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}

function IssuedPasswordModal({
  info,
  onClose,
}: {
  info: { email: string; password: string };
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[440px] max-w-full p-5 shadow-panel"
      >
        <h3 className="text-[15px] font-semibold mb-1">
          Invitation created
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          Copy this password now — it won't be shown again. Send it (along
          with the login URL) to <b>{info.email}</b>.
        </p>
        <div className="bg-panelSoft border border-border rounded p-3 mb-2 font-mono text-sm select-all">
          {info.password}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(info.password).catch(() => {});
          }}
          className="chip !py-1 mb-4"
        >
          <CopyIcon size={11} /> Copy password
        </button>
        <div className="text-[10px] text-neutral-500 mb-4">
          Login URL: {typeof window !== "undefined" && window.location.origin}
          /login
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="bg-accent hover:bg-accentHover text-black text-xs font-medium px-3 py-1.5 rounded"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
