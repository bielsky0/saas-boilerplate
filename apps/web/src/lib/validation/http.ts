import { NextResponse } from "next/server";
import type { z } from "zod";
import { flattenError } from "zod";

/**
 * The JSON error envelope for route handlers (spec 22.2).
 *
 * The keys (`error`, plus `issues` on a schema failure) are not new — they are
 * the convention the routes already followed by hand. What was missing was ONE
 * definition of them, and the cost of that showed up as two adjacent routes
 * disagreeing: `api/storage/presign` returned `{ error, issues }` while
 * `api/storage/confirm`, four files away, returned a bare `{ error }` for the
 * same class of failure. A client could not write one error handler.
 *
 * `error` is a human-readable string, never a machine code. That is a real
 * limitation and worth stating: a caller that wants to branch on the KIND of
 * failure has only the status code. Adding a stable `code` field is the obvious
 * next step and deliberately not taken here, because nothing in the app consumes
 * one yet and inventing a code vocabulary with no reader would be guesswork.
 *
 * Status codes, as used across the app:
 *   400 — malformed request (unparseable JSON, bad signature)
 *   401 — unauthenticated
 *   404 — not found, or a feature that is not configured
 *   422 — well-formed but failed the schema
 *   502 — an upstream provider failed
 *
 * ⚠️ These build a response; they never THROW. The authz guards
 * (`requireSession`, `requireOrgPermission`, `resolveStorageOwner`) throw Next
 * navigation errors instead, and those must reach the framework untouched — see
 * `features/storage/http.ts`, which returns `null` for anything it does not
 * recognize precisely so its caller can rethrow.
 */

/** 400 — the body was not parseable as JSON at all. */
export function invalidJson(): NextResponse {
  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
}

/**
 * 422 — the body parsed but failed the schema. Carries `issues` as a
 * `field → messages` map, the wire form of the same shape `FormState.fieldErrors`
 * uses for actions (§22.2 asks for one predictable format, not two).
 */
export function validationFailed(error: z.ZodError, message = "Invalid request"): NextResponse {
  return NextResponse.json(
    { error: message, issues: flattenError(error).fieldErrors },
    { status: 422 },
  );
}

/** Any other error response, so no route hand-writes `NextResponse.json` again. */
export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
