import { env } from "@/lib/env/server";
import { createDb } from "@repo/db";

/**
 * Web-side database wiring (spec 11).
 *
 * The schema, migrations and client factory live in `@repo/db`; this module
 * only injects the connection string from the validated server env and holds
 * the instance. Cached on `globalThis` so Next.js hot-reload in development
 * does not open a new connection pool on every module reload.
 *
 * Feature code keeps importing `db` from here unchanged — until the feature
 * moves to Nest, at which point its `data.ts` goes with it and this module
 * loses another importer. When the last one is gone, this file dies too.
 */
const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createDb> | undefined;
};

export const db = globalForDb.db ?? createDb(env.DATABASE_URL);

if (env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export { schema } from "@repo/db";
export type { Db } from "@repo/db";
