/**
 * Auth provider contract (spec 1.2, 2 — pluggable authentication backend).
 *
 * Feature/UI and server code depend ONLY on this interface and its DTO/error
 * types — never on the underlying SDK. The concrete implementation
 * (`./better-auth.ts`) wraps one provider and can be swapped without touching
 * callers. This is the canonical reference adapter (see docs/ARCHITECTURE.md).
 *
 * Scope for this phase: email/password sign-up, sign-in, email verification,
 * session resolution, and sign-out. The interface is intentionally small but
 * extensible — OAuth, magic link, and MFA methods are added in later phases.
 */

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface Session {
  user: SessionUser;
  expiresAt: Date;
}

/**
 * Neutral, provider-agnostic error codes. The adapter maps every vendor error
 * onto one of these so callers never branch on SDK strings and anti-enumeration
 * is enforced at the boundary (spec 2.1):
 * - INVALID_CREDENTIALS covers BOTH "no such email" and "wrong password".
 * - Sign-up never surfaces "email already exists" (see AuthResult below).
 */
export type AuthErrorCode =
  "INVALID_CREDENTIALS" | "WEAK_PASSWORD" | "VERIFICATION_INVALID" | "UNKNOWN";

export type AuthResult = { ok: true } | { ok: false; code: AuthErrorCode };

export interface SignUpInput {
  email: string;
  password: string;
  name?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthAdapter {
  /**
   * Create an email/password account and trigger the verification email.
   * ALWAYS resolves `{ ok: true }` when the input is well-formed — including
   * when the email is already registered — so the response cannot be used to
   * enumerate accounts (spec 2.1). A distinct outcome only occurs for a weak
   * password rejected by the engine.
   */
  signUpEmailPassword(input: SignUpInput, headers: Headers): Promise<AuthResult>;

  /**
   * Verify email/password credentials and open a session. Unknown email and
   * wrong password both return INVALID_CREDENTIALS.
   */
  signInEmailPassword(input: SignInInput, headers: Headers): Promise<AuthResult>;

  /** Resolve and fully validate the current session (server-side source of truth). */
  getSession(headers: Headers): Promise<Session | null>;

  /** Destroy the current session. */
  signOut(headers: Headers): Promise<void>;
}
