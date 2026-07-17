import type { StorageAdapter } from "./contract";
import { StorageError } from "./contract";

/**
 * Null storage adapter (spec 21.1) — the default when no object store is
 * configured, mirroring how `noneBillingAdapter` keeps the app buildable with
 * zero payment config.
 *
 * It exists so the adapter factory can run at module load without a provider: the
 * boilerplate must build and boot with zero storage configuration, and a default
 * that threw at CONSTRUCTION would break `next build` for everyone. So every
 * METHOD throws `NOT_CONFIGURED` instead — the upload/file routes catch it and
 * answer 404, exactly as BILLING_PROVIDER=none makes the webhook route 404,
 * rather than advertising an endpoint this deployment cannot honour.
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
