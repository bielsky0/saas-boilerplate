import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { StorageError } from "@repo/contracts";
import type {
  CreateReadUrlInput,
  CreateUploadInput,
  PresignedUpload,
  StorageAdapter,
  StorageObject,
} from "@repo/contracts";

/**
 * S3-compatible storage adapter (spec 21.1 — the reference implementation) —
 * the Nest twin of web's `src/lib/adapters/storage/s3.ts`, ported in faza 2.4.
 *
 * The ONLY file that imports the AWS SDK. Everything else depends on the
 * contract, so swapping to a non-S3 backend is one file (spec 1.2). The same
 * adapter drives AWS S3, Cloudflare R2, Backblaze B2 and MinIO (spec 25).
 *
 * Options arrive as ARGUMENTS (from `ApiConfig`), never from ambient env:
 * this module is constructed inside Nest DI, and ambient reads would split
 * the signing identity by call site (same rule as `emails/suppression.ts`).
 *
 * DIRECT-TO-BUCKET UPLOADS (spec 21.2): `createUpload` returns a presigned
 * POST whose policy pins `content-length-range` and `Content-Type`, so an
 * oversized or wrong-type body is rejected BY THE BUCKET — the second line
 * of defense behind the app's own validation of the client's declaration.
 */
export interface S3Options {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
}

export function createS3StorageAdapter(options: S3Options): StorageAdapter {
  if (!options.bucket || !options.accessKeyId || !options.secretAccessKey) {
    throw new Error(
      "STORAGE_PROVIDER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY. " +
        "For local development, run `pnpm db:up` (starts MinIO) and set the S3_* block from .env.example.",
    );
  }

  const bucket = options.bucket;
  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: options.forcePathStyle,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  /** Base for stable public URLs: an explicit CDN/domain, else path-style. */
  function publicBase(): string {
    if (options.publicUrl) return options.publicUrl.replace(/\/$/, "");
    const endpoint = (options.endpoint ?? `https://s3.${options.region}.amazonaws.com`).replace(
      /\/$/,
      "",
    );
    // Path-style is what MinIO and every S3-compatible endpoint agree on.
    return `${endpoint}/${bucket}`;
  }

  async function wrap<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (cause) {
      throw new StorageError("PROVIDER_ERROR", `storage ${what} failed: ${String(cause)}`);
    }
  }

  return {
    async createUpload(input: CreateUploadInput): Promise<PresignedUpload> {
      return wrap("createUpload", async () => {
        const { url, fields } = await createPresignedPost(client, {
          Bucket: bucket,
          Key: input.key,
          Conditions: [
            ["content-length-range", 0, input.maxBytes],
            ["eq", "$Content-Type", input.contentType],
          ],
          Fields: { "Content-Type": input.contentType },
          Expires: input.expiresIn,
        });
        return { url, fields };
      });
    },

    async createReadUrl(input: CreateReadUrlInput): Promise<string> {
      return wrap("createReadUrl", () =>
        getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: input.key }), {
          expiresIn: input.expiresIn,
        }),
      );
    },

    publicUrl(key: string): string {
      return `${publicBase()}/${key}`;
    },

    async delete(key: string): Promise<void> {
      // S3 DeleteObject is already idempotent — deleting a missing key succeeds
      // (spec 21.4), which is exactly what the retention purge needs to be safe
      // to re-run.
      await wrap("delete", () =>
        client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
      );
    },

    async list(prefix: string): Promise<StorageObject[]> {
      return wrap("list", async () => {
        const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
        return (out.Contents ?? []).map((o) => ({
          key: o.Key ?? "",
          size: o.Size ?? 0,
          lastModified: o.LastModified ?? null,
        }));
      });
    },
  };
}
