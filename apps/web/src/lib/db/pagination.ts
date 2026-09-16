/**
 * Back-compat shim — the source of truth moved to `@repo/db/pagination`.
 * This file dies when the last feature moves to Nest (web loses all DB reads).
 */
export * from "@repo/db/pagination";
