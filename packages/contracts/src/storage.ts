/**
 * Storage provider contract (spec 1.2, 21.1 — pluggable object storage).
 *
 * Feature/server code depends ONLY on this interface and its DTO types — never on
 * a provider SDK. The concrete implementation (`./s3.ts`) speaks S3-compatible, so
 * ONE adapter serves AWS S3, Cloudflare R2, Backblaze B2 and MinIO (spec 25); a
 * different backend plugs in by implementing `StorageAdapter` without touching
 * callers.
 *
 * The upload path is DIRECT-TO-BUCKET (spec 21.2): the app never proxies file
 * bytes. It mints a short-lived, tightly-scoped presigned POST that the client
 * uploads to. Reads of PRIVATE files are equally short-lived presigned GETs
 * (spec 21.3) — the bucket itself denies unsigned access.
 */

/**
 * A presigned POST (not PUT): the SigV4 policy carries `content-length-range` and
 * `Content-Type` conditions, so the BUCKET rejects an oversized or wrong-type body
 * even though the app already validated the client's declaration (spec 21.2,
 * defense in depth). The client sends `fields` + the file as multipart/form-data
 * to `url`.
 */
export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface CreateUploadInput {
  /** Object key within the bucket. Callers namespace it by tenant + visibility. */
  key: string;
  contentType: string;
  /** Hard upper bound baked into the policy's content-length-range. */
  maxBytes: number;
  /** Seconds the presigned POST stays valid. */
  expiresIn: number;
}

export interface CreateReadUrlInput {
  key: string;
  /** Seconds the presigned GET stays valid. */
  expiresIn: number;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date | null;
}

/**
 * Neutral error thrown by any adapter method so callers never branch on an SDK
 * error shape. `code: "NOT_CONFIGURED"` is what the `none` adapter throws for
 * every call, letting routes answer 404 when STORAGE_PROVIDER=none.
 */
export class StorageError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "PROVIDER_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export interface StorageAdapter {
  /** Presigned POST for a direct browser→bucket upload (spec 21.2). */
  createUpload(input: CreateUploadInput): Promise<PresignedUpload>;
  /** Presigned, time-limited GET for a private object (spec 21.3). */
  createReadUrl(input: CreateReadUrlInput): Promise<string>;
  /** Stable, unsigned URL for a public-visibility object (spec 21.3). */
  publicUrl(key: string): string;
  /** Delete one object. Idempotent: a missing key is not an error (spec 21.4). */
  delete(key: string): Promise<void>;
  /** List objects under a key prefix (spec 21.1 — listing per owner). */
  list(prefix: string): Promise<StorageObject[]>;
}
