import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

import { unauthorized } from "../common/http";
import {
  AUTH_ENGINE,
  getSessionFromHeaders,
  type AuthEngine,
  type RequestSession,
} from "./auth-engine";

/** An Express request carrying a resolved session (set by `SessionGuard`). */
export interface AuthenticatedRequest extends Request {
  session: RequestSession;
}

/**
 * Session guard — the Nest twin of the web app's `requireSession` (spec 4.2),
 * minus the redirect: an API answers 401 JSON, it never sends a browser to
 * `/login` (a mobile client or `curl` cannot follow that meaningfully).
 *
 * The incoming `Cookie` header is copied into Fetch `Headers` because the
 * Better Auth engine reads the session token from there. Server-to-server
 * callers (Next.js route handlers) MUST forward the browser's cookie —
 * without it every call resolves to anonymous. See `@repo/api-client`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH_ENGINE) private readonly engine: AuthEngine) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else {
        headers.set(key, value);
      }
    }
    const session = await getSessionFromHeaders(this.engine, headers);
    if (!session) unauthorized();
    (req as unknown as AuthenticatedRequest).session = session;
    return true;
  }
}

/** Extract the resolved session inside a guarded handler. */
export const Session = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return req.session;
});
