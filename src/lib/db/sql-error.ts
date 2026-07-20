/**
 * Pull the Postgres SQLSTATE out of a thrown query error.
 *
 * This repo leans on the DATABASE to refuse things (Zasada nadrzędna #3): 23P01
 * for an exclusion constraint, 23505 for a unique violation, 42501 for an RLS
 * policy. Code that has to tell "the database correctly refused this one row"
 * from "the query is broken" therefore branches on the SQLSTATE, never on the
 * message — messages carry constraint names and are not a stable interface.
 *
 * It needs a walk rather than a property read: postgres-js raises a
 * `PostgresError` carrying `code`, but Drizzle wraps that in a
 * `DrizzleQueryError` whose own `code` is undefined and whose `cause` holds the
 * real one. Reading `error.code` therefore yields `null` for every genuine
 * constraint violation — and a caller that treats null as "not a constraint
 * error" would rethrow, turning a row it meant to skip into a failed request or
 * a dead-lettered job. Walking the chain keeps this working whether or not a
 * future Drizzle version keeps wrapping.
 *
 * Lives in `lib/db` rather than beside its first caller because it is now read
 * by production paths (season generation, in-season pattern edits) as well as by
 * the dev-only probes it was originally written for.
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

/** Exclusion constraint violation — §5.1 trainer overlap, §5.3 athlete overlap. */
export const SQLSTATE_EXCLUSION_VIOLATION = "23P01";
/** Unique violation — §4.4 duplicate generated session, slug collisions. */
export const SQLSTATE_UNIQUE_VIOLATION = "23505";
