import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/features/auth";
import { AccountSwitcher } from "@/features/organizations";
import { ensurePersonalAccount, listUserOrgs } from "@/features/organizations/data";
import { requireSession } from "@/lib/auth";

/**
 * Authenticated app shell (spec 7.4). Wraps both the personal dashboard and the
 * org context routes so they share one navbar + the global account switcher
 * (spec 3.5). `requireSession` is the authoritative guard; the switcher's data is
 * resolved here server-side. The personal account is ensured on entry as a
 * backfill for users created before the registration hook existed (spec 3.1).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("/dashboard");
  await ensurePersonalAccount(session.user.id);
  const orgs = await listUserOrgs(session.user.id);
  const personalLabel = session.user.name ?? session.user.email;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-semibold">
              SaaS
            </Link>
            <AccountSwitcher personalLabel={personalLabel} orgs={orgs} />
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
