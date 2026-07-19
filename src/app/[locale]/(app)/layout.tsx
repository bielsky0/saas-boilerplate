import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { NotificationBell } from "@/features/notifications";
import { AccountSwitcher } from "@/features/organizations";
import { ensurePersonalAccount } from "@/features/organizations/data";
import { listUserOrgs } from "@/features/organizations/cross-tenant";
import { requireSession } from "@/lib/auth";
import { orgsEnabled, orgsExposed } from "@/lib/tenancy";

/**
 * Authenticated app shell (spec 7.4). Wraps both the personal dashboard and the
 * org context routes so they share one navbar + the global account switcher
 * (spec 3.5). `requireSession` is the authoritative guard; the switcher's data is
 * resolved here server-side. The personal account is ensured on entry as a
 * backfill for users created before the registration hook existed (spec 3.1) —
 * unconditionally in all three tenancy modes, because in `disabled` the personal
 * account IS the tenant, which makes it more load-bearing, not less.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("/dashboard");
  await ensurePersonalAccount(session.user.id);
  // Skipping the query in `disabled` is not just an optimization: it is the
  // layout stating that the org table is not consulted at all in that mode (§1.4).
  const orgs = orgsEnabled ? await listUserOrgs(session.user.id) : [];
  // `optional` shows the switcher only to users who already have an org — orgs
  // work, but the main flow never advertises them.
  const showSwitcher = orgsEnabled && (orgsExposed || orgs.length > 0);
  const personalLabel = session.user.name ?? session.user.email;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="shrink-0 font-semibold">
              SaaS
            </Link>
            {showSwitcher ? (
              <AccountSwitcher personalLabel={personalLabel} orgs={orgs} showNewOrg={orgsExposed} />
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
