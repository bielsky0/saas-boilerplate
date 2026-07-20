import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { NotificationBell } from "@/features/notifications";
import { ensurePersonalAccount } from "@/features/organizations/data";
import { servedOrganization } from "@/features/organizations/served-org";
import { requireSession } from "@/lib/auth";

/**
 * Authenticated app shell (spec 7.4). Wraps both the apex account surface and an
 * academy's panel. `requireSession` is the authoritative guard. The personal
 * account is ensured on entry as a backfill for users created before the
 * registration hook existed (spec 3.1) — unconditionally in all three tenancy
 * modes, because in `disabled` the personal account IS the tenant, which makes it
 * more load-bearing, not less.
 *
 * THE ACCOUNT SWITCHER IS GONE (F4.6, §2.19 exception #5). Its replacement is a
 * directory on the apex dashboard, not a control in this navbar: an academy is a
 * separate origin requiring its own sign-in, so there is nothing to switch
 * between within one session. What the navbar shows instead is WHERE YOU ARE —
 * the academy's name on its host, the product name on the apex — because with
 * several academies open in several tabs, that is the question the header has to
 * answer.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("/dashboard");
  await ensurePersonalAccount(session.user.id);
  // Null on the apex. Deliberately not `requireServedOrganization` — this layout
  // also serves the apex, where having no academy is the normal case.
  const org = await servedOrganization();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="shrink-0 font-semibold">
              {org ? org.name : "SaaS"}
            </Link>
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
