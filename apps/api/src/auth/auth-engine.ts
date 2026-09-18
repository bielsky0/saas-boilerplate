import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { mcp } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";

import type { Session } from "@repo/contracts";
import { schema, type Db } from "@repo/db";
import {
  enqueueEmailJob,
  enqueueNotificationJob,
  ensurePersonalAccount,
  getPersonalAccountByUserId,
  recipientLocale,
  repairEngineUrl,
  startOnboardingJobs,
} from "./auth-enqueue";
import { kickDrain } from "../jobs/runner";

/**
 * Better Auth engine for the API — full port of the web app's engine
 * (`apps/web/src/lib/adapters/auth/better-auth.ts`), minus `nextCookies` (a
 * Nest controller relays `Set-Cookie` instead).
 *
 * Same secret, same database, same user table + `additionalFields`
 * (`deletedAt`, `locale`), same hooks — so a session minted here reads
 * identically in web and vice versa. The emailed links are built from this
 * engine's `baseURL` (the API origin), which is what makes them hit Nest
 * directly ("wprost w Nest"): the engine validates the token and redirects to
 * the absolute web `callbackURL` the caller passed in.
 *
 * `trustedOrigins` MUST contain the web origin: the engine validates absolute
 * callback URLs against it, and the emailed links carry absolute web URLs.
 *
 * `adminUserIds` stays UNSET, same reason as in web (it would silently grant
 * `user:impersonate-admins`). The plugin is registered for its ban/role
 * checks, not its HTTP surface — `/api/auth/admin/*` never reaches the engine
 * (see main.ts).
 */
const SUPER_ADMIN_ROLE = "superadmin";
const DEFAULT_ROLE = "user";

function isSuperAdminRole(role: string | null | undefined): boolean {
  return (role ?? DEFAULT_ROLE).split(",").includes(SUPER_ADMIN_ROLE);
}

export interface AuthEngineConfig {
  secret: string;
  /** API origin — emailed links are built from it. */
  baseURL: string;
  /** Web origin — CORS, redirects, trusted callback URLs. */
  webURL: string;
  trustedOrigins: string[];
  /**
   * Cross-subdomain session cookies (faza 2.9, wariant 1). `SameSite=Lax`
   * stays — to współdzielona domena-nadrzędna sprawia, że cookie Lax jedzie
   * w cross-subdomenowym fetchu. `{ enabled: false }` = defaulty Better Auth
   * (host-only cookies), czyli zachowanie sprzed fazy 2.9 bit w bit.
   */
  crossSubDomainCookies: { enabled: boolean; domain?: string };
}

function headersOf(request: unknown): Headers | null {
  if (request instanceof Request) return request.headers;
  if (request instanceof Headers) return request;
  return null;
}

