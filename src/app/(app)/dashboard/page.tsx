import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Personal-context dashboard (spec 3.5). The active tenant here is the user's
 * personal account; org contexts live under `/orgs/[slug]`. The shared `(app)`
 * layout provides the navbar + account switcher and the authoritative session
 * guard; this page re-reads the session for its own content (spec 4.2).
 */
export default async function DashboardPage() {
  const session = await requireSession("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Personal</h1>
        <Link
          href="/orgs/new"
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          New organization
        </Link>
      </div>

      {!session.user.emailVerified ? (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          Please verify your email address. Check your inbox for the verification link.
        </div>
      ) : null}

      <p className="text-sm text-black/70 dark:text-white/70">
        Signed in as <span className="font-medium">{session.user.email}</span>. Use the switcher
        above to move between your personal account and organizations.
      </p>
    </div>
  );
}
