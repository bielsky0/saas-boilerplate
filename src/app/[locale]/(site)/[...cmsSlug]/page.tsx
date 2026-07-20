import { notFound } from "next/navigation";

import { servedOrganization } from "@/features/organizations/served-org";

/**
 * An academy's public CMS page — THE SEAM, not the implementation (F4.5).
 *
 * Every path on a tenant host that the app router does not own reaches here:
 * `src/proxy.ts` checks `reservedPrefixOf(bare)` and forwards whatever is left
 * (see the tenant-host branch there). This file is where `docs/specyfikacja-cms.md`
 * §4 will look the `page` row up and render it through Payload.
 *
 * ⚠️ 404 HERE IS THE INTENDED BEHAVIOUR OF THIS PHASE, NOT A MISSING PIECE.
 * Payload is not installed and there is no `page` table yet, so every CMS path
 * answers 404 — and that answer is asserted by
 * `e2e/langlion-subdomain-routing.spec.ts`, because "the CMS branch is reachable
 * and does not fall through to auth" is exactly what F4.5 had to prove. Deleting
 * the test along with the TODO would remove the only evidence that the routing
 * works.
 *
 * The academy's home page (empty slug) does NOT arrive here: a catch-all segment
 * does not match the empty path, so `/` is handled in `[locale]/page.tsx`.
 */

/*
 * This page reads `headers()` via `servedOrganization`, so it cannot be
 * prerendered. Stating it explicitly rather than relying on the dynamic API to
 * force it: without this, a future refactor that memoizes the lookup could make
 * the route statically eligible and freeze ONE academy's 404 for every tenant.
 */
export const dynamic = "force-dynamic";

export default async function CmsPage() {
  const org = await servedOrganization();

  // No tenant (apex, foreign host) or an academy that does not exist / was
  // soft-deleted. One 404 for all three, deliberately — D57 in the phase plan
  // explains why this is not a redirect to the apex.
  if (!org) notFound();

  // TODO(CMS): resolve `page` by (org.id, slug) and render it through Payload —
  // docs/specyfikacja-cms.md §4. `slug` is the joined `cmsSlug` segments; the
  // reserved-prefix check has already happened in the proxy, and the same list
  // (`isReservedSlug`) must gate page creation so a slug can never be saved that
  // this route would not be reached for.
  notFound();
}
