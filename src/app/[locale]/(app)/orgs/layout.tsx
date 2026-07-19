import type { ReactNode } from "react";

import { requireOrgsEnabled } from "@/features/organizations/context";

/**
 * Org subtree guard (spec 1.4). Exists for exactly one reason: `/orgs/new` never
 * calls `requireOrgAccess`, so the chokepoint guard cannot reach it. Guarding the
 * whole subtree here rather than per page also means a future org route is covered
 * the moment it is created.
 *
 * ⚠️ INVARIANT: this and `requireOrgAccess` must BOTH refuse with `notFound()`.
 * Both fire for `/orgs/[slug]` and the App Router does not guarantee which
 * resolves first — identical outcomes today, but switch one to `forbidden()` and
 * the status code for that route becomes nondeterministic.
 */
export default function OrgsLayout({ children }: { children: ReactNode }) {
  requireOrgsEnabled();
  return children;
}
