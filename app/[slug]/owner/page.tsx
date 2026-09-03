"use client";

/**
 * /{org_slug}/owner — thin wrapper around the client dashboard that
 * validates the slug in the URL matches the signed-in user's org
 * before rendering. Enforces the "you can only see YOUR org's
 * dashboard" rule.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ClientDashboardPage from "@/app/client/page";
import { getMyProfile } from "@/lib/auth";
import { orgBySlug, slugForOrgId } from "@/lib/orgSlug";

export default function OwnerDashboardBySlug() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [ok, setOk] = useState<null | boolean>(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (!p) {
        router.replace(`/login?next=/${params.slug}/owner`);
        return;
      }
      // Super-owner (that's you, NITIN) always goes to the cross-org
      // tour editor at /, regardless of which slug URL they typed.
      if (p.role === "owner") {
        router.replace("/");
        return;
      }
      if (!p.org_id) {
        router.replace("/setup");
        return;
      }
      // Ensure the slug in the URL is theirs.
      const org = await orgBySlug(params.slug);
      if (!org || org.id !== p.org_id) {
        // Redirect to their actual dashboard.
        const mySlug = await slugForOrgId(p.org_id);
        if (mySlug) {
          router.replace(
            `/${mySlug}/${p.role === "presenter" ? "sales" : "owner"}`
          );
        } else {
          router.replace("/setup");
        }
        return;
      }
      if (p.role === "presenter") {
        router.replace(`/${params.slug}/sales`);
        return;
      }
      setOk(true);
    })();
  }, [params.slug, router]);

  if (ok !== true) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white/40 text-sm">
        Verifying access…
      </div>
    );
  }
  return <ClientDashboardPage />;
}
