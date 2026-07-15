/**
 * Drizzle schema barrel (spec 11 — database schema).
 *
 * Re-export every table/enum/relation module from here so that both the Drizzle
 * client (`src/lib/db/index.ts`) and Drizzle Kit (`drizzle.config.ts`) see the
 * full schema from a single entry point.
 *
 * No tables exist yet — this is the section-1 foundation. Business entities are
 * added by later modules and MUST carry a tenant-owner column
 * (`organization_id` or `account_id`), indexed, per spec 11.2 (tenant isolation).
 *
 * Example (added later):
 *   export * from "./organizations";
 *   export * from "./memberships";
 */

export {};
