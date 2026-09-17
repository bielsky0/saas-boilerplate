import { z } from "zod";

import { idParam, optionalSlugParam } from "./primitives";

/**
 * Storage wire schemas (spec 21.2 / 22.2) — the framework-free twin of the
 * web app's `features/storage/schema.ts`, ported in faza 2.4.
 *
 * The SINGLE source of truth for what may be uploaded, shared by the API
 * (the real check: the client's declaration is untrusted) and any client
 * that pre-validates. The bucket re-enforces the same limits via the
 * presigned-POST policy, so a client that lies to skip this still cannot
 * store an oversized or wrong-type object (defense in depth).
 *
 * The literal lists are declared HERE, not imported from
 * `@repo/contracts/storage`: this package imports no `@repo/*` at runtime
 * (`scripts/package-boundaries.mjs` enforces it — a Vue SPA vendors these
 * files verbatim). The contracts copy is the display/client twin; the two
 * must stay identical, and the E2E rejection tests pin the behavior.
 *
 * `slug` names the tenant the upload belongs to (absent → personal account).
 * It is part of the schema rather than read out-of-band beside it, because
 * it is the argument that decides WHOSE storage is written — the single
 * most authority-bearing field in the body.
 */

/** 10 MiB — must match `MAX_UPLOAD_BYTES` in `@repo/contracts/storage`. */
export const STORAGE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Must match `ALLOWED_CONTENT_TYPES` in `@repo/contracts/storage`. */
export const STORAGE_ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

/** Must match `VISIBILITIES` in `@repo/contracts/storage`. */
export const STORAGE_VISIBILITIES = ["public", "private"] as const;

export const presignInputSchema = z.object({
  slug: optionalSlugParam,
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(STORAGE_ALLOWED_CONTENT_TYPES),
  // Declared size — validated here, then bound into the bucket policy so the
  // object PUT itself fails if the real body exceeds it.
  size: z.number().int().positive().max(STORAGE_MAX_UPLOAD_BYTES),
  visibility: z.enum(STORAGE_VISIBILITIES).default("private"),
});

export type PresignInput = z.infer<typeof presignInputSchema>;

export const confirmInputSchema = z.object({
  slug: optionalSlugParam,
  fileId: idParam,
});

export type ConfirmInput = z.infer<typeof confirmInputSchema>;

/** `GET /v1/storage/files` + `GET/DELETE /v1/storage/files/:id` owner scope. */
export const storageListQuerySchema = z.object({
  slug: optionalSlugParam,
});

export const storageFileParamsSchema = z.object({
  id: idParam,
});
