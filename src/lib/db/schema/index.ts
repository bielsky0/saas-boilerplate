/**
 * Drizzle schema barrel (spec 11 — database schema).
 *
 * Re-export every table/enum/relation module from here so that both the Drizzle
 * client (`src/lib/db/index.ts`) and Drizzle Kit (`drizzle.config.ts`) see the
 * full schema from a single entry point.
 *
 * BUSINESS entities added by later modules MUST carry a tenant-owner column
 * (`organization_id` or `account_id`), indexed, per spec 11.2 (tenant isolation).
 *
 * SYSTEM/INFRASTRUCTURE tables do not, and the distinction is a rule rather than
 * a list of exceptions: a table is exempt when its subject is not a tenant record
 * AND its access boundary is a system credential rather than an owner filter.
 * Both halves must hold. Each such table justifies itself in its own header:
 *   - `./auth`: the Better Auth identity tables are the substrate multi-tenancy
 *     (§3) is built on top of — a user exists before any tenant does.
 *   - `./audit-logs`: a super-admin action log (§6.3) is cross-tenant by
 *     definition and may concern no tenant at all. Boundary: `requireSuperAdmin()`.
 *   - `./jobs`: a cron job (retention purge, weekly reports — §12.1) belongs to no
 *     tenant, so an XOR CHECK cannot hold. Boundary: `CRON_SECRET` /
 *     `requireSuperAdmin()`. Tenant ids live in `payload` as data.
 *   - `./email-suppressions`: an address (§10.3) is not a tenant record — it may
 *     map to no user, and to several tenants at once. A global opt-out is the
 *     point. Boundary: an HMAC-signed link, not a session.
 *
 * If a new table seems to qualify, check both halves honestly before adding it
 * here: "the query is awkward to scope" is not the same as "the subject is not a
 * tenant record". `webhook_event` is the instructive near-miss — it looks like
 * infrastructure, but it is only ever written after its owner is resolved, so it
 * carries the owner like any business table.
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
export * from "./jobs";
export * from "./email-suppressions";
