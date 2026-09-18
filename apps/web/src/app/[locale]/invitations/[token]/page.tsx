import Link from "next/link";

import { Button } from "@/components/ui";
import { AcceptInvitationForm } from "@/features/organizations/components/accept-invitation-form";
import { requireOrgsEnabled } from "@/features/organizations/context";
import { getServerSession } from "@/lib/auth";
import { api } from "@/lib/api";

/**
 * Accept-invitation landing (spec 3.3) — a public route (see PUBLIC_PATHS).
 *
 * Handles both scenarios: an existing user signs in and returns here; a new user
 * registers and returns here — both then see the Accept button. The page never
 * reveals whether the invited email already has an account (privacy, §3.3): the
 * signed-out state always offers both "sign in" and "create account".
 *
 * Validity resolves over HTTP (`GET /v1/invitations/{token}` — public by
 * design, `valid: false` for every dead end alike) — the web holds no
 * database since faza 2.8.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      {children}
    </main>
  );
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Lives outside `(app)`, so no layout reaches it — it carries the §1.4 guard
  // itself. An invitation link already in flight 404s once orgs are disabled.
  requireOrgsEnabled();
  const { token } = await params;
  const lookup = await api().get<{ valid: boolean; orgName: string | null; role: string | null }>(
    `/v1/invitations/${encodeURIComponent(token)}`,
  );

  if (!lookup.valid) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Invitation unavailable</h1>
        <p className="text-muted-foreground text-sm">
          This invitation link is invalid, has expired, or has already been used.
        </p>
        <div>
          <Button asChild variant="link">
            <Link href="/dashboard">Go to your dashboard</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const orgName = lookup.orgName ?? "an organization";
  const session = await getServerSession();
  const returnTo = `/invitations/${token}`;

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Join {orgName}</h1>
      <p className="text-muted-foreground text-sm">
        You&apos;ve been invited to join{" "}
        <span className="text-foreground font-medium">{orgName}</span> as {lookup.role}.
      </p>

      {session ? (
        <AcceptInvitationForm token={token} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Sign in or create an account to accept.</p>
          <div className="flex gap-3">
            <Button asChild>
              <Link href={`/login?callbackUrl=${encodeURIComponent(returnTo)}`}>Log in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/signup?callbackUrl=${encodeURIComponent(returnTo)}`}>
                Create account
              </Link>
            </Button>
          </div>
        </div>
      )}
    </Shell>
  );
}
