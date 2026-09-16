/**
 * Storage feature barrel (spec 21).
 *
 * Only ISOMORPHIC exports belong here — things the client bundle may import
 * (validation constants, input types). Server-only modules (`data`, `presign`,
 * `purge`) are imported by their full path from route handlers so they never
 * reach the browser, exactly as `features/billing/index.ts` keeps `webhooks`
 * server-side.
 */

export {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  VISIBILITIES,
  presignInputSchema,
  confirmInputSchema,
  type PresignInput,
} from "./schema";
