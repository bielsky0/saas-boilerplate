import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";

import { calendarEvent, type Db } from "@repo/db";
import { idParam } from "@repo/validation";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { badRequest, notFound, validationFailed } from "../common/http";
import type { RequestSession } from "../auth/auth-engine";
import { getOrCreatePersonalAccount, requireOrgMember } from "../tenancy/access";

/**
 * Calendar events (etap 5, faza 5.3).
 *
 * Owner resolution mirrors notifications/storage: `org` selects the org branch
 * (active membership is enough for reads AND writes — shared productivity
 * surface, not a guarded resource), absent means the caller's personal
 * account. Update/delete take the SAME `org` hint as a query param, because a
 * bare id cannot name its tenant and scanning tenants is forbidden — a hint
 * pointing at the wrong tenant 404s instead of leaking. Every mutation
 * re-checks the resolved owner against the row.
 *
 * Times cross the wire as ISO strings and land in `timestamptz` — always UTC
 * instants. Display-zone conversion happens in the frontend (org `timezone`
 * or browser zone). Range filter is a stabbing query (`startsAt < to AND
 * endsAt >= from`) so multi-day events appear on every day they touch.
 */

const idParamsSchema = z.object({ id: idParam });

const isoDateTime = z.string().datetime({ offset: true });

const orgHintSchema = z.object({
  org: z.string().trim().min(1).max(48).optional(),
});

const eventBodySchema = z.object({
  org: z.string().trim().min(1).max(48).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  allDay: z.boolean().optional(),
  kind: z.string().trim().max(40).optional(),
  location: z.string().trim().max(200).optional(),
});

const rangeQuerySchema = z.object({
  org: z.string().trim().min(1).max(48).optional().catch(undefined),
  from: isoDateTime,
  to: isoDateTime,
});

export interface CalendarEventRow {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  kind: string;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type Owner =
  { organizationId: string; accountId: null } | { organizationId: null; accountId: string };

@Injectable()
export class CalendarService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private orgsEnabled(): boolean {
    return this.config.MULTI_TENANCY_MODE !== "disabled";
  }

  private async resolveOwner(session: RequestSession, slug: string | undefined): Promise<Owner> {
    if (slug) {
      const { org } = await requireOrgMember(this.db, session, slug, this.orgsEnabled());
      return { organizationId: org.id, accountId: null };
    }
    const account = await getOrCreatePersonalAccount(this.db, session.user.id);
    return { organizationId: null, accountId: account.id };
  }

  private ownerFilter(owner: Owner) {
    return owner.organizationId
      ? eq(calendarEvent.organizationId, owner.organizationId)
      : eq(calendarEvent.accountId, owner.accountId as string);
  }

  private assertRange(startsAt: Date, endsAt: Date): void {
    if (!(startsAt < endsAt)) badRequest("INVALID_RANGE");
  }

  async listEvents(
    session: RequestSession,
    query: unknown,
  ): Promise<{ items: CalendarEventRow[] }> {
    const parsed = rangeQuerySchema.safeParse(query);
    if (!parsed.success) validationFailed(parsed.error);
    const owner = await this.resolveOwner(session, parsed.data.org);
    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    this.assertRange(from, to);
    const rows = await this.db
      .select({
        id: calendarEvent.id,
        title: calendarEvent.title,
        description: calendarEvent.description,
        startsAt: calendarEvent.startsAt,
        endsAt: calendarEvent.endsAt,
        allDay: calendarEvent.allDay,
        kind: calendarEvent.kind,
        location: calendarEvent.location,
        createdAt: calendarEvent.createdAt,
        updatedAt: calendarEvent.updatedAt,
      })
      .from(calendarEvent)
      .where(
        and(
          this.ownerFilter(owner),
          lt(calendarEvent.startsAt, to),
          gte(calendarEvent.endsAt, from),
        ),
      )
      .orderBy(calendarEvent.startsAt);
    return { items: rows };
  }

  async createEvent(session: RequestSession, body: unknown): Promise<{ id: string }> {
    const parsed = eventBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);
    const owner = await this.resolveOwner(session, parsed.data.org);
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    this.assertRange(startsAt, endsAt);
    const [row] = await this.db
      .insert(calendarEvent)
      .values({
        organizationId: owner.organizationId,
        accountId: owner.accountId,
        createdByUserId: session.user.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        startsAt,
        endsAt,
        allDay: parsed.data.allDay ?? false,
        kind: parsed.data.kind ?? "etc",
        location: parsed.data.location ?? null,
      })
      .returning({ id: calendarEvent.id });
    if (!row) badRequest("INSERT_FAILED");
    return { id: row.id };
  }

  async updateEvent(
    session: RequestSession,
    params: unknown,
    query: unknown,
    body: unknown,
  ): Promise<{ ok: true }> {
    const idParsed = idParamsSchema.safeParse(params);
    if (!idParsed.success) validationFailed(idParsed.error);
    const hintParsed = orgHintSchema.safeParse(query ?? {});
    if (!hintParsed.success) validationFailed(hintParsed.error);
    const parsed = eventBodySchema.partial().safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);
    const owner = await this.resolveOwner(session, hintParsed.data.org ?? parsed.data.org);
    const [existing] = await this.db
      .select({
        id: calendarEvent.id,
        startsAt: calendarEvent.startsAt,
        endsAt: calendarEvent.endsAt,
      })
      .from(calendarEvent)
      .where(and(eq(calendarEvent.id, idParsed.data.id), this.ownerFilter(owner)))
      .limit(1);
    if (!existing) notFound("EVENT_NOT_FOUND");
    const startsAt =
      parsed.data.startsAt !== undefined ? new Date(parsed.data.startsAt) : existing.startsAt;
    const endsAt =
      parsed.data.endsAt !== undefined ? new Date(parsed.data.endsAt) : existing.endsAt;
    this.assertRange(startsAt, endsAt);
    await this.db
      .update(calendarEvent)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.allDay !== undefined ? { allDay: parsed.data.allDay } : {}),
        ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
        ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
        startsAt,
        endsAt,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvent.id, idParsed.data.id));
    return { ok: true };
  }

  async deleteEvent(
    session: RequestSession,
    params: unknown,
    query: unknown,
  ): Promise<{ ok: true }> {
    const idParsed = idParamsSchema.safeParse(params);
    if (!idParsed.success) validationFailed(idParsed.error);
    const hintParsed = orgHintSchema.safeParse(query ?? {});
    if (!hintParsed.success) validationFailed(hintParsed.error);
    const owner = await this.resolveOwner(session, hintParsed.data.org);
    const [existing] = await this.db
      .select({ id: calendarEvent.id })
      .from(calendarEvent)
      .where(and(eq(calendarEvent.id, idParsed.data.id), this.ownerFilter(owner)))
      .limit(1);
    if (!existing) notFound("EVENT_NOT_FOUND");
    await this.db.delete(calendarEvent).where(eq(calendarEvent.id, idParsed.data.id));
    return { ok: true };
  }
}
