import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import type { RateLimitAdapter, RateLimitRule } from "@repo/contracts";
import type { Db } from "@repo/db";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { validationFailed } from "../common/http";
import { AUTH_ENGINE, engineErrorCode, type AuthEngine } from "./auth-engine";
import { LOGIN_RULE, RATE_LIMIT } from "../rate-limit/rate-limit.module";
import { loginRateLimitKey } from "../rate-limit/keys";
import {
  absoluteWebCallback,
  requestLocaleFromHeaders,
  runWithRequestLocale,
  stampLocaleIfUnset,
  storedLocaleForEmail,
} from "./auth-enqueue";

/**
 * Auth flows (spec 2.1) — the Nest twin of the web app's
 * `features/auth/actions.ts` + the code-mapping half of its auth adapter.
 *
 * Same rules, in the same order:
 * - validation first (spec 22.2), authorization/rate-limit second;
 * - login bucket is IP-only, peek-before-hash, consume-on-INVALID_CREDENTIALS
 *   only, reset-on-success, silent-consume on password-reset request;
 * - one neutral code for unknown-email and wrong-password (the client renders
 *   the single `auth.errors.invalidCredentials` key for both);
 * - sign-up resolves `ok` for an already-registered email (no session for the
 *   existing user); password-reset resolves `ok` whatever went wrong.
 *
 * Throws `HttpException`s (the controller relays cookies only on success —
 * the engine sets none on failure paths).
 */

export type AuthCode =
  | "INVALID_CREDENTIALS"
  | "WEAK_PASSWORD"
  | "INVALID_TOKEN"
  | "ACCOUNT_SUSPENDED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export interface AuthSuccess {
  ok: true;
}

/**
 * Sign-in success — carries the stored language choice so the CLIENT can seed
 * its own locale cookie and land on the prefixed URL. No `after-sign-in`
 * server hop: the API is framework-independent, and a Vue SPA has no web
 * route to bounce through. `null` means "never chose" — the client sets no
 * cookie and the browser keeps negotiating (no backfill, spec 16.1).
 */
export interface SignInSuccess {
  ok: true;
  locale: string | null;
}

/** Server-side English backstops (spec 22.2): the client pre-validates with
 * translated factories, so these messages only surface on a hand-built
 * request. Rules mirror the web schemas exactly (min 8, letter, digit). */
const passwordRule = z
  .string()
  .min(8)
  .regex(/[A-Za-z]/)
  .regex(/\d/);

const signUpSchema = z.object({
  email: z.email(),
  password: passwordRule,
  name: z.string().trim().max(120).optional(),
});

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const resetRequestSchema = z.object({
  email: z.email(),
});

const resetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordRule,
});

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_ENGINE) private readonly engine: AuthEngine,
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(RATE_LIMIT) private readonly rateLimit: RateLimitAdapter,
    @Inject(LOGIN_RULE) private readonly loginRule: RateLimitRule,
  ) {}

  private webURL(): string {
    return this.config.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  private rateKey(headers: Headers): string {
    return loginRateLimitKey(headers, this.config.RATE_LIMIT_FORWARDED_DEPTH, this.config.NODE_ENV);
  }

  /**
   * Is this client currently locked out (spec 2.1)? PEEK, NOT CONSUME — the
   * check runs BEFORE the engine so a locked-out client costs no argon2 hash.
   */
  private async loginBlocked(headers: Headers): Promise<boolean> {
    if (this.config.RATE_LIMIT_MODE !== "enforce") return false;
    const decision = await this.rateLimit.peek(this.rateKey(headers), this.loginRule);
    return !decision.allowed;
  }

  private failure(code: AuthCode, status: HttpStatus): never {
    throw new HttpException({ ok: false, code }, status);
  }

  async signUp(
    input: unknown,
    headers: Headers,
  ): Promise<{ body: AuthSuccess; setCookies: string[] }> {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) validationFailed(parsed.error);

    // Account-creation spam gate. IP-keyed, so the message is identical
    // whether or not the email already exists.
    if (await this.loginBlocked(headers)) {
      this.failure("RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }

    let result: { headers: Headers; response: { user: { id: string } } };
    try {
      // The request locale rides ALS into the email hooks (the engine call
      // carries headers but no request scope for the hooks to read).
      result = await runWithRequestLocale(requestLocaleFromHeaders(headers), () =>
        this.engine.api.signUpEmail({
          headers,
          body: {
            email: parsed.data.email,
            password: parsed.data.password,
            name: parsed.data.name ?? "",
            // ABSOLUTE web URL: the engine bakes it into the emailed link and
            // redirects there after verification. A relative path would
            // resolve against the API origin instead.
            callbackURL: absoluteWebCallback("/dashboard", this.webURL(), "/dashboard"),
          },
          returnHeaders: true,
        }),
      );
    } catch (error) {
      const code = engineErrorCode(error);
      // Anti-enumeration: an already-registered email resolves as success (no
      // session is created for the existing user).
      if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        return { body: { ok: true }, setCookies: [] };
      }
      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
        this.failure("WEAK_PASSWORD", HttpStatus.BAD_REQUEST);
      }
      this.failure("UNKNOWN", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Stamp the request language onto the genuinely-new row only (NULL-only —
    // a real choice is never overwritten by a later guess). Unreachable for a
    // duplicate email: the engine threw above.
    await stampLocaleIfUnset(this.db, result.response.user.id, requestLocaleFromHeaders(headers));
    return { body: { ok: true }, setCookies: result.headers.getSetCookie() };
  }

  async signIn(
    input: unknown,
    headers: Headers,
  ): Promise<{ body: SignInSuccess; setCookies: string[] }> {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) {
      // Deliberate: no field detail — "Enter your password." would tell an
      // attacker their email parsed fine. Same code as a wrong password.
      this.failure("INVALID_CREDENTIALS", HttpStatus.UNAUTHORIZED);
    }

    const rateKey = this.rateKey(headers);

    // Before the engine, so a locked-out client costs no password hash.
    if (await this.loginBlocked(headers)) {
      this.failure("RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }

    let result: { headers: Headers; response: unknown };
    try {
      result = await this.engine.api.signInEmail({
        headers,
        body: { email: parsed.data.email, password: parsed.data.password },
        returnHeaders: true,
      });
    } catch (error) {
      const code = engineErrorCode(error);
      // Suspended/deleted is only reachable with CORRECT credentials (both
      // checks run after password verification), so naming the reason
      // enumerates nothing — and it deliberately does NOT consume (not a
      // brute-force signal; counting it would throttle innocent sharers).
      if (code === "BANNED_USER" || code === "ACCOUNT_DELETED") {
        this.failure("ACCOUNT_SUSPENDED", HttpStatus.FORBIDDEN);
      }
      if (
        code === "INVALID_EMAIL_OR_PASSWORD" ||
        code === "INVALID_PASSWORD" ||
        code === "INVALID_EMAIL" ||
        code === "USER_NOT_FOUND" ||
        code === "EMAIL_NOT_VERIFIED"
      ) {
        // The ONLY branch that counts — the brute-force signal.
        await this.rateLimit.consume(rateKey, this.loginRule);
        this.failure("INVALID_CREDENTIALS", HttpStatus.UNAUTHORIZED);
      }
      this.failure("UNKNOWN", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Success clears the bucket — what keeps a shared office IP from ever
    // accumulating. The stored language rides the response body (not a second
    // hop): read by EMAIL, because the session cookie the engine just minted
    // lives only on the response — resolving the session here would still see
    // the anonymous request.
    await this.rateLimit.reset(rateKey);
    const locale = await storedLocaleForEmail(this.db, parsed.data.email);
    return { body: { ok: true, locale }, setCookies: result.headers.getSetCookie() };
  }

  async signOut(headers: Headers): Promise<{ body: AuthSuccess; setCookies: string[] }> {
    // Idempotent by design: signing out with no session is still success.
    try {
      const result = await this.engine.api.signOut({ headers, returnHeaders: true });
      return { body: { ok: true }, setCookies: result.headers.getSetCookie() };
    } catch {
      return { body: { ok: true }, setCookies: [] };
    }
  }

  /**
   * Step 1: email a reset link. ALWAYS resolves success — including for an
   * address with no account and for a malformed one — or this endpoint becomes
   * the account-enumeration oracle the other flows avoid.
   */
  async requestPasswordReset(input: unknown, headers: Headers): Promise<{ body: AuthSuccess }> {
    const parsed = resetRequestSchema.safeParse(input);
    if (!parsed.success) return { body: { ok: true } };

    // Rate-limited SILENTLY: same neutral outcome, we simply do not send.
    // This is also the §22.4 mail-flood protection.
    const decision = await this.rateLimit.consume(this.rateKey(headers), this.loginRule);
    if (this.config.RATE_LIMIT_MODE === "enforce" && !decision.allowed) {
      return { body: { ok: true } };
    }

    try {
      await runWithRequestLocale(requestLocaleFromHeaders(headers), () =>
        this.engine.api.requestPasswordReset({
          headers,
          body: {
            email: parsed.data.email,
            // Absolute web URL for the same reason as the signup callbackURL.
            redirectTo: absoluteWebCallback(
              (input as { redirectTo?: unknown } | null)?.redirectTo,
              this.webURL(),
              "/reset-password",
            ),
          },
        }),
      );
    } catch {
      // Whatever went wrong — including a configuration outage — resolves as
      // success. A genuine outage shows up in dead letters, where it belongs.
    }
    // The drain kick lives in the engine's email hook (covers the legacy
    // engine-HTTP path too, not just this controller).
    return { body: { ok: true } };
  }

  /**
   * Step 2: consume the token and set the new password. Live sessions die in
   * the engine (`revokeSessionsOnPasswordReset`) — nothing to sign into, the
   * client sends the user back to `/login`.
   */
  async confirmPasswordReset(input: unknown, headers: Headers): Promise<{ body: AuthSuccess }> {
    const parsed = resetConfirmSchema.safeParse(input);
    if (!parsed.success) validationFailed(parsed.error);

    try {
      await this.engine.api.resetPassword({
        headers,
        body: { token: parsed.data.token, newPassword: parsed.data.newPassword },
      });
      return { body: { ok: true } };
    } catch (error) {
      const code = engineErrorCode(error);
      // An expired token fails to be consumed and surfaces as INVALID_TOKEN —
      // either way the link is dead and they need a new one.
      if (code === "INVALID_TOKEN") {
        this.failure("INVALID_TOKEN", HttpStatus.BAD_REQUEST);
      }
      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
        this.failure("WEAK_PASSWORD", HttpStatus.BAD_REQUEST);
      }
      this.failure("UNKNOWN", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Thin alias for the engine's emailed hop (spec 2.1 endpoint list): the
   * browser flow uses the engine URL baked into the email; this endpoint gives
   * API clients the same hop under the versioned contract.
   */
  verifyEngineUrl(token: string, callbackUrl: unknown): string {
    const callback = absoluteWebCallback(callbackUrl, this.webURL(), "/dashboard");
    const params = new URLSearchParams({ token, callbackURL: callback });
    return `${this.config.BETTER_AUTH_URL.replace(/\/+$/, "")}/api/auth/verify-email?${params.toString()}`;
  }
}
