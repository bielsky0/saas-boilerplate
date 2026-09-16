import { randomUUID } from "node:crypto";

import { storage, type PresignedUpload } from "@/lib/adapters/storage";
import {
  createFileRecord,
  getFileForOwner,
  markFileReady,
  softDeleteFile,
  type FileOwner,
} from "./data";
import { MAX_UPLOAD_BYTES, type PresignInput } from "./schema";

/**
 * Storage feature service (spec 21.2/21.3). Orchestrates the adapter + data layer
 * so the routes stay thin: resolve the owner, validate input, call one of these.
 *
 * Uploads are direct-to-bucket: this mints a presigned POST and records a
 * `pending` row; the client uploads, then calls confirm to flip it to `ready`.
 */

/** Presigned URLs are short-lived — a minute is plenty for a browser round-trip. */
const UPLOAD_TTL_SECONDS = 300;
const READ_TTL_SECONDS = 300;

/** Strip anything path- or header-hostile from the display name before it hits a key. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128) || "file";
}

/**
 * Object key layout: `{visibility}/{ownerPrefix}/{token}/{name}`.
 *
 * The `public/` vs `private/` top segment is load-bearing — the bucket policy
 * grants anonymous reads ONLY under `public/`, so a private file's bare URL is
 * denied by the store itself (spec 21.3). The random token (not the row id, which
 * doesn't exist yet) keeps keys unguessable and collision-free.
 */
function buildKey(owner: FileOwner, visibility: "public" | "private", filename: string): string {
  const ownerPrefix =
    owner.kind === "organization" ? `org/${owner.organizationId}` : `acct/${owner.accountId}`;
  return `${visibility}/${ownerPrefix}/${randomUUID()}/${safeName(filename)}`;
}

export type CreatedUpload = {
  fileId: string;
  key: string;
  upload: PresignedUpload;
};

/**
 * Mint a presigned upload and record the pending file. The presign happens BEFORE
 * the row insert: a failed presign then leaves no orphan row, and a failed insert
 * only wastes an unused, self-expiring URL.
 */
export async function createUpload(
  owner: FileOwner,
  uploadedByUserId: string,
  input: PresignInput,
): Promise<CreatedUpload> {
  const key = buildKey(owner, input.visibility, input.filename);
  const upload = await storage.createUpload({
    key,
    contentType: input.contentType,
    maxBytes: Math.min(input.size, MAX_UPLOAD_BYTES),
    expiresIn: UPLOAD_TTL_SECONDS,
  });
  const fileId = await createFileRecord({
    owner,
    uploadedByUserId,
    key,
    originalName: input.filename,
    contentType: input.contentType,
    size: input.size,
    visibility: input.visibility,
  });
  return { fileId, key, upload };
}

/** Confirm a completed upload. Returns false if the file isn't the owner's. */
export async function confirmUpload(owner: FileOwner, fileId: string): Promise<boolean> {
  return markFileReady(owner, fileId);
}

export type ReadableFile = {
  id: string;
  originalName: string;
  contentType: string;
  visibility: "public" | "private";
  url: string;
};

/**
 * Resolve a readable URL for a file the caller owns, or null if it isn't theirs
 * (the 404 path). Public files get their stable URL; private files get a
 * short-lived presigned GET generated on demand (spec 21.3).
 */
export async function getReadableFile(
  owner: FileOwner,
  fileId: string,
): Promise<ReadableFile | null> {
  const row = await getFileForOwner(owner, fileId);
  if (!row) return null;
  const url =
    row.visibility === "public"
      ? storage.publicUrl(row.key)
      : await storage.createReadUrl({ key: row.key, expiresIn: READ_TTL_SECONDS });
  return {
    id: row.id,
    originalName: row.originalName,
    contentType: row.contentType,
    visibility: row.visibility,
    url,
  };
}

/** Soft-delete a file the caller owns (spec 21.4). Returns false if not theirs. */
export async function removeFile(owner: FileOwner, fileId: string): Promise<boolean> {
  return softDeleteFile(owner, fileId);
}
