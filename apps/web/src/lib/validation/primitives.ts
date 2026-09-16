/**
 * Back-compat shim — the source of truth moved to `@repo/validation`.
 * New code imports the package directly; this file dies with the last
 * `@/lib/validation/*` importer (full removal when features move to Nest).
 */
export * from "@repo/validation/primitives";
