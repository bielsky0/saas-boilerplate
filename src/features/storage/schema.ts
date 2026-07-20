import { z } from "zod";

import { idParam } from "@/lib/validation";

/**
 * Storage input validation (spec 21.2 / 22.2 — validation as the entry point).
 *
 * These schemas are the SINGLE source of truth for what may be uploaded, shared
 * by the client (UX: block the picker early) and the presign route (the real
 * check: the client's declaration is untrusted). The bucket re-enforces the same
 * limits via the presigned-POST policy, so a client that lies to skip this still
 * cannot store an oversized or wrong-type object (defense in depth).
 */

/** 10 MiB — a sane default cap for the demo; adjust per product. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Allowed MIME types. Deliberately narrow (images + PDF): §21.2 wants an allowlist
 * per context, and "images + documents" covers avatars, logos and attachments —
 * the demo surface. Widen per feature, never to `*`.
 */
export const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export const VISIBILITIES = ["public", "private"] as const;

/**
 * THE TENANT IS NO LONGER A FIELD HERE (F4.6). It used to travel as `slug`, and
 * the note that stood here called it "the single most authority-bearing field in
 * the body" — which was the argument for validating it, and is now the argument
 * for removing it. `resolveStorageOwner` reads the academy from the request host
 * instead, so a caller can no longer name whose storage is written; an academy
 * host means that academy's files, the apex means the caller's own account.
 */
export const presignInputSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  // Declared size — validated here, then bound into the bucket policy so the
  // object PUT itself fails if the real body exceeds it.
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  visibility: z.enum(VISIBILITIES).default("private"),
});

export type PresignInput = z.infer<typeof presignInputSchema>;

export const confirmInputSchema = z.object({
  fileId: idParam,
});
