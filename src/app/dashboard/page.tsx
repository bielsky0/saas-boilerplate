import type { Metadata } from "next";

import { SignOutButton } from "@/features/auth";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Reference protected route (spec 4.2). `requireSession` is the authoritative
 * server-side guard — middleware only does an optimistic cookie check. Copy this
 * pattern for any authenticated page or server action.
 */
export default async function DashboardPage() {
  const session = await requireSession("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <SignOutButton />
      </header>

      {!session.user.emailVerified ? (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          Please verify your email address. Check your inbox for the verification link.
        </div>
      ) : null}

      <p className="text-sm text-black/70 dark:text-white/70">
        Signed in as <span className="font-medium">{session.user.email}</span>.
      </p>
    </main>
  );
}