export function createAuthEngine(db: Db, config: AuthEngineConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    advanced: {
      crossSubDomainCookies: {
        enabled: config.crossSubDomainCookies.enabled,
        // Omitted when unset — the engine derives the root domain from
        // `baseURL` (which is the public API origin in production).
        ...(config.crossSubDomainCookies.domain
          ? { domain: config.crossSubDomainCookies.domain }
          : {}),
      },
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        // OAuth 2.0 authorization-server tables for the MCP plugin (spec 26,
        // faza 2.7) — same mapping the web engine had, so tokens minted
        // before/after the port read identically.
        oauthApplication: schema.oauthApplication,
        oauthAccessToken: schema.oauthAccessToken,
        oauthConsent: schema.oauthConsent,
      },
    }),
    user: {
      additionalFields: {
        // OUR column (spec 11.3), not the engine's — lets `getSession` reject
        // a soft-deleted account with no extra query. `input: false` closes
        // the engine's own update-user door to it.
        deletedAt: { type: "date", required: false, input: false },
        // The user's language (spec 16.1). `required: false` because NULL is
        // meaningful ("never chose" is not "chose English"); `input: false`
        // so the browser gets no second, unvalidated door to a value the
        // proxy trusts. Written only by the sign-up controller, after a
        // genuine creation (never on the duplicate-email path).
        locale: { type: "string", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Length backstop only; the letter+digit rule is enforced by the
      // controller's zod schema before the engine is ever called.
      minPasswordLength: 8,
      // Unverified users CAN sign in — the dashboard shows a banner instead.
      requireEmailVerification: false,
      autoSignIn: true,
      // Spec 2.1 "token wygasający, np. 1h". Seconds.
      resetPasswordTokenExpiresIn: 3600,
      // Invalidates every live session on reset — do NOT hand-roll this
      // alongside it, or the two mechanisms will disagree.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        await enqueueEmailJob(
          db,
          "password-reset",
          { url: repairEngineUrl(url, config.webURL, "/reset-password"), name: user.name },
          {
            to: user.email,
            locale: await recipientLocale(db, user.id, headersOf(request)),
          },
        );
        kickDrain();
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        const headers = headersOf(request);
        // Repaired once, used for both channels: the email link AND the bell
        // item must land on the web page, never on the API origin.
        const repairedUrl = repairEngineUrl(url, config.webURL, "/dashboard");
        await enqueueEmailJob(
          db,
          "verify-email",
          { url: repairedUrl, name: user.name },
          { to: user.email, locale: await recipientLocale(db, user.id, headers) },
        );
        kickDrain();
        // Second channel (spec 23): a bell item after the auto-sign-in lands
        // the new user on the dashboard. `db`, not a tx — the engine owns this
        // connection. Scoped to the personal account, ensured here in case
        // this fires before the user.create `after` hook. Deduped on the
        // token so a resend/retry is safe.
        await ensurePersonalAccount(db, user.id);
        const account = await getPersonalAccountByUserId(db, user.id);
        if (account) {
          await enqueueNotificationJob(
            db,
            {
              userId: user.id,
              organizationId: null,
              accountId: account.id,
              type: "verify-email",
              params: { name: user.name ?? "" },
              link: repairedUrl,
            },
            { dedupeKey: `notif:verify-email:${repairedUrl}` },
          );
        }
      },
      /**
       * Start the onboarding sequence (spec 10.3). Day 0 IS the welcome.
       *
       * `db`, not a transaction: the engine owns the connection. Can fire
       * TWICE (the engine's verified-guard is not atomic with its UPDATE), so
       * the dedupe keys inside carry the actual guarantee, not this call.
       */
      afterEmailVerification: async (verified) => {
        await startOnboardingJobs(db, verified.id);
        kickDrain();
      },
    },
    databaseHooks: {
      user: {
        create: {
          // No `before` locale stamp here: there is no request scope to read,
          // and stamping anywhere reachable on the duplicate-email path would
          // overwrite the victim's language. The sign-up controller stamps
          // AFTER a genuine creation instead (conditional update, NULL-only).
          //
          // Every user owns exactly one personal account (spec 3.1), created
          // here at registration. Idempotent, so retries never duplicate.
          after: async (createdUser) => {
            await ensurePersonalAccount(db, createdUser.id);
          },
        },
      },
      session: {
        create: {
          /**
           * Block sign-in for a soft-deleted account (spec 11.3). Without a
           * block at CREATION the sign-in would "succeed", set a cookie, and
           * every later request would resolve to no session — an infinite
           * login loop with no error to show. Runs after password
           * verification, so a distinct reason leaks nothing.
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
      admin({
        roles: { [DEFAULT_ROLE]: userAc, [SUPER_ADMIN_ROLE]: adminAc },
        adminRoles: [SUPER_ADMIN_ROLE],
        defaultRole: DEFAULT_ROLE,
        impersonationSessionDuration: 30 * 60,
        // adminUserIds: DELIBERATELY UNSET — see the file header.
      }),
      /**
       * MCP / OAuth 2.0 authorization server (spec 26 — AI Agent, faza 2.7).
       *
       * Port 1:1 of the web engine's `mcp()` block: the app is an OAuth
       * provider so an MCP client obtains a per-USER access token and acts on
       * that user's behalf. `withMcpAuth` (in `mcp/`) resolves that token to a
       * `userId` on every `/api/mcp` call, which the MCP tools funnel through
       * the SAME RBAC/tenant primitives the UI uses — the agent never has
       * authority beyond the user it acts for.
       *
       * `loginPage` is the web's bridge (`/oauth/login`, stays in web): the
       * engine redirects an unauthenticated authorize request there with the
       * OAuth query, and the bridge resumes via `/api/auth/mcp/authorize`
       * (proxied by web, allowlisted in `main.ts`).
       */
      mcp({
        loginPage: "/oauth/login",
        oidcConfig: {
          // `loginPage` is required by the OIDCOptions type; the mcp plugin
          // overrides it with the value above, so keep the two identical.
          loginPage: "/oauth/login",
          allowDynamicClientRegistration: true,
          requirePKCE: true,
          consentPage: "/oauth/consent",
        },
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

/** The full contract session for `GET /v1/session` (spec 4.2 reference read). */
export async function getFullSessionFromHeaders(
  engine: AuthEngine,
  headers: Headers,
): Promise<Session | null> {
  const result = await engine.api.getSession({ headers });
  if (!result) return null;
  if (result.user.deletedAt) return null;
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      emailVerified: result.user.emailVerified,
      name: result.user.name ?? null,
      isSuperAdmin: isSuperAdminRole(result.user.role),
      suspended: result.user.banned ?? false,
      // Left as the raw column value: `null` means "never chose".
      locale: result.user.locale ?? null,
    },
    expiresAt: new Date(result.session.expiresAt),
    impersonatedBy: result.session.impersonatedBy ?? null,
  };
}

/** Neutral engine error code (the `body.code` the SDK throws with). */
export function engineErrorCode(error: unknown): string | undefined {
  if (error instanceof APIError) {
    const body = error.body as { code?: string } | undefined;
    return body?.code;
  }
  return undefined;
}
