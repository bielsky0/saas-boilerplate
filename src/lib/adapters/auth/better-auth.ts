import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";

import { enqueueEmail } from "@/features/emails/send";
import { enqueueNotification } from "@/features/notifications/send";
import { ensurePersonalAccount, getPersonalAccountByUserId } from "@/features/organizations/data";
import { startOnboardingSequence } from "@/features/onboarding/sequence";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env/server";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { requestLocale } from "@/lib/i18n/request-locale";
import { storedLocaleForUser } from "@/lib/i18n/user-locale";
import type {
  AdminAuthAdapter,
  AuthAdapter,
  AuthResult,
  RequestPasswordResetInput,
  ResetPasswordInput,
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

/**
 * What language to write to this user in (spec 16.1), best evidence first.
 *
 * 1. What they CHOSE (`user.locale`).
 * 2. Failing that, the language of the request in flight. Someone clicking "reset
 *    password" on `/pl/forgot-password` is reading Polish right now, and that is
 *    real evidence even though they never set a preference.
 * 3. Failing that, the default. An email has to be in some language.
 *
 * TAKES AN ID AND QUERIES, rather than reading `user.locale` off the argument:
 * `sendVerificationEmail`/`sendResetPassword` receive the engine's BASE user
 * shape, which does not include `additionalFields` — so the column rides on the
 * SESSION user (see getSession) but not on these hook params. One extra SELECT on
 * a path that is already sending an email is a fair price for not guessing.
 *
 * Note this reads but never WRITES: recording a preference from a guess is what
 * `signInAction` deliberately refuses to do, and the same reasoning applies here.
 */
async function recipientLocale(userId: string): Promise<Locale> {
  return (await storedLocaleForUser(userId)) ?? (await requestLocale()) ?? DEFAULT_LOCALE;
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
      /**
       * The user's language (spec 16.1). Also ours, same reasoning: declared so it
       * rides on the session user, which is what lets sign-in seed the locale
       * cookie without a second query.
       *
       * `required: false` because NULL is meaningful — "never chose" is not "chose
       * English" (see the column's header in db/schema/auth.ts).
       *
       * `input: false` is the security-relevant half: without it the engine would
       * accept `locale` on its own update-user endpoint, giving the browser a
       * second, UNVALIDATED door to a value the proxy trusts on every request.
       * `setLocaleAction` is the one door, and it validates against LOCALES.
       */
      locale: { type: "string", required: false, input: false },
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
    // Spec 2.1 "token wygasający, np. 1h". Seconds.
    resetPasswordTokenExpiresIn: 3600,
    // Spec 2.1 "invalidacja wszystkich aktywnych sesji użytkownika po zmianie
    // hasła". The engine deletes every session on reset — do NOT hand-roll this
    // alongside it, or the two mechanisms will disagree.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueEmail(
        db,
        "password-reset",
        { url, name: user.name },
        { to: user.email, locale: await recipientLocale(user.id) },
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueEmail(
        db,
        "verify-email",
        { url, name: user.name },
        { to: user.email, locale: await recipientLocale(user.id) },
      );
      // Second channel (spec 23): a bell item after the auto-sign-in lands the new
      // user on the dashboard, independent of the email. `db`, not a tx — the auth
      // engine owns this connection (same reason the email enqueue above does).
      // Scoped to the personal account, ensured here in case this fires before the
      // user.create `after` hook. Deduped on the token so a resend/retry is safe.
      await ensurePersonalAccount(user.id);
      const account = await getPersonalAccountByUserId(user.id);
      if (account) {
        await enqueueNotification(
          db,
          {
            userId: user.id,
            organizationId: null,
            accountId: account.id,
            type: "verify-email",
            params: { name: user.name ?? "" },
            link: url,
          },
          { dedupeKey: `notif:verify-email:${url}` },
        );
      }
    },
    /**
     * Start the onboarding sequence (spec 10.3). Day 0 IS the welcome, so this one
     * trigger does both things the spec asks for.
     *
     * `db`, not a transaction: the engine owns the connection this hook runs on and
     * offers no way to hand it ours — features/admin/audit.ts Rule B, for the same
     * underlying reason.
     *
     * This can fire TWICE. The engine returns early when `emailVerified` is already
     * true, but that check is not atomic with the UPDATE that sets it, so a mail
     * scanner prefetching the link while the human clicks can pass both. The dedupe
     * keys inside `startOnboardingSequence` are what actually close that — not the
     * engine's guard.
     */
    afterEmailVerification: async (verified) => {
      await startOnboardingSequence(db, verified.id);
    },
  },
  databaseHooks: {
    user: {
      create: {
        /**
         * Stamp the registration-time language onto the new row (spec 16.1).
         *
         * WHY HERE AND NOT IN `signUpAction`: that action returns `ok: true` for a
         * fresh email AND for one that is already registered — deliberately, so it
         * reveals nothing (§2.1, asserted by e2e/login-enumeration.spec.ts). A
         * write there could not tell the two apart, so signing up with someone
         * else's address would silently overwrite THEIR language. This hook fires
         * only on a genuine creation, which is exactly the distinction needed.
         *
         * A DELIBERATE ASYMMETRY WITH SIGN-IN, which does not backfill. Sign-in has
         * an alternative — keep negotiating from the browser, every request, for
         * free. Email has none: a §10.3 message going out on day 7 has no browser
         * to ask, and "the language they registered in" is the best evidence that
         * will ever exist. An explicit switch overwrites it immediately.
         *
         * Users created outside a request (the engine's own endpoints,
         * /api/dev/seed-user) get NULL and fall back to the default. Correct and
         * honest: nobody told us anything.
         */
        before: async (userData) => {
          const locale = await requestLocale();
          return locale ? { data: { ...userData, locale } } : undefined;
        },
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

  async requestPasswordReset(
    input: RequestPasswordResetInput,
    headers: Headers,
  ): Promise<AuthResult> {
    try {
      await auth.api.requestPasswordReset({
        headers,
        body: { email: input.email, redirectTo: input.redirectTo },
      });
      return { ok: true };
    } catch {
      // Anti-enumeration: resolve as success WHATEVER went wrong. The engine
      // already returns a neutral body and performs a dummy lookup to flatten the
      // timing for an unknown address; surfacing any error here — including a
      // configuration one like RESET_PASSWORD_DISABLED — would hand back exactly
      // the signal that work exists to hide. A genuine outage shows up in the
      // queue's dead letters, which is where it belongs.
      return { ok: true };
    }
  },

  async resetPassword(input: ResetPasswordInput, headers: Headers): Promise<AuthResult> {
    try {
      await auth.api.resetPassword({
        headers,
        body: { token: input.token, newPassword: input.newPassword },
      });
      return { ok: true };
    } catch (error) {
      const code = errorCode(error);
      // The engine has no separate "expired" code: an expired token simply fails
      // to be consumed and surfaces as INVALID_TOKEN, which is also the right thing
      // to tell the user — either way the link is dead and they need a new one.
      if (code === "INVALID_TOKEN") {
        return { ok: false, code: "INVALID_TOKEN" };
      }
      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
        return { ok: false, code: "WEAK_PASSWORD" };
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
        // Free — rides along via `user.additionalFields`, same as `deletedAt`.
        // Left as the raw column value: `null` means "never chose", and narrowing
        // to a valid locale is the caller's job (`isLocale`), not a decision to
        // launder into a default here.
        locale: result.user.locale ?? null,
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
