import Link from "next/link";
import { createHash } from "node:crypto";

import { Button } from "@/components/ui";
import { AcceptInvitationForm } from "@/features/organizations/components/accept-invitation-form";
import { requireOrgsEnabled } from "@/features/organizations/context";
import { getInvitationWithValidity, getOrgById } from "@/features/organizations/data";
import { getServerSession } from "@/lib/auth";

/**
 * Accept-invitation landing (spec 3.3) — a public route (see PUBLIC_PATHS).
 *
 * Handles both scenarios: an existing user signs in and returns here; a new user
 * registers and returns here — both then see the Accept button. The page never
 * reveals whether the invited email already has an account (privacy, §3.3): the
 * signed-out state always offers both "sign in" and "create account".
 */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

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
  const { invite, valid } = await getInvitationWithValidity(hashToken(token));

  if (!invite || !valid) {
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

  const org = await getOrgById(invite.organizationId);
  const orgName = org?.name ?? "an organization";
  const session = await getServerSession();
  const returnTo = `/invitations/${token}`;

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Join {orgName}</h1>
      <p className="text-muted-foreground text-sm">
        You&apos;ve been invited to join{" "}
        <span className="text-foreground font-medium">{orgName}</span> as {invite.role}.
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
