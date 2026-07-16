import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";

import { email } from "@/lib/adapters/email";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env/server";
import type {
  AdminAuthAdapter,
  AuthAdapter,
  AuthResult,
  Session,
  SignInInput,
  SignUpInput,
} from "./contract";

/**
 * Better Auth implementation of the auth contract — the ONLY file that imports
 * the `better-auth` SDK (spec 1.2). It configures the engine and adapts its API
 * to the vendor-neutral `AuthAdapter`/`AdminAuthAdapter`, mapping every SDK
 * error onto a neutral code so callers never see provider strings (spec 2.1
 * anti-enumeration).
 *
 * §6 note: this file is also the only place that knows the engine's super-admin
 * VOCABULARY. The `admin` plugin represents the flag as a role string; the
 * contract exposes a plain `isSuperAdmin: boolean`, derived below. Nothing
 * outside this file may reference the string.
 */

/** Post-verification landing (also where auto-sign-in after verification lands). */
const VERIFY_CALLBACK_URL = "/dashboard";

/**
 * The engine's role value for a super admin (spec 6.1).
 *
 * Deliberately NOT "admin": that would collide with `membership.role`'s own
 * "admin" (§4) in the schema and in every reader's head, and the two are
 * unrelated — this one is a SYSTEM role, org roles are per-tenant.
 *
 * Must match `adminRoles` below byte for byte: the plugin's target-is-admin
 * check in `impersonateUser` does a case-sensitive `includes`, unlike its
 * constructor validation which lowercases. A casing slip here fails open.
 */
const SUPER_ADMIN_ROLE = "superadmin";
const DEFAULT_ROLE = "user";

/** Impersonation sessions are short-lived: a support tool, not a way to live. */
const IMPERSONATION_SESSION_SECONDS = 30 * 60;

function isSuperAdminRole(role: string | null | undefined): boolean {
  // The engine stores multi-role values comma-separated.
  return (role ?? DEFAULT_ROLE).split(",").includes(SUPER_ADMIN_ROLE);
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
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
      // OUR column (spec 11.3), not the engine's — declared here so the engine
      // selects it and it rides along on the session user for free. That is what
      // lets `getSession` reject a soft-deleted account with no extra query.
      // `input: false` keeps it out of every user-facing update endpoint.
      deletedAt: { type: "date", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Length backstop only; the letter+digit rule (spec 2.1) is enforced by the
    // shared zod schema in features/auth before we ever call the engine.
    minPasswordLength: 8,
    // Policy (spec 2.1): unverified users CAN sign in — no paid features exist
    // yet to gate, and blocking sign-in worsens onboarding. The dashboard shows
    // a "verify your email" banner instead.
    requireEmailVerification: false,
    autoSignIn: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await email.send("verify-email", { url, name: user.name }, { to: user.email });
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Every user owns exactly one personal account (spec 3.1), created here at
        // registration. Idempotent (unique userId + onConflictDoNothing) so seed
        // paths and retries never duplicate; a read-side `ensurePersonalAccount`
        // backfills any pre-existing user.
        after: async (createdUser) => {
          await db
            .insert(schema.personalAccount)
            .values({ userId: createdUser.id })
            .onConflictDoNothing();
        },
      },
    },
    session: {
      create: {
        /**
         * Block sign-in for a soft-deleted account (spec 11.3).
         *
         * This hook is NOT optional garnish. `getSession` returns null for a
         * deleted user, so without a block at session CREATION the sign-in would
         * "succeed", set a cookie, and then every subsequent request would resolve
         * to no session — an infinite login loop with no error to show.
         *
         * It runs after password verification, so surfacing a distinct reason
         * leaks nothing (see AuthErrorCode's header). The engine's own ban check
         * lives in this same hook slot; both run — `runPluginInit` merges plugin
         * and user hooks into one list rather than letting either win.
         */
        before: async (createdSession) => {
          const [target] = await db
            .select({ deletedAt: schema.user.deletedAt })
            .from(schema.user)
            .where(eq(schema.user.id, createdSession.userId))
            .limit(1);
          if (target?.deletedAt) {
            throw new APIError("FORBIDDEN", {
              code: "ACCOUNT_DELETED",
              message: "This account has been deleted.",
            });
          }
        },
      },
    },
  },
  plugins: [
    /**
     * Super-admin engine (spec 6): impersonation, suspension, session revocation.
     * Used ONLY through `betterAuthAdminAdapter` below — its HTTP surface
     * (/api/auth/admin/*) is closed in the catch-all route so that our audited
     * server actions stay the only way in (spec 6.3).
     */
    admin({
      // Own role vocabulary, so `user.role` never collides with `membership.role`.
      // `adminAc`/`userAc` are the engine's stock permission sets; only the names
      // change. `adminAc` deliberately lacks `user:impersonate-admins`, which is
      // what makes admin-impersonates-admin fail at the engine.
      roles: { [DEFAULT_ROLE]: userAc, [SUPER_ADMIN_ROLE]: adminAc },
      adminRoles: [SUPER_ADMIN_ROLE],
      defaultRole: DEFAULT_ROLE,
      impersonationSessionDuration: IMPERSONATION_SESSION_SECONDS,
      // adminUserIds: DELIBERATELY UNSET, AND MUST STAY THAT WAY.
      // `hasPermission` short-circuits `if (adminUserIds.includes(userId)) return true`
      // BEFORE any permission check, silently granting `user:impersonate-admins`.
      // A super admin could then impersonate another super admin, and that
      // impersonated session would carry real admin authority. Bootstrap the first
      // super admin with SQL (see docs/ARCHITECTURE.md) instead.
    }),
    // nextCookies MUST be last: it applies Set-Cookie from server-action calls
    // (signUpEmail/signInEmail/signOut/impersonateUser) to the Next.js response.
    nextCookies(),
  ],
});

