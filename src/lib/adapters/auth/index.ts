/**
 * Auth provider adapter (spec 1.2, 2 — pluggable authentication backend).
 *
 * Defines the internal auth contract (sign-in/out, session verification,
 * account linking, MFA, OAuth) that the `features/auth` module consumes.
 * Concrete implementation wraps one provider (Better Auth / Supabase Auth /
 * NextAuth) and can be swapped without touching feature or UI code.
 */

export {};
