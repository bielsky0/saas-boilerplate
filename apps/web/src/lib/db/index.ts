import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env/server";
import * as schema from "./schema";

/**
 * Drizzle database client (spec 1.1 / 11 — ORM isolated behind one module).
 *
 * This is the ONLY place the application opens a database connection. Feature
 * code imports `db` from here and never touches the `postgres` driver directly,
 * so the ORM/driver can be swapped without changing business logic.
 *
 * The client is cached on `globalThis` so Next.js hot-reload in development does
 * not open a new connection pool on every module reload.
 */
const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
};

const client = globalForDb.client ?? postgres(env.DATABASE_URL);

if (env.NODE_ENV !== "production") {
  globalForDb.client = client;
}

export const db = drizzle(client, { schema });
export { schema };
