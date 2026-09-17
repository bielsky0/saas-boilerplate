import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, type SQL } from "drizzle-orm";

import { file } from "@repo/db";
import type { Db } from "@repo/db";
import type {
  FileListItem,
  PresignedUpload,
  ReadableFile,
  StorageAdapter,
  Visibility,
} from "@repo/contracts";
import type { PresignInput } from "@repo/validation";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import type { NotificationOwner } from "../tenancy/owner";
import { createS3StorageAdapter } from "./s3";
import { noneStorageAdapter } from "./none";

/**
 * Storage feature service (spec 21.2/21.3) — the Nest twin of the web app's
 * `features/storage/{presign,data}.ts`, ported in faza 2.4.
 *
 * Orchestrates the adapter + data layer so the controller stays thin: the
 * controller resolves the owner, this resolves everything else. Uploads are
 * direct-to-bucket: presign mints a presigned POST and records a `pending`
 * row; the client uploads, then calls confirm to flip it to `ready`.
 *
 * Every read/write here is scoped by the file's tenant owner, so isolation
 * is enforced in the data layer, not the client. Reads filter
 * `isNull(file.deletedAt)` so a soft-deleted file is invisible the instant
 * it is deleted (spec 21.4), long before the retention purge removes it.
 */

/** Presigned URLs are short-lived — five minutes is plenty for a round-trip. */
const UPLOAD_TTL_SECONDS = 300;
const READ_TTL_SECONDS = 300;

/** Strip anything path- or header-hostile from the display name. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128) || "file";
}

/**
 * Object key layout: `{visibility}/{ownerPrefix}/{token}/{name}`.
 *
 * The `public/` vs `private/` top segment is load-bearing — the bucket policy
 * grants anonymous reads ONLY under `public/`, so a private file's bare URL
 * is denied by the store itself (spec 21.3). The random token (not the row
 * id, which doesn't exist yet) keeps keys unguessable and collision-free.
 */
function buildKey(owner: NotificationOwner, visibility: Visibility, filename: string): string {
  const ownerPrefix =
    owner.kind === "organization" ? `org/${owner.organizationId}` : `acct/${owner.accountId}`;
  return `${visibility}/${ownerPrefix}/${randomUUID()}/${safeName(filename)}`;
}

/** The owner predicate — an org file matches by org id, a personal one by account id. */
function ownerWhere(owner: NotificationOwner): SQL {
  return owner.kind === "organization"
    ? eq(file.organizationId, owner.organizationId)
    : eq(file.accountId, owner.accountId);
}

/** Columns to persist on the owner, spread into an insert. */
function ownerColumns(owner: NotificationOwner): {
  organizationId?: string;
  accountId?: string;
} {
  return owner.kind === "organization"
    ? { organizationId: owner.organizationId }
    : { accountId: owner.accountId };
}

export type CreatedUpload = {
  fileId: string;
  key: string;
  upload: PresignedUpload;
};

@Injectable()
export class StorageService {
  private adapter: StorageAdapter | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private storage(): StorageAdapter {
    if (!this.adapter) {
      this.adapter =
        this.config.STORAGE_PROVIDER === "s3"
          ? createS3StorageAdapter({
              bucket: this.config.S3_BUCKET ?? "",
              region: this.config.S3_REGION,
              endpoint: this.config.S3_ENDPOINT,
              forcePathStyle: this.config.S3_FORCE_PATH_STYLE,
              accessKeyId: this.config.S3_ACCESS_KEY_ID ?? "",
              secretAccessKey: this.config.S3_SECRET_ACCESS_KEY ?? "",
              publicUrl: this.config.S3_PUBLIC_URL,
            })
          : noneStorageAdapter;
    }
    return this.adapter;
  }

  /**
   * Mint a presigned upload and record the pending file. The presign happens
   * BEFORE the row insert: a failed presign then leaves no orphan row, and a
   * failed insert only wastes an unused, self-expiring URL.
   */
  async createUpload(
    owner: NotificationOwner,
    uploadedByUserId: string,
    input: PresignInput,
  ): Promise<CreatedUpload> {
    const key = buildKey(owner, input.visibility, input.filename);
    // `input.size` already passed the schema cap (`STORAGE_MAX_UPLOAD_BYTES`);
    // binding it into the bucket policy is what makes the object PUT itself
    // fail if the real body exceeds the declaration.
    const upload = await this.storage().createUpload({
      key,
      contentType: input.contentType,
      maxBytes: input.size,
      expiresIn: UPLOAD_TTL_SECONDS,
    });
    const [row] = await this.db
      .insert(file)
      .values({
        ...ownerColumns(owner),
        uploadedByUserId,
        key,
        originalName: input.filename,
        contentType: input.contentType,
        size: input.size,
        visibility: input.visibility,
        status: "pending",
      })
      .returning({ id: file.id });
    if (!row) throw new Error("file insert returned no row");
    return { fileId: row.id, key, upload };
  }

  /** Confirm a completed upload. Returns false if the file isn't the owner's. */
  async confirmUpload(owner: NotificationOwner, fileId: string): Promise<boolean> {
    const rows = await this.db
      .update(file)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(file.id, fileId), ownerWhere(owner), isNull(file.deletedAt)))
      .returning({ id: file.id });
    return rows.length > 0;
  }

  /**
   * Resolve a readable URL for a file the caller owns, or null if it isn't
   * theirs (the 404 path). Public files get their stable URL; private files
   * get a short-lived presigned GET generated on demand (spec 21.3).
   */
  async getReadableFile(owner: NotificationOwner, fileId: string): Promise<ReadableFile | null> {
    const [row] = await this.db
      .select()
      .from(file)
      .where(and(eq(file.id, fileId), ownerWhere(owner), isNull(file.deletedAt)))
      .limit(1);
    if (!row) return null;
    const url =
      row.visibility === "public"
        ? this.storage().publicUrl(row.key)
        : await this.storage().createReadUrl({ key: row.key, expiresIn: READ_TTL_SECONDS });
    return {
      id: row.id,
      originalName: row.originalName,
      contentType: row.contentType,
      visibility: row.visibility,
      url,
    };
  }

  /** All non-deleted files for an owner (the `/files` page list). */
  async listFiles(owner: NotificationOwner): Promise<FileListItem[]> {
    const rows = await this.db
      .select({ id: file.id, originalName: file.originalName, visibility: file.visibility })
      .from(file)
      .where(and(ownerWhere(owner), isNull(file.deletedAt)))
      .orderBy(file.createdAt);
    return rows;
  }

  /** Soft-delete a file the caller owns (spec 21.4). False if not theirs. */
  async removeFile(owner: NotificationOwner, fileId: string): Promise<boolean> {
    const rows = await this.db
      .update(file)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(file.id, fileId), ownerWhere(owner), isNull(file.deletedAt)))
      .returning({ id: file.id });
    return rows.length > 0;
  }

  /**
   * Delete one object from the bucket — the retention purge's first stage
   * (object-first-then-row, spec 21.4). With STORAGE_PROVIDER=none this
   * throws NOT_CONFIGURED and the purge job dead-letters, exactly like the
   * web `none` adapter behaved before the port.
   */
  async deleteObject(key: string): Promise<void> {
    await this.storage().delete(key);
  }
}
