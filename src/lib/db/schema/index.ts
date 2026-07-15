/**
 * Drizzle schema barrel (spec 11 — database schema).
 *
 * Re-export every table/enum/relation module from here so that both the Drizzle
 * client (`src/lib/db/index.ts`) and Drizzle Kit (`drizzle.config.ts`) see the
 * full schema from a single entry point.
 *
 * Business entities added by later modules MUST carry a tenant-owner column
 * (`organization_id` or `account_id`), indexed, per spec 11.2 (tenant isolation).
 * The Better Auth identity tables in `./auth` are the one documented exception —
 * they are the identity substrate multi-tenancy (§3) is built on top of, so they
 * have no tenant-owner column (see the header of `./auth`).
 *
 * Example (added later):
 *   export * from "./organizations";
 *   export * from "./memberships";
 */

export * from "./auth";
