/**
 * Auth provider adapter (spec 1.2, 2 — pluggable authentication backend).
 *
 * The canonical reference adapter (docs/ARCHITECTURE.md). Feature/UI and server
 * code import `authAdapter` + the contract types from here and never touch the
 * SDK. `auth` (the raw Better Auth instance) is re-exported for the two places
 * that must mount the engine itself: the catch-all route handler and nowhere
 * else — authorization goes through `src/lib/auth`, not this raw instance.
 */

import { betterAuthAdapter } from "./better-auth";

export const authAdapter = betterAuthAdapter;

export { auth } from "./better-auth";
export type {
  AuthAdapter,
  AuthErrorCode,
  AuthResult,
  Session,
  SessionUser,
  SignInInput,
  SignUpInput,
} from "./contract";
