/**
 * Super-admin feature module (spec 6 — system administration).
 *
 * Gated by a system-level super-admin flag (independent of org roles) via
 * `requireSuperAdmin()` in `./context.ts` — NOT by middleware; see that file for
 * why the spec's literal wording cannot be honoured. Reads and mutations go to
 * the NestJS API (`./client.ts` in the browser, `@/lib/api` on the server);
 * the panel holds no database access since faza 2.6. Critical admin actions
 * are written to the audit log (spec 6.3) by the API, Rule A / Rule B.
 *
 * This barrel stays isomorphic. Server-only modules (`context.ts`) are
 * imported by full path so server code never reaches a client bundle.
 */

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
