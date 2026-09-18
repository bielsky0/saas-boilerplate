import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { forbidden } from "../common/http";
import type { AuthenticatedRequest } from "../auth/session.guard";

/**
 * Super-admin guard (spec 6.1) — the Nest twin of the web app's
 * `requireSuperAdmin()` (`features/admin/context.ts`), minus the redirect:
 * an API answers 403 JSON, it never renders a `forbidden.tsx`.
 *
 * Runs AFTER `SessionGuard` (which resolves the session): checks the live
 * `isSuperAdmin` flag. Liveness comes from the engine itself — it reads the
 * role from the database on every `getSession`, never from the cookie — which
 * is why a revoked flag takes effect immediately.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = req.session;
    if (!session) forbidden();
    if (!session.user.isSuperAdmin) forbidden();
    return true;
  }
}
