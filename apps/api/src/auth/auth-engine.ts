import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";

import { schema, type Db } from "@repo/db";

/**
 * Better Auth engine for the API — session READS only (spec 2.5).
 *
 * Same secret, same database, same user table + `additionalFields`
 * (`deletedAt`, `locale`) as the web app's engine
 * (`apps/web/src/lib/adapters/auth/better-auth.ts`), so a session cookie
 * minted by the web sign-in is readable here with identical semantics:
 * soft-deleted accounts resolve to no session, `role`/`banned` ride along
 * for the mapping below.
 *
 * Deliberately WITHOUT the sign-up/sign-in/email plugins: Nest mints no
 * sessions in this phase (sign-in still lives in web until the auth module
 * moves in full). The `admin` plugin IS registered — not for its HTTP
 * surface (never mounted), but because it types `user.role`/`user.banned`,
 * which the session mapping below reads. `adminUserIds` stays UNSET, same
 * reason as in web (it would silently grant `user:impersonate-admins`).
 */
const SUPER_ADMIN_ROLE = "superadmin";
const DEFAULT_ROLE = "user";

function isSuperAdminRole(role: string | null | undefined): boolean {
  return (role ?? DEFAULT_ROLE).split(",").includes(SUPER_ADMIN_ROLE);
}

export function createAuthEngine(db: Db, secret: string) {
  return betterAuth({
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    user: {
      additionalFields: {
        deletedAt: { type: "date", required: false, input: false },
        locale: { type: "string", required: false, input: false },
      },
    },
    plugins: [
      admin({
        roles: { [DEFAULT_ROLE]: userAc, [SUPER_ADMIN_ROLE]: adminAc },
        adminRoles: [SUPER_ADMIN_ROLE],
        defaultRole: DEFAULT_ROLE,
      }),
    ],
  });
}

export type AuthEngine = ReturnType<typeof createAuthEngine>;

/** Injection token for the engine — feature code injects this, never the SDK. */
export const AUTH_ENGINE = Symbol("AUTH_ENGINE");

/** The session as API guards see it — the fields the slice needs, nothing more. */
export interface RequestSession {
  user: {
    id: string;
    email: string;
    isSuperAdmin: boolean;
    suspended: boolean;
    locale: string | null;
  };
  expiresAt: Date;
  impersonatedBy: string | null;
}

/**
 * Resolve the session for incoming headers (the Nest twin of the web
 * adapter's `getSession`). A soft-deleted account resolves to null (spec
 * 11.3) — live sessions die on their next request, structurally.
 */
export async function getSessionFromHeaders(
  engine: AuthEngine,
  headers: Headers,
): Promise<RequestSession | null> {
  const result = await engine.api.getSession({ headers });
  if (!result) return null;
  if (result.user.deletedAt) return null;
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      isSuperAdmin: isSuperAdminRole(result.user.role),
      suspended: result.user.banned ?? false,
      locale: result.user.locale ?? null,
    },
    expiresAt: new Date(result.session.expiresAt),
    impersonatedBy: result.session.impersonatedBy ?? null,
  };
}
