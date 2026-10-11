import type { ReactNode } from "react";

import { AdminShell } from "@/components/layout/admin-shell";
import { requireSession } from "@/lib/auth";
import { api } from "@/lib/api";
import { orgsEnabled, orgsExposed } from "@/lib/tenancy";

/**
 * Authenticated app shell (spec 7.4, etap 4 faza 2 — AdminCN chrome).
 *
 * Guard + data resolve exactly as before (`requireSession` is authoritative;
 * orgs over HTTP `GET /v1/organizations`); only the chrome changed from the
 * hand-rolled navbar to the AdminCN sidebar/header/footer (`AdminShell`).
 * `requireSession` stays the guard; `AdminShell` is a pure client boundary.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("/dashboard");
  // Skipping the query in `disabled` is not just an optimization: it is the
  // layout stating that the org table is not consulted at all in that mode (§1.4).
  // (Nest answers `{items: []}` there anyway — belt and suspenders.)
  const orgs = orgsEnabled
    ? (
        await api().get<{ items: { id: string; name: string; slug: string; role: string }[] }>(
          "/v1/organizations",
        )
      ).items
    : [];
  // `optional` shows the switcher only to users who already have an org — orgs
  // work, but the main flow never advertises them.
  const showSwitcher = orgsEnabled && (orgsExposed || orgs.length > 0);
  const personalLabel = session.user.name ?? session.user.email;

  return (
    <AdminShell
      user={{ name: session.user.name, email: session.user.email }}
      personalLabel={personalLabel}
      orgs={orgs}
      showSwitcher={showSwitcher}
      showNewOrg={orgsExposed}
      orgsEnabled={orgsEnabled}
    >
      {children}
    </AdminShell>
  );
}
