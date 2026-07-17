/**
 * Storage provider adapter (spec 1.2, 21.1 — pluggable object storage).
 *
 * Fourth reference adapter alongside `../auth`, `../billing` and `../email`.
 * Feature code imports the singleton `storage` and the contract types; it never
 * imports a provider SDK. The concrete provider is chosen at startup by
 * STORAGE_PROVIDER (none vs s3), exactly as `../billing` picks none vs Stripe.
 *
 * "none" is the default so the boilerplate builds and boots with zero storage
 * config; the S3 adapter (spec 21) speaks S3-compatible, so the same code drives
 * AWS S3, Cloudflare R2, Backblaze B2 and MinIO (spec 25).
 */

import { env } from "@/lib/env/server";
import type { StorageAdapter } from "./contract";
import { noneStorageAdapter } from "./none";
import { createS3StorageAdapter } from "./s3";

function createStorageAdapter(): StorageAdapter {
  switch (env.STORAGE_PROVIDER) {
    case "s3":
      return createS3StorageAdapter();
    case "none":
    default:
      return noneStorageAdapter;
  }
}

export const storage: StorageAdapter = createStorageAdapter();

export {
  StorageError,
  type CreateReadUrlInput,
  type CreateUploadInput,
  type PresignedUpload,
  type StorageAdapter,
  type StorageObject,
} from "./contract";
