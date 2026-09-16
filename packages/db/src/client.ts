import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Database client factory (spec 1.1 / 11 — ORM isolated behind one module).
 *
 * This is the ONLY place a database connection is opened. Callers pass the
 * connection string in — the package never reads `process.env` itself, so it
 * works under Next.js (`@t3-oss/env-nextjs`), NestJS (`ConfigService`) and
 * plain scripts alike, and the "default must never throw at module load" rule
 * holds: nothing connects until `createDb` is called.
 *
 * Each app wires exactly one instance (web: `apps/web/src/lib/db`,
 * api: `apps/api` DbModule) with dev hot-reload caching on its own side.
 */
export function createDb(url: string) {
  const client = postgres(url);
  return drizzle(client, { schema });
}

/** The Drizzle client type — the substrate `JobWriter` and repositories build on. */
export type Db = ReturnType<typeof createDb>;

export { schema };
