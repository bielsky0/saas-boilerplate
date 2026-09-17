/**
 * Shared validation vocabulary (spec 22.2) — the isomorphic half of the layer.
 *
 * `primitives` (wire IDs: slugs, ids) and `state` (the `FormState` result
 * shape) are pure Zod: no Next.js, no database, safe to import from any
 * runtime — the web app, the NestJS API, a future React Native client.
 *
 * Server-framework envelopes stay with their framework: Next.js keeps
 * `@/lib/validation/http`, Nest gets its own filter in `apps/api`.
 */
export { type FormState, invalid } from "./state";
export {
  SLUG_PATTERN,
  SLUG_MIN,
  SLUG_MAX,
  slugParam,
  optionalSlugParam,
  idParam,
} from "./primitives";
export {
  STORAGE_MAX_UPLOAD_BYTES,
  STORAGE_ALLOWED_CONTENT_TYPES,
  STORAGE_VISIBILITIES,
  presignInputSchema,
  confirmInputSchema,
  storageListQuerySchema,
  storageFileParamsSchema,
  type PresignInput,
  type ConfirmInput,
} from "./storage";
