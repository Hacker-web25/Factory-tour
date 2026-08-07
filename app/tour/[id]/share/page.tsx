"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Tour } from "@/lib/types";
import TopBar from "@/components/TopBar";
import { getMyProfile, type Profile } from "@/lib/auth";
import {
  createPresenterLink,
  createViewerLink,
  deleteLink,
  listShareLinks,
  revokeLink,
  type ShareLink,
} from "@/lib/shareLinks";
import {
  Copy as CopyIcon,
  Trash2,
  User,
  Globe,
  Lock,
  Mail,
  X,
} from "lucide-react";

/**
 * /tour/[id]/share — manages presenter + public viewer links for one tour.
 *
 *  - Org admins see a "Presenter links" section listing every presenter in
 *    their org; a button next to each creates (or copies) that person's
 *    unique link.
 *  - Everyone sees a "Public links" section for the Case 2 flow — password,
 *    email gate, expiry, view limit.
 */
export default function ShareLinksPage() {
  const params = useParams();
  const tourId = String(params?.id ?? "");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tour, setTour] = useState<Tour | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [presenters, setPresenters] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingViewer, setCreatingViewer] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await getMyProfile();
      setProfile(me);
      const [{ data: t }, ls] = await Promise.all([
        supabase.from("tours").select("*").eq("id", tourId).single(),
        listShareLinks(tourId),
      ]);
      setTour(t as Tour);
      setLinks(ls);
      if (me?.role === "org_admin" && me.org_id) {
        const { data: team } = await supabase
          .from("profiles")
          .select("*")
          .eq("org_id", me.org_id)
          .eq("role", "presenter")
          .order("email");
        setPresenters((team ?? []) as Profile[]);
      }
      setLoading(false);
    })();
  }, [tourId]);

  async function refresh() {
    setLinks(await listShareLinks(tourId));
  }

  async function makePresenterLink(userId: string) {
    const link = await createPresenterLink({ tourId, userId });
    if (link) refresh();
  }

  async function onViewerCreate(opts: {
    label: string;
    password: string;
    requireEmail: boolean;
    expiresDays: number | "";
    viewLimit: number | "";
  }) {
    const expiresAt =
      opts.expiresDays === "" || opts.expiresDays === 0
        ? null
        : new Date(Date.now() + Number(opts.expiresDays) * 86_400_000);
    const link = await createViewerLink({
      tourId,
      label: opts.label || undefined,
      password: opts.password || undefined,
      requireEmail: opts.requireEmail,
      expiresAt,
      viewLimit: opts.viewLimit === "" ? null : Number(opts.viewLimit),
    });
    if (link) {
      setCreatingViewer(false);
      refresh();
    }
  }

  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  function urlFor(link: ShareLink): string {
    return `${origin}/${link.kind === "presenter" ? "present" : "v"}/${link.token}`;
  }
  function copyUrl(link: ShareLink) {
    navigator.clipboard.writeText(urlFor(link)).catch(() => {});
  }

  const presenterLinks = useMemo(
    () => links.filter((l) => l.kind === "presenter"),
    [links]
  );
  const viewerLinks = useMemo(
    () => links.filter((l) => l.kind === "viewer"),
    [links]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-neutral-500 grid place-items-center text-sm">
        Loading…
      </div>
    );
  }
  if (!tour) {
    return (
      <div className="min-h-screen bg-black text-white grid place-items-center">
        Tour not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <TopBar />
      <main className="max-w-4xl mx-auto px-6 py-6">
        <div className="mb-6">
          <div className="eyebrow mb-0.5">Share</div>
          <h1 className="text-[22px] font-semibold leading-tight">
            {tour.title}
          </h1>
        </div>

        {/* PRESENTER LINKS — Case 1 */}
        {profile?.role === "org_admin" && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <User size={14} /> Presenter links
            </h2>
            <p className="text-xs text-neutral-500 mb-3">
              One link per salesperson. Every session presented through it
              attributes to that person in analytics.
            </p>
            {presenters.length === 0 ? (
              <div className="text-xs text-neutral-500 border border-dashed border-border rounded p-4 text-center">
                No presenters in your team yet. Add them from the{" "}
                <Link href="/team" className="text-accent hover:underline">
                  Team
                </Link>{" "}
                page.
              </div>
            ) : (
              <div className="space-y-1.5">
                {presenters.map((p) => {
                  const existing = presenterLinks.find(
                    (l) => l.owner_user_id === p.id
                  );
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 bg-panelSoft border border-border rounded px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">
                          {p.full_name || p.email}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate">
                          {existing
                            ? urlFor(existing)
                            : "No link created yet"}
                        </div>
                      </div>
                      {existing ? (
                        <>
                          <button
                            onClick={() => copyUrl(existing)}
                            className="chip !py-1"
                            title="Copy link"
                          >
                            <CopyIcon size={11} /> Copy
                          </button>
                          <LinkStatus link={existing} />
                          <button
                            onClick={async () => {
                              if (confirm("Revoke this presenter link?"))
                                await revokeLink(existing.id);
                              refresh();
                            }}
                            className="text-neutral-500 hover:text-red-400 p-1"
                            title="Revoke"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => makePresenterLink(p.id)}
                          className="chip !py-1 text-accent"
                        >
                          Create link
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* PUBLIC / VIEWER LINKS — Case 2 */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Globe size={14} /> Public viewer links
            </h2>
            <button
              onClick={() => setCreatingViewer(true)}
              className="bg-accent hover:bg-accentHover text-black text-[12px] font-medium px-3 py-1.5 rounded"
            >
              + New public link
            </button>
          </div>
          <p className="text-xs text-neutral-500 mb-3">
            Share these with end viewers (customers, prospects). Add a
            password, email gate, expiry or view limit as needed.
          </p>

          {viewerLinks.length === 0 ? (
            <div className="text-xs text-neutral-500 border border-dashed border-border rounded p-6 text-center">
              No public links yet. Create one to start sharing the tour.
            </div>
          ) : (
            <div className="space-y-1.5">
              {viewerLinks.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-3 bg-panelSoft border border-border rounded px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate flex items-center gap-2">
                      {l.label || "Public link"}
                      {l.password_hash && (
                        <Lock size={11} className="text-yellow-400" />
                      )}
                      {l.require_email && (
                        <Mail size={11} className="text-cyan-400" />
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {urlFor(l)} · {l.view_count} view
                      {l.view_count === 1 ? "" : "s"}
                      {l.view_limit ? ` / ${l.view_limit}` : ""}
                      {l.expires_at
                        ? ` · expires ${new Date(
                            l.expires_at
                          ).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => copyUrl(l)}
                    className="chip !py-1"
                    title="Copy link"
                  >
                    <CopyIcon size={11} /> Copy
                  </button>
                  <LinkStatus link={l} />
                  <button
                    onClick={async () => {
                      if (
                        confirm(
                          "Delete this public link? Any session started with it will keep its analytics."
                        )
                      ) {
                        await deleteLink(l.id);
                        refresh();
                      }
                    }}
                    className="text-neutral-500 hover:text-red-400 p-1"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {creatingViewer && (
          <NewViewerLinkModal
            onCancel={() => setCreatingViewer(false)}
            onCreate={onViewerCreate}
          />
        )}
      </main>
    </div>
  );
}

function LinkStatus({ link }: { link: ShareLink }) {
  if (link.revoked_at) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/40">
        revoked
      </span>
    );
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/40">
        expired
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
      live
    </span>
  );
}

function NewViewerLinkModal({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (opts: {
    label: string;
    password: string;
    requireEmail: boolean;
    expiresDays: number | "";
    viewLimit: number | "";
  }) => void;
}) {
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [requireEmail, setRequireEmail] = useState(false);
  const [expiresDays, setExpiresDays] = useState<number | "">("");
  const [viewLimit, setViewLimit] = useState<number | "">("");
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[480px] max-w-full p-5 shadow-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold">New public link</h3>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="eyebrow mb-1">Label (optional)</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Q4 campaign, Trade-show 2026"
              className="field w-full"
            />
          </div>
          <div>
            <div className="eyebrow mb-1">Password (optional)</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for open access"
              className="field w-full"
            />
          </div>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={requireEmail}
              onChange={(e) => setRequireEmail(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Require email before viewing
              <div className="text-[10px] text-neutral-500">
                Captures the viewer's email as a lead. Shown once per browser.
              </div>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="eyebrow mb-1">Expires in (days)</div>
              <input
                type="number"
                min={1}
                value={expiresDays}
                onChange={(e) =>
                  setExpiresDays(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                placeholder="never"
                className="field w-full"
              />
            </div>
            <div>
              <div className="eyebrow mb-1">Max views</div>
              <input
                type="number"
                min={1}
                value={viewLimit}
                onChange={(e) =>
                  setViewLimit(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                placeholder="unlimited"
                className="field w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="text-xs text-neutral-400 hover:text-white px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onCreate({
                label,
                password,
                requireEmail,
                expiresDays,
                viewLimit,
              })
            }
            className="bg-accent hover:bg-accentHover text-black text-xs font-medium px-3 py-1.5 rounded"
          >
            Create link
          </button>
        </div>
      </div>
    </div>
  );
}
