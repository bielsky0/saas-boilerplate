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

/**
 * Pull the violated constraint's NAME out of the same error chain.
 *
 * The SQLSTATE alone stopped being enough in F5. `23P01` is shared by every
 * EXCLUDE constraint in the schema — today `class_session_trainer_no_overlap_excl`
 * (§5.1) and `booking_athlete_no_overlap_excl` (§5.3), tomorrow whatever F18 adds
 * — and the booking path has to tell them apart to choose a message: "this
 * trainer is already teaching then" and "this child is already booked then" are
 * different facts for different people.
 *
 * READING `.constraint` IS NOT READING THE MESSAGE, and the distinction is the
 * whole reason this function is allowed to exist next to the rule above. A
 * constraint name is a schema object this repo declares by hand in its
 * migrations; it changes only when someone writes DDL to change it, and it is
 * the same string in every locale and every Postgres version. A message is prose
 * that the server composes and may reword. So this is a stable interface and the
 * message is not — the rule stands, this is not a relaxation of it.
 *
 * Same walk as `sqlStateOf`, for the same wrapping reason.
 *
 * The property is `constraint_name`, VERIFIED against a real error from this
 * database rather than assumed — postgres-js raises
 * `{name, severity, code, detail, schema_name, table_name, constraint_name,
 * file, line, routine}`. It is worth naming here because node-postgres, the
 * other driver anyone would reach for, calls the same field `constraint`, so a
 * reader porting code between the two will find a silent `null` and a booking
 * refusal that falls back to a generic message.
 */
export function constraintOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && "constraint_name" in current) {
      const name = (current as { constraint_name: unknown }).constraint_name;
      if (typeof name === "string" && name.length > 0) return name;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** Exclusion constraint violation — §5.1 trainer overlap, §5.3 athlete overlap. */
export const SQLSTATE_EXCLUSION_VIOLATION = "23P01";
/** Unique violation — §4.4 duplicate generated session, slug collisions. */
export const SQLSTATE_UNIQUE_VIOLATION = "23505";
/**
 * §5.3 — the same athlete on two overlapping sessions (`0014_lively_sumo.sql`).
 *
 * Also fires for the same athlete twice on the SAME session, because a tstzrange
 * overlaps itself. That is why no `unique(sessionId, athleteId)` index exists and
 * none should be added: it would never fire, because this constraint gets there
 * first.
 */
export const CONSTRAINT_BOOKING_ATHLETE_OVERLAP = "booking_athlete_no_overlap_excl";
/** §5.1 — the same trainer on two overlapping sessions (`0014_lively_sumo.sql`). */
export const CONSTRAINT_SESSION_TRAINER_OVERLAP = "class_session_trainer_no_overlap_excl";
