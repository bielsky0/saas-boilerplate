/**
 * Auth provider contract (spec 1.2, 2 — pluggable authentication backend).
 *
 * Feature/UI and server code depend ONLY on this interface and its DTO/error
 * types — never on the underlying SDK. The concrete implementation
 * (`./better-auth.ts`) wraps one provider and can be swapped without touching
 * callers. This is the canonical reference adapter (see docs/ARCHITECTURE.md).
 *
 * Scope: email/password sign-up, sign-in, email verification, session
 * resolution, and sign-out (`AuthAdapter`), plus the privileged super-admin
 * operations of §6 (`AdminAuthAdapter`, at the bottom of this file). The
 * interfaces are intentionally small but extensible — OAuth, magic link, and
 * MFA methods are added in later phases.
 */

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  /**
   * System-level super-admin flag (spec 6.1) — independent of every org role in
   * §4. Derived at the adapter boundary from whatever the provider uses to
   * represent it; callers never see the provider's representation.
   */
  isSuperAdmin: boolean;
  /** Suspended by an admin (spec 6.2). A suspended account cannot sign in. */
  suspended: boolean;
}

export interface Session {
  user: SessionUser;
  expiresAt: Date;
  /**
   * Id of the ADMIN who opened this session by impersonating `user` (spec 6.2);
   * null for an ordinary session.
   *
   * Deliberately on the SESSION, not on `SessionUser`: being impersonated is a
   * property of this one session, not of the person. The same user can have an
   * impersonated session and their own real session open at the same time, and
   * only one of them is admin-mode.
   */
  impersonatedBy: string | null;
}

/**
 * Neutral, provider-agnostic error codes. The adapter maps every vendor error
 * onto one of these so callers never branch on SDK strings and anti-enumeration
 * is enforced at the boundary (spec 2.1):
 * - INVALID_CREDENTIALS covers BOTH "no such email" and "wrong password".
 * - Sign-up never surfaces "email already exists" (see AuthResult below).
 *
 * ACCOUNT_SUSPENDED is the one code that reveals something about an account,
 * and it is safe HERE AND ONLY HERE: the suspension check runs AFTER password
 * verification, so it is only ever reachable by someone who already supplied
 * correct credentials. Nothing is leaked to an enumerating attacker. Do not
 * "fix" this back to INVALID_CREDENTIALS — a user locked out of their own
 * account deserves to know why.
 */
export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "WEAK_PASSWORD"
  | "VERIFICATION_INVALID"
  | "ACCOUNT_SUSPENDED"
  | "USER_NOT_FOUND"
  | "IMPERSONATION_FORBIDDEN"
  | "NOT_IMPERSONATING"
  | "UNKNOWN";

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

/**
 * Privileged identity/session operations for the super-admin panel (spec 6.1–6.2).
 *
 * SEPARATE from `AuthAdapter` on purpose, for three reasons:
 *   - it keeps the canonical reference adapter (above) small and easy to copy;
 *   - a provider with no impersonation support can still implement `AuthAdapter`
 *     in full, and simply not offer this one;
 *   - it gives ESLint a physical import boundary to enforce "only features/admin
 *     may call these" — every call MUST be audit-logged (spec 6.3), and an
 *     unaudited caller is the failure mode the log exists to prevent.
 *
 * READS ARE DELIBERATELY ABSENT. Listing and searching users is a cross-tenant
 * Drizzle query in `src/features/admin/data.ts`, not a provider call: a provider's
 * user list cannot join our memberships/subscriptions, cannot see our `deletedAt`,
 * and would return provider-shaped rows straight into our UI. Only operations that
 * genuinely need the identity ENGINE (minting sessions, revoking them) live here.
 */
export interface AdminAuthAdapter {
  /**
   * Open a session AS `userId`, preserving the caller's own session so
   * `stopImpersonating` can restore it.
   *
   * MUTATES RESPONSE COOKIES — callable only from a server action or route
   * handler, never during render.
   *
   * Fails with IMPERSONATION_FORBIDDEN when the caller is not a super admin, or
   * when the TARGET is one (admins do not impersonate each other), and with
   * USER_NOT_FOUND for an unknown target.
   */
  impersonate(userId: string, headers: Headers): Promise<AuthResult>;

  /**
   * Restore the impersonator's own session and end admin mode. Requires only a
   * session, not admin rights — the impersonated (non-admin) user must always be
   * able to get out. Fails with NOT_IMPERSONATING for an ordinary session.
   */
  stopImpersonating(headers: Headers): Promise<AuthResult>;

  /** Suspend an account (spec 6.2) and revoke its live sessions. */
  suspendUser(userId: string, reason: string | null, headers: Headers): Promise<AuthResult>;

  /** Lift a suspension. */
  unsuspendUser(userId: string, headers: Headers): Promise<AuthResult>;

  /** Grant or revoke the system-level super-admin flag (spec 6.1). */
  setSuperAdmin(userId: string, value: boolean, headers: Headers): Promise<AuthResult>;

  /** Revoke every live session for a user (hygiene after a soft delete). */
  revokeUserSessions(userId: string, headers: Headers): Promise<AuthResult>;
}
