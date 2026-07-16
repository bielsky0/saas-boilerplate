import type { Metadata } from "next";
import Link from "next/link";

import { Alert, Button } from "@/components/ui";
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
        <Button asChild variant="outline" size="sm">
          <Link href="/orgs/new">New organization</Link>
        </Button>
      </div>

      {!session.user.emailVerified ? (
        <Alert role="status" variant="warning">
          Please verify your email address. Check your inbox for the verification link.
        </Alert>
      ) : null}

      <p className="text-muted-foreground text-sm">
        Signed in as <span className="text-foreground font-medium">{session.user.email}</span>. Use
        the switcher above to move between your personal account and organizations.
      </p>
    </div>
  );
}
