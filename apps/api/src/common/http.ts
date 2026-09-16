import { HttpException, HttpStatus } from "@nestjs/common";
import { flattenError, type z } from "zod";

/**
 * JSON error envelope for API routes — the Nest twin of the web app's
 * `src/lib/validation/http.ts` (spec 22.2).
 *
 * Same shape (`{ error }`, plus `issues` as a `field → messages` map on
 * schema failures) and same status codes (400 malformed, 401 unauthenticated,
 * 403 forbidden, 404 not found, 422 schema failure), so a client writes ONE
 * error handler for both apps. The one deliberate difference: these THROW
 * (Nest's exception layer serializes the body), where the web helpers RETURN
 * a response (Next route handlers return it).
 */

/** 422 — the input parsed but failed the schema. */
export function validationFailed(error: z.ZodError, message = "Invalid request"): never {
  throw new HttpException(
    { error: message, issues: flattenError(error).fieldErrors },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** 401 — no valid session on the request. */
export function unauthorized(message = "Not authenticated"): never {
  throw new HttpException({ error: message }, HttpStatus.UNAUTHORIZED);
}

/** 403 — authenticated, but not allowed (non-member, unknown role). */
export function forbidden(message = "Forbidden"): never {
  throw new HttpException({ error: message }, HttpStatus.FORBIDDEN);
}

/** 404 — unknown org slug, or orgs disabled (indistinguishable by design). */
export function notFound(message = "Not found"): never {
  throw new HttpException({ error: message }, HttpStatus.NOT_FOUND);
}
