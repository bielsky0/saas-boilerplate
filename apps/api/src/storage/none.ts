import { StorageError, type StorageAdapter } from "@repo/contracts";

/**
 * Null storage adapter (spec 21.1) — the Nest twin of web's
 * `src/lib/adapters/storage/none.ts`, ported in faza 2.4.
 *
 * The default when no object store is configured, mirroring how the billing
 * `none` adapter keeps the app buildable with zero payment config. It exists
 * so the adapter factory can run at module load without a provider: every
 * METHOD throws `NOT_CONFIGURED` instead — the storage routes catch it and
 * answer 404 rather than advertising an endpoint this deployment cannot
 * honour.
 */
function notConfigured(): never {
  throw new StorageError(
    "NOT_CONFIGURED",
    "STORAGE_PROVIDER=none: no object storage is configured. Set STORAGE_PROVIDER=s3 " +
      "and the S3_* variables to enable file storage (spec 21).",
  );
}

export const noneStorageAdapter: StorageAdapter = {
  createUpload: notConfigured,
  createReadUrl: notConfigured,
  publicUrl: notConfigured,
  delete: notConfigured,
  list: notConfigured,
};