function errorCode(error: unknown): string | undefined {
  if (error instanceof APIError) {
    const body = error.body as { code?: string } | undefined;
    return body?.code;
  }
  return undefined;
}

export const betterAuthAdapter: AuthAdapter = {
  async signUpEmailPassword(input: SignUpInput, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.signUpEmail({
        headers,
        body: {
          email: input.email,
          password: input.password,
          name: input.name ?? "",
          callbackURL: VERIFY_CALLBACK_URL,
        },
      });
      return { ok: true };
    } catch (error) {
      const code = errorCode(error);
      // Anti-enumeration: an already-registered email must be indistinguishable
      // from a fresh sign-up, so resolve as success (no session is created for
      // the existing user; the "check your inbox" screen is shown either way).
      if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        return { ok: true };
      }
      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
        return { ok: false, code: "WEAK_PASSWORD" };
      }
      return { ok: false, code: "UNKNOWN" };
    }
  },

  async signInEmailPassword(input: SignInInput, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.signInEmail({
        headers,
        body: { email: input.email, password: input.password },
      });
      return { ok: true };
    } catch (error) {
      const code = errorCode(error);
      // A suspended/deleted account is only reachable with CORRECT credentials
      // (both checks run at session creation, after password verification), so
      // telling the user why they are locked out enumerates nothing. See the
      // AuthErrorCode header before collapsing this into INVALID_CREDENTIALS.
      if (code === "BANNED_USER" || code === "ACCOUNT_DELETED") {
        return { ok: false, code: "ACCOUNT_SUSPENDED" };
      }
      // Unknown email and wrong password both collapse to one neutral code.
      if (
        code === "INVALID_EMAIL_OR_PASSWORD" ||
        code === "INVALID_PASSWORD" ||
        code === "INVALID_EMAIL" ||
        code === "USER_NOT_FOUND" ||
        code === "EMAIL_NOT_VERIFIED"
      ) {
        return { ok: false, code: "INVALID_CREDENTIALS" };
      }
      return { ok: false, code: "UNKNOWN" };
    }
  },

  async getSession(headers: Headers): Promise<Session | null> {
    const result = await auth.api.getSession({ headers });
    if (!result) return null;
    // A soft-deleted account has no valid session (spec 11.3). This is the
    // structural guard: any live session of a deleted user dies on its very next
    // request, so correctness never depends on a revoke call having succeeded.
    // Free — `deletedAt` rides along via `user.additionalFields`.
    if (result.user.deletedAt) return null;
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        name: result.user.name ?? null,
        isSuperAdmin: isSuperAdminRole(result.user.role),
        suspended: result.user.banned ?? false,
      },
      expiresAt: new Date(result.session.expiresAt),
      impersonatedBy: result.session.impersonatedBy ?? null,
    };
  },

  async signOut(headers: Headers): Promise<void> {
    await auth.api.signOut({ headers });
  },
};

