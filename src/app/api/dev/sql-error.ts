/**
 * Pull the Postgres SQLSTATE out of a thrown query error (test-only helper).
 *
 * The langlion specs assert that the DATABASE refuses things — 23P01 for an
 * exclusion constraint, 23505 for a unique violation, 42501 for an RLS policy —
 * so the SQLSTATE is the assertion target, not the message.
 *
 * It needs a walk rather than a property read: postgres-js raises a
 * `PostgresError` carrying `code`, but Drizzle wraps that in a
 * `DrizzleQueryError` whose own `code` is undefined and whose `cause` holds the
 * real one. Reading `error.code` therefore yields `null` for every genuine
 * constraint violation — an assertion that then fails while the database was
 * behaving perfectly. Walking the chain keeps this working whether or not a
 * future Drizzle version keeps wrapping.
 */
export function sqlStateOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === "string" && code.length > 0) return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}
