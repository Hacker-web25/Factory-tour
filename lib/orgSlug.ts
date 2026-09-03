import { supabase } from "@/lib/supabase";

/** Convert an org name to a URL-safe slug. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "org";
}

/** Generate a unique slug for a new org — appends a short suffix if
 *  the base slug is already taken. */
export async function uniqueSlugForOrg(name: string): Promise<string> {
  const base = slugify(name);
  const { data: existing } = await supabase
    .from("organizations")
    .select("slug")
    .eq("slug", base)
    .maybeSingle();
  if (!existing) return base;
  // Add 4-char random suffix.
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
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
