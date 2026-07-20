import type { ReactNode } from "react";

import { requireOrgsEnabled } from "@/features/organizations/context";

/**
 * Guard for what is LEFT of the `/orgs` subtree (spec 1.4).
 *
 * Since F4.6 that is `/orgs/new` alone: every other org route moved to
 * `/dashboard/*` on the academy's own host. `/orgs/new` cannot move with them —
 * it is where an academy is created, so there is no academy host to serve it
 * from yet, and it stays `stage: "apex"` in `reserved-slugs.ts` for that reason.
 *
 * It also never calls `requireOrgAccess` (there is no org to authorize against),
 * which is why the §1.4 refusal has to be stated here rather than inherited from
 * the chokepoint.
 */
export default function OrgsLayout({ children }: { children: ReactNode }) {
  requireOrgsEnabled();
  return children;
}
