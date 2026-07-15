/**
 * Auth feature module (spec 2 — authentication).
 *
 * Email/password + magic link + OAuth (Google, GitHub) sign-in, email
 * verification, password reset, MFA/TOTP, and device/session management.
 *
 * This module owns auth UI and application flows; it talks to the auth provider
 * ONLY through `src/lib/adapters/auth` (spec 1.2 — no vendor lock-in). Session
 * and authorization helpers used by the data layer live in `src/lib/auth`.
 */

export {};
