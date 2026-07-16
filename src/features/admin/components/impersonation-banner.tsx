import { Alert } from "@/components/ui";
import { getServerSession } from "@/lib/auth";
import { StopImpersonatingButton } from "./stop-impersonating-button";

/**
 * Impersonation disclosure banner (spec 6.2 — "banner: you are logged in as X in
 * admin mode").
 *
 * Rendered from the ROOT layout, not the app shell. The banner is a disclosure
 * control, and the failure that matters is under-marking: an admin acting as
 * someone else without the screen saying so. Root is the only layout that also
 * covers `forbidden.tsx` (where an impersonated session lands if it tries to
 * re-enter /admin), `/invitations/[token]`, `/login`, and the (admin) group — so
 * there is nowhere to end up in admin mode with no banner and no way out.
 *
 * Renders nothing (and costs nothing beyond the session lookup) for an ordinary
 * session; for an anonymous one there is no cookie, so no DB query happens at all.
 */
export async function ImpersonationBanner() {
  const session = await getServerSession();
  if (!session?.impersonatedBy) return null;

  return (
    <Alert
      role="status"
      variant="warning"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-none border-x-0 border-t-0"
    >
      <span>
        Admin mode — you are logged in as <strong>{session.user.email}</strong>.
      </span>
      <StopImpersonatingButton />
    </Alert>
  );
}
