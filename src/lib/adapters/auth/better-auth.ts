import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { email } from "@/lib/adapters/email";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env/server";
import type { AuthAdapter, AuthResult, Session, SignInInput, SignUpInput } from "./contract";

/**
 * Better Auth implementation of the auth contract — the ONLY file that imports
 * the `better-auth` SDK (spec 1.2). It configures the engine and adapts its API
 * to the vendor-neutral `AuthAdapter`, mapping every SDK error onto a neutral
 * code so callers never see provider strings (spec 2.1 anti-enumeration).
 */

/** Post-verification landing (also where auto-sign-in after verification lands). */
const VERIFY_CALLBACK_URL = "/dashboard";

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
  },
  // nextCookies MUST be last: it applies Set-Cookie from server-action calls
  // (signUpEmail/signInEmail/signOut) to the Next.js response.
  plugins: [nextCookies()],
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
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        name: result.user.name ?? null,
      },
      expiresAt: new Date(result.session.expiresAt),
    };
  },

  async signOut(headers: Headers): Promise<void> {
    await auth.api.signOut({ headers });
  },
};
