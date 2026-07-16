/**
 * Super-admin feature module (spec 6 — system administration).
 *
 * Gated by a system-level super-admin flag (independent of org roles) via
 * `requireSuperAdmin()` in `./context.ts` — NOT by middleware; see that file for
 * why the spec's literal wording cannot be honoured. Provides global
 * user/organization listings, account suspension, impersonation (banner +
 * audit-logged), and account deletion (soft delete + retention). Critical admin
 * actions are written to the audit log (spec 6.3) by `./audit.ts`.
 *
 * This barrel stays isomorphic. Server-only modules (`actions.ts`, `context.ts`,
 * `data.ts`) are imported by full path so server code never reaches a client
 * bundle — and `data.ts`/`adminAuthAdapter` are additionally restricted by
 * `no-restricted-imports` (see eslint.config.mjs).
 */

export { ImpersonationBanner } from "./components/impersonation-banner";
export {
  PAGE_SIZE,
  USER_STATUSES,
  userListQuerySchema,
  orgListQuerySchema,
  auditListQuerySchema,
  type UserListQuery,
  type OrgListQuery,
  type AuditListQuery,
  type UserStatusFilter,
} from "./schema";
export { AUDIT_ACTIONS, type AuditAction, type AuditTargetType } from "./audit";
