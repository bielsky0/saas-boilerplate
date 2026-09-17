/**
 * Auth provider adapter (spec 1.2, 2 — pluggable authentication backend).
 *
 * The canonical reference adapter (docs/ARCHITECTURE.md). Feature/UI and server
 * code import `authAdapter` + the contract types from here and never touch the
 * SDK. `auth` (the raw Better Auth instance) is re-exported for the places that
 * must mount the engine itself: the MCP/OAuth routes (faza 2.7 owns moving
 * them to Nest) — authorization goes through `src/lib/auth`, not this raw
 * instance.
 *
 * The super-admin engine calls (spec 6) moved to Nest with faza 2.6
 * (`AdminService`, audited Rule A / Rule B behind `SuperAdminGuard`) — this
 * module no longer offers them, and the `no-restricted-imports` rule that
 * fenced them died with the adapter.
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
