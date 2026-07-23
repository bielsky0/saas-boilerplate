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
 *   - `./jobs`: a cron job (retention purge, weekly reports — §12.1) belongs to no
 *     tenant, so an XOR CHECK cannot hold. Boundary: `CRON_SECRET` /
 *     `requireSuperAdmin()`. Tenant ids live in `payload` as data.
 *   - `./email-suppressions`: an address (§10.3) is not a tenant record — it may
 *     map to no user, and to several tenants at once. A global opt-out is the
 *     point. Boundary: an HMAC-signed link, not a session.
 *   - `./rate-limits`: a counter (§22.3) is keyed on a CLIENT identifier, which
 *     may map to no user and, behind a shared NAT, to several tenants at once.
 *     Per-tenant counters would hand an attacker a fresh allowance per tenant
 *     named. Boundary: no feature code reads the table at all — the only readers
 *     are the proxy and the sign-in action.
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
 * THE TWO OWNER TARGETS ARE OUTSIDE RLS BY CONSTRUCTION (F1a). `organization`
 * and `personal_account` carry no policy, and this is a rule rather than two
 * separate omissions: a policy keyed on the owner cannot be applied to the row
 * that DEFINES that owner. The query which resolves `organization` from a URL
 * slug, and the query which resolves `personal_account` from a user id, are the
 * queries that PRODUCE the values the GUCs are set to — a policy on them would
 * have to be satisfied before it could be evaluated. Note this is a statement
 * about circularity, not about safety: both are still owner-filtered in the DAL,
 * and `organization` rows are not secret (a slug is a public URL segment).
 * Do not read it as licence to exempt a third table for being inconvenient.
 *
 * §5 billing tables show the other owner shape: a record that may belong to
 * EITHER tenant owner (spec 5.2), modelled as two nullable columns plus a CHECK
 * enforcing exactly one — see `./billing-customers`.
 *
 * §6.4 `./audit-logs` is the THIRD and last owner shape, and the only table
 * permitted to use it: an owner column that is present and indexed like any
 * business table, but NULLABLE. It was previously listed above as a carve-out
 * with no owner at all; widening the ledger from super-admin actions to ordinary
 * tenant mutations ended that. Do not copy this shape. It is justified only
 * because an audit event's tenant is a fact ABOUT the event rather than a
 * precondition of writing it — some events (a system-role grant, impersonating a
 * user in no org) genuinely have no tenant, and forcing them to invent one would
 * corrupt the ledger. For every other table, not knowing the owner means you are
 * not ready to write the row.
 *
 * --- langlion domain tables (spec docs/specyfikacja.md §1.2) ---
 *
 * The block at the bottom of this file is the booking/credits domain built on top
 * of the boilerplate. Three properties distinguish it from everything above:
 *
 * 1. Every one of them carries a NOT NULL `organizationId` — the first owner
 *    shape, no exceptions and no XOR. An academy is always a team account; there
 *    is no personal-account variant of a class schedule.
 * 2. They are the first tables under Row-Level Security. The application filter
 *    stays mandatory (it is what hits the index); RLS is the second line that
 *    holds when someone forgets it (US-1.1/AC1). All access goes through
 *    `withTenant` in `@/lib/db/tenant`.
 * 3. Two of them (`session`, `booking`) carry EXCLUDE constraints that live only
 *    in hand-written migration SQL and are invisible to the Drizzle snapshot.
 *    Their headers list the exact columns involved. `drizzle-kit push` would drop
 *    them and is banned repo-wide.
 *
 * `athlete` and `group_type_recurrence` carry an `organizationId` the spec's
 * column list omits (decyzja D9) — rule 1 above applies to them too, and an RLS
 * policy without a local owner column costs a subquery per row.
 *
 * ⚠️ EXPORT NAMES MUST BE UNIQUE ACROSS THIS BARREL, and nothing enforces it.
 * `export *` from two modules exporting the same binding does not error — the
 * name simply becomes ambiguous and is omitted. `drizzle-kit generate` then skips
 * the shadowed table while still emitting foreign keys that reference the OTHER
 * table of that name, producing a migration that is wrong rather than broken.
 * This already happened once: the langlion spec calls its class occurrence
 * `session`, which Better Auth's `./auth` module already owns, and the generated
 * migration pointed `booking` at login sessions. Hence `class_session` /
 * `classSession`. Before adding a table, grep this directory for its name.
 */

export * from "./auth";
export * from "./personal-accounts";
export * from "./organizations";
export * from "./memberships";
export * from "./invitations";
export * from "./staff-session-handoffs";
export * from "./billing-customers";
export * from "./subscriptions";
export * from "./billing-payments";
export * from "./webhook-events";
export * from "./audit-logs";
export * from "./jobs";
export * from "./email-suppressions";
export * from "./files";
export * from "./notifications";
export * from "./notification-preferences";
export * from "./rate-limits";

// langlion domain (§1.2). Ordered by dependency, not alphabetically: each table
// references only the ones above it.
export * from "./locations";
export * from "./group-types";
export * from "./group-type-recurrences";
export * from "./class-sessions";
export * from "./clients";
export * from "./client-otps";
export * from "./client-sessions";
export * from "./athletes";
export * from "./bookings";
export * from "./credit-types";
export * from "./credits";
export * from "./grade-fields";
export * from "./grades";
export * from "./progress-notes";
