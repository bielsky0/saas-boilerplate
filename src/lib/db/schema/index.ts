/**
 * Drizzle schema barrel (spec 11 — database schema).
 *
 * Re-export every table/enum/relation module from here so that both the Drizzle
 * client (`src/lib/db/index.ts`) and Drizzle Kit (`drizzle.config.ts`) see the
 * full schema from a single entry point.
 *
 * Business entities added by later modules MUST carry a tenant-owner column
 * (`organization_id` or `account_id`), indexed, per spec 11.2 (tenant isolation).
 * There are exactly TWO documented exceptions, both justified in their own file
 * headers — do not add a third without the same treatment:
 *   - `./auth`: the Better Auth identity tables are the substrate multi-tenancy
 *     (§3) is built on top of — a user exists before any tenant does.
 *   - `./audit-logs`: a super-admin action log (§6.3) is cross-tenant by
 *     definition and may concern no tenant at all. Its access boundary is
 *     `requireSuperAdmin()` rather than an owner filter.
 *
 * §3 owner-scoped reference: `personal_account` / `organization` are the two
 * tenant owners; `membership` and `invitation` are scoped by `organizationId`.
 *
 * §5 billing tables show the other owner shape: a record that may belong to
 * EITHER tenant owner (spec 5.2), modelled as two nullable columns plus a CHECK
 * enforcing exactly one — see `./billing-customers`.
 */

export * from "./auth";
export * from "./personal-accounts";
export * from "./organizations";
export * from "./memberships";
export * from "./invitations";
export * from "./billing-customers";
export * from "./subscriptions";
export * from "./billing-payments";
export * from "./webhook-events";
export * from "./audit-logs";
