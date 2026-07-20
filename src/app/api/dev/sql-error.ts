/**
 * Re-export of the shared SQLSTATE reader (`@/lib/db/sql-error`).
 *
 * It used to be DEFINED here, back when the dev probes were its only callers.
 * Faza 2 gave it production callers — season generation and in-season pattern
 * edits both have to tell "the database correctly refused this one row" from "the
 * query is broken" — so the implementation moved to `lib/db` and this file stayed
 * as an alias for the probe routes that import it by this path.
 *
 * Kept as an alias rather than copied. Two readers that disagreed about how deep
 * to walk the `cause` chain would make the tests and the code they guard disagree
 * about what a constraint violation even looks like.
 */
export { sqlStateOf } from "@/lib/db/sql-error";
