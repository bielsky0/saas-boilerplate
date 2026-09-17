import { Body, Controller, Get, Inject, Patch, Put, Query, Param, UseGuards } from "@nestjs/common";
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
import { isNotificationType, isSuppressibleType } from "./types";

/**
 * Notifications endpoints (spec 23.2 / 23.3 / 23.4) — the read + mark-read
 * side of the bell, plus the channel preferences. The creation pipeline runs
 * as the `notification.create` job (see the service).
 *
 * Validation runs BEFORE owner resolution (§22.2: the trust boundary is
 * parsed first, authorization second). One deliberate difference from the web
 * server actions they replace: a malformed argument answers 422 instead of
 * succeeding silently — an action is fire-and-forget UI glue, an endpoint is
 * a contract other clients (mobile, scripts) program against.
 */
const slugQuerySchema = z.object({ slug: optionalSlugParam });
const markReadParamsSchema = z.object({ id: idParam });
const preferencesBodySchema = z.object({
  preferences: z.record(z.string(), z.boolean()),
});

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

  /**
   * Save the in-app channel preferences (spec 23.3) — the Nest twin of web's
   * `updateNotificationPreferencesAction`. One call, the whole map: for each
   * SUPPRESSIBLE type the value is the channel state (absent key = untouched
   * here, unlike the form's absent-checkbox-means-off — an endpoint is a
   * contract, so partial updates are explicit). Non-suppressible types are
   * never written: they cannot be muted, by construction.
   */
  /**
   * Read the stored preferences (spec 23.3) — deviations from the default-on.
   * Absent type = enabled. The settings page renders from this; the bell
   * never reads it (the handler is the authority at delivery time).
   */
  @Get("preferences")
  async listPreferences(@Session() session: RequestSession) {
    const rows = await this.notifications.listPreferences(session.user.id);
    return {
      preferences: Object.fromEntries(rows.map((r) => [r.type, r.inAppEnabled])),
    };
  }

  @Put("preferences")
  async updatePreferences(
    @Session() session: RequestSession,
    @Body() body: Record<string, unknown>,
  ) {
    const parsed = preferencesBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);
    for (const [type, enabled] of Object.entries(parsed.data.preferences)) {
      if (!isNotificationType(type) || !isSuppressibleType(type)) continue;
      await this.notifications.setPreference(session.user.id, type, enabled);
    }
    return { ok: true };
  }
}
