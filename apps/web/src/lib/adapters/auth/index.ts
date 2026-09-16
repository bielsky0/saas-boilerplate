/**
 * Auth provider adapter (spec 1.2, 2 — pluggable authentication backend).
 *
 * The canonical reference adapter (docs/ARCHITECTURE.md). Feature/UI and server
 * code import `authAdapter` + the contract types from here and never touch the
 * SDK. `auth` (the raw Better Auth instance) is re-exported for the two places
 * that must mount the engine itself: the catch-all route handler and nowhere
 * else — authorization goes through `src/lib/auth`, not this raw instance.
 *
 * `adminAuthAdapter` (spec 6) is RESTRICTED: only `src/features/admin` may
 * import it, enforced by `no-restricted-imports` in eslint.config.mjs. Every one
 * of its operations must be audit-logged (spec 6.3), and the audit write lives
 * in `features/admin/actions.ts` — an import from anywhere else is by definition
 * an unaudited privileged action.
 */

import { betterAuthAdapter, betterAuthAdminAdapter } from "./better-auth";

export const authAdapter = betterAuthAdapter;
export const adminAuthAdapter = betterAuthAdminAdapter;

export { auth } from "./better-auth";
export type {
  AdminAuthAdapter,
  AuthAdapter,
  AuthErrorCode,
  AuthResult,
  Session,
  SessionUser,
  SignInInput,
  SignUpInput,
} from "./contract";
