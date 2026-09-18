import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { NotificationBell } from "@/features/notifications";
import { AccountSwitcher } from "@/features/organizations";
import { requireSession } from "@/lib/auth";
import { api } from "@/lib/api";
import { orgsEnabled, orgsExposed } from "@/lib/tenancy";

/**
 * Authenticated app shell (spec 7.4). Wraps both the personal dashboard and the
 * org context routes so they share one navbar + the global account switcher
 * (spec 3.5). `requireSession` is the authoritative guard; the switcher's data
 * resolves over HTTP (`GET /v1/organizations`) — the web holds no database
 * since faza 2.8. No personal-account backfill here: Nest self-heals it on
 * every personal-scoped request (`getOrCreatePersonalAccount`) and creates it
 * at sign-up/verification/accept, so there is nothing left to ensure.
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