/**
 * Maps the engine's admin errors onto neutral codes. Kept separate from
 * `errorCode` above because the admin plugin reports some failures by message
 * rather than by code.
 */
function adminErrorResult(error: unknown): AuthResult {
  const code = errorCode(error);
  const message = error instanceof APIError ? String(error.body?.message ?? "") : "";

  if (
    code === "YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS" ||
    code === "YOU_CANNOT_IMPERSONATE_ADMINS" ||
    code === "YOU_ARE_NOT_ALLOWED_TO_BAN_USERS" ||
    code === "YOU_ARE_NOT_ALLOWED_TO_SET_USERS_ROLE" ||
    code === "YOU_CANNOT_BAN_YOURSELF"
  ) {
    return { ok: false, code: "IMPERSONATION_FORBIDDEN" };
  }
  if (code === "USER_NOT_FOUND") {
    return { ok: false, code: "USER_NOT_FOUND" };
  }
  // The engine reports "not impersonating" as a bare BAD_REQUEST message.
  if (/not impersonating/i.test(message)) {
    return { ok: false, code: "NOT_IMPERSONATING" };
  }
  return { ok: false, code: "UNKNOWN" };
}

/**
 * Better Auth implementation of the super-admin contract (spec 6.1–6.2).
 *
 * Every method re-authenticates the caller through the engine via `headers`, on
 * top of the `requireSuperAdmin()` check the calling action already performed —
 * defence in depth, and it is what makes the engine's own guards (cannot
 * impersonate an admin, cannot ban yourself) actually run.
 */
export const betterAuthAdminAdapter: AdminAuthAdapter = {
  async impersonate(userId: string, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.impersonateUser({ headers, body: { userId } });
      return { ok: true };
    } catch (error) {
      return adminErrorResult(error);
    }
  },

  async stopImpersonating(headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.stopImpersonating({ headers });
      return { ok: true };
    } catch (error) {
      // NOTE: the engine throws a 500 here when the admin's ORIGINAL session has
      // expired while they were impersonating — it cannot find the session to
      // restore. That surfaces as UNKNOWN, and the caller
      // (`stopImpersonatingAction`) must fall back to a plain sign-out rather
      // than stranding the admin inside someone else's account.
      return adminErrorResult(error);
    }
  },

  async suspendUser(userId: string, reason: string | null, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.banUser({
        headers,
        // No banExpires: suspensions are indefinite until an admin lifts them.
        body: { userId, ...(reason ? { banReason: reason } : {}) },
      });
      return { ok: true };
    } catch (error) {
      return adminErrorResult(error);
    }
  },

  async unsuspendUser(userId: string, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.unbanUser({ headers, body: { userId } });
      return { ok: true };
    } catch (error) {
      return adminErrorResult(error);
    }
  },

  async setSuperAdmin(userId: string, value: boolean, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.setRole({
        headers,
        body: { userId, role: value ? SUPER_ADMIN_ROLE : DEFAULT_ROLE },
      });
      return { ok: true };
    } catch (error) {
      return adminErrorResult(error);
    }
  },

  async revokeUserSessions(userId: string, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.revokeUserSessions({ headers, body: { userId } });
      return { ok: true };
    } catch (error) {
      return adminErrorResult(error);
    }
  },
};
