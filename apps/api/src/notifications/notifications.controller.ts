import { Controller, Get, Inject, Patch, Query, Param, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { idParam, optionalSlugParam } from "@repo/validation";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import type { Db } from "@repo/db";
import { validationFailed } from "../common/http";
import { Session, SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { resolveNotificationOwner } from "../tenancy/owner";
import { NotificationsService } from "./notifications.service";

/**
 * Notifications endpoints (spec 23.2 / 23.4) — the read + mark-read side of
 * the bell. The creation pipeline (jobs, preferences) moves in etap 2.
 *
 * Validation runs BEFORE owner resolution (§22.2: the trust boundary is
 * parsed first, authorization second). One deliberate difference from the web
 * server actions they replace: a malformed argument answers 422 instead of
 * succeeding silently — an action is fire-and-forget UI glue, an endpoint is
 * a contract other clients (mobile, scripts) program against.
 */
const slugQuerySchema = z.object({ slug: optionalSlugParam });
const markReadParamsSchema = z.object({ id: idParam });

@UseGuards(SessionGuard)
@Controller("v1/notifications")
export class NotificationsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly notifications: NotificationsService,
  ) {}

  private orgsEnabled(): boolean {
    return this.config.MULTI_TENANCY_MODE !== "disabled";
  }

  @Get()
  async list(@Session() session: RequestSession, @Query() query: Record<string, unknown>) {
    const parsed = slugQuerySchema.safeParse(query);
    if (!parsed.success) validationFailed(parsed.error);
    const { owner, userId } = await resolveNotificationOwner(
      this.db,
      session,
      parsed.data.slug ?? null,
      this.orgsEnabled(),
    );
    const [unreadCount, items] = await Promise.all([
      this.notifications.countUnread(userId, owner),
      this.notifications.listForUser(userId, owner),
    ]);
    return { unreadCount, items };
  }

  @Patch(":id/read")
  async markRead(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
  ) {
    const parsedParams = markReadParamsSchema.safeParse(params);
    if (!parsedParams.success) validationFailed(parsedParams.error);
    const parsedQuery = slugQuerySchema.safeParse(query);
    if (!parsedQuery.success) validationFailed(parsedQuery.error);
    const { owner, userId } = await resolveNotificationOwner(
      this.db,
      session,
      parsedQuery.data.slug ?? null,
      this.orgsEnabled(),
    );
    await this.notifications.markRead(userId, owner, parsedParams.data.id);
    return { ok: true };
  }

  @Patch("read-all")
  async markAllRead(@Session() session: RequestSession, @Query() query: Record<string, unknown>) {
    const parsed = slugQuerySchema.safeParse(query);
    if (!parsed.success) validationFailed(parsed.error);
    const { owner, userId } = await resolveNotificationOwner(
      this.db,
      session,
      parsed.data.slug ?? null,
      this.orgsEnabled(),
    );
    await this.notifications.markAllRead(userId, owner);
    return { ok: true };
  }
}
