/**
 * Shared database package (spec 11) — schema, migrations, pagination helpers
 * and the client factory. No framework, no env reads: the connection string
 * arrives as an argument to `createDb`.
 */
export * from "./client";
export * from "./pagination";
export * from "./schema";
