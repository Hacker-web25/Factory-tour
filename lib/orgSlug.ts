import { supabase } from "@/lib/supabase";
import { RESERVED_SLUGS } from "@/lib/reservedSlugs";

/** Convert an org name to a URL-safe slug. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "org";
}

/** Generate a unique slug for a new org — appends a short suffix if
 *  the base slug is already taken OR collides with a reserved word
 *  (app, login, admin, www, …). Reserved words are treated exactly
 *  like a taken slug: a new org named "App Solutions" gets
 *  "app-x7q2", never the bare "app", which would otherwise silently
 *  break that tenant's subdomain (and the platform's own routing). */
export async function uniqueSlugForOrg(name: string): Promise<string> {
  const base = slugify(name);

  const isTaken = async (candidate: string): Promise<boolean> => {
    if (RESERVED_SLUGS.has(candidate)) return true;
    const { data } = await supabase
      .from("organizations")
      .select("slug")
      .eq("slug", candidate)
      .maybeSingle();
    return !!data;
  };

  if (!(await isTaken(base))) return base;

  // Collision (taken or reserved) — retry with a random suffix a
  // handful of times rather than trusting one shot, since a suffixed
  // slug could itself (extremely rarely) already exist.
  for (let i = 0; i < 5; i++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Last resort — timestamp fragment is effectively unique.
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}

/** Resolve slug → org row. Returns null if not found. */
export async function orgBySlug(slug: string) {
  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data ?? null;
}

/** Resolve org_id → slug. Cached in a module-level map for the session. */
const orgIdToSlugCache = new Map<string, string>();
export async function slugForOrgId(orgId: string): Promise<string | null> {
  const cached = orgIdToSlugCache.get(orgId);
  if (cached) return cached;
  const { data } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", orgId)
    .maybeSingle();
  const slug = data?.slug ?? null;
  if (slug) orgIdToSlugCache.set(orgId, slug);
  return slug;
}
