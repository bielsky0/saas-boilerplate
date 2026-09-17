import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { StorageError } from "@repo/contracts";
import {
  confirmInputSchema,
  presignInputSchema,
  storageFileParamsSchema,
  storageListQuerySchema,
} from "@repo/validation";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import type { Db } from "@repo/db";
import { notFound, validationFailed } from "../common/http";
import { Session, SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { resolveStorageOwner } from "../tenancy/owner";
import { StorageService } from "./storage.service";

/**
 * Storage endpoints (spec 21.2 / 21.3 / 21.4) — the Nest twin of the web
 * app's `/api/storage/*` routes, ported in faza 2.4.
 *
 * Session-protected (no session → 401 before anything runs); the owner +
 * RBAC resolve per request, because the guard is a UX convenience, not the
 * security boundary. Validation runs BEFORE any storage/DB write: a
 * disallowed type or oversized declaration is a 422 with no row and no
 * object created.
 *
 * Both verbs on `/files/:id` go through the owner-scoped data layer, so a
 * file belonging to another tenant is indistinguishable from one that
 * doesn't exist — a 404, never a 403 that would leak its existence.
 * `NOT_CONFIGURED` (STORAGE_PROVIDER=none) answers 404, exactly as
 * BILLING_PROVIDER=none makes the webhook route 404 rather than
 * advertising an endpoint the deployment cannot honour.
 */
@UseGuards(SessionGuard)
@Controller("v1/storage")
export class StorageController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly storage: StorageService,
  ) {}

  private orgsEnabled(): boolean {
    return this.config.MULTI_TENANCY_MODE !== "disabled";
  }

  /**
   * Presigned upload (spec 21.2). The response is a presigned POST the
   * client uploads directly to the bucket — the app never proxies bytes.
   *
   * Body: { slug?, filename, contentType, size, visibility }.
   *   - `slug` present → organization context (requires `storage.upload`).
   *   - `slug` absent  → the caller's personal account.
   */
  @Post("presign")
  @HttpCode(201)
  async presign(@Session() session: RequestSession, @Body() body: unknown) {
    const parsed = presignInputSchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error, "Invalid upload");

    const { slug, ...input } = parsed.data;
    const { owner, userId } = await resolveStorageOwner(
      this.db,
      session,
      slug ?? null,
      "storage.upload",
      this.orgsEnabled(),
    );
    try {
      const result = await this.storage.createUpload(owner, userId, input);
      return { fileId: result.fileId, upload: result.upload };
    } catch (err) {
      this.rethrowStorageError(err);
    }
  }

  /**
   * Upload confirmation (spec 21.2). Flips the pending row created at
   * presign time to `ready` once the client reports the bucket upload
   * landed. Owner-scoped: confirming another tenant's file is a 404.
   *
   * Body: { slug?, fileId }.
   */
  @Post("confirm")
  @HttpCode(200)
  async confirm(@Session() session: RequestSession, @Body() body: unknown) {
    const parsed = confirmInputSchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    const { owner } = await resolveStorageOwner(
      this.db,
      session,
      parsed.data.slug ?? null,
      "storage.upload",
      this.orgsEnabled(),
    );
    const ok = await this.storage.confirmUpload(owner, parsed.data.fileId);
    if (!ok) notFound();
    return { ok: true };
  }

  /** All non-deleted files for the owner (the `/files` page list). */
  @Get("files")
  async list(@Session() session: RequestSession, @Query() query: Record<string, unknown>) {
    const parsed = storageListQuerySchema.safeParse(query);
    if (!parsed.success) validationFailed(parsed.error);
    const { owner } = await resolveStorageOwner(
      this.db,
      session,
      parsed.data.slug ?? null,
      null,
      this.orgsEnabled(),
    );
    return { items: await this.storage.listFiles(owner) };
  }

  /**
   * Read one file (spec 21.3). Returns a usable URL: the stable public URL
   * for public files, a short-lived presigned GET for private ones (the
   * bucket denies the bare object URL).
   */
  @Get("files/:id")
  async read(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
  ) {
    const parsedParams = storageFileParamsSchema.safeParse(params);
    if (!parsedParams.success) validationFailed(parsedParams.error);
    const parsedQuery = storageListQuerySchema.safeParse(query);
    if (!parsedQuery.success) validationFailed(parsedQuery.error);
    const { owner } = await resolveStorageOwner(
      this.db,
      session,
      parsedQuery.data.slug ?? null,
      null,
      this.orgsEnabled(),
    );
    try {
      const found = await this.storage.getReadableFile(owner, parsedParams.data.id);
      if (!found) notFound();
      return found;
    } catch (err) {
      this.rethrowStorageError(err);
    }
  }

  /** Soft-delete one file (spec 21.4). Needs `storage.delete` in org context. */
  @Delete("files/:id")
  async remove(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
  ) {
    const parsedParams = storageFileParamsSchema.safeParse(params);
    if (!parsedParams.success) validationFailed(parsedParams.error);
    const parsedQuery = storageListQuerySchema.safeParse(query);
    if (!parsedQuery.success) validationFailed(parsedQuery.error);
    const { owner } = await resolveStorageOwner(
      this.db,
      session,
      parsedQuery.data.slug ?? null,
      "storage.delete",
      this.orgsEnabled(),
    );
    const ok = await this.storage.removeFile(owner, parsedParams.data.id);
    if (!ok) notFound();
    return { ok: true };
  }

  /** Map adapter failures to statuses; anything else propagates untouched. */
  private rethrowStorageError(err: unknown): never {
    if (err instanceof StorageError) {
      if (err.code === "NOT_CONFIGURED") notFound();
      throw new HttpException({ error: "Storage unavailable" }, HttpStatus.BAD_GATEWAY);
    }
    throw err;
  }
}
