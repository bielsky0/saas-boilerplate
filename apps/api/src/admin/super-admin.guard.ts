import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { forbidden } from "../common/http";
import type { AuthenticatedRequest } from "../auth/session.guard";

/**
 * Super-admin guard (spec 6.1) — the Nest twin of the web app's
 * `requireSuperAdmin()` (`features/admin/context.ts`), minus the redirect:
 * an API answers 403 JSON, it never renders a `forbidden.tsx`.
 *
 * Runs AFTER `SessionGuard` (which resolves the session): an impersonated
 * session NEVER carries admin authority (checked first, so this fails closed
 * even if the engine's role gate is misconfigured), then the live
 * `isSuperAdmin` flag. Liveness comes from the engine itself — it reads the
 * role from the database on every `getSession`, never from the cookie — which
 * is why a revoked flag or a swapped session takes effect immediately.
 *
 * Does NOT guard `POST /v1/admin/impersonate/stop`: the caller is by
 * definition the impersonated (non-admin) user, so this guard would 403
 * exactly the person who needs to get out. That route uses `SessionGuard`
 * alone; the session's own `impersonatedBy` is the authorization.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = req.session;
    if (!session || session.impersonatedBy !== null) forbidden();
    if (!session.user.isSuperAdmin) forbidden();
    return true;
  }
}
