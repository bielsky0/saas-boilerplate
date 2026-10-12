import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { connectionCounterpart, orderedPair, user, userConnection, type Db } from "@repo/db";
import { idParam } from "@repo/validation";
import { DB } from "../db/db.module";
import { notFound, validationFailed } from "../common/http";
import type { RequestSession } from "../auth/auth-engine";

/**
 * User connections (etap 5, faza 5.2 — profile "connections").
 *
 * Symmetric-by-construction: one row per unordered pair (ordered low/high +
 * unique constraint), mutual and immediate — no pending/request states (those
 * gate ACCESS in org invitations; connections gate nothing). Reads and
 * deletes are scoped to rows containing the caller, so nothing leaks across
 * users. Creating for an unknown email resolves neutrally (`{ ok: true }`
 * without a row) — same anti-enumeration rule as invitations (§3.3).
 */

const connectBodySchema = z.object({
  email: z.email().trim().toLowerCase(),
});

const idParamsSchema = z.object({ id: idParam });

export interface ConnectionRow {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

@Injectable()
export class ConnectionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listConnections(session: RequestSession): Promise<{ items: ConnectionRow[] }> {
    const userId = session.user.id;
    const rows = await this.db
      .select({
        id: userConnection.id,
        userLowId: userConnection.userLowId,
        userHighId: userConnection.userHighId,
        createdAt: userConnection.createdAt,
      })
      .from(userConnection)
      .where(or(eq(userConnection.userLowId, userId), eq(userConnection.userHighId, userId)));

    const otherIds = rows.map((row) => connectionCounterpart(row, userId));
    const others =
      otherIds.length > 0
        ? await this.db
            .select({ id: user.id, email: user.email, name: user.name })
            .from(user)
            .where(inArray(user.id, otherIds))
        : [];
    const byId = new Map(others.map((u) => [u.id, u]));
    return {
      items: rows.map((row) => {
        const otherId = connectionCounterpart(row, userId);
        const other = byId.get(otherId);
        if (!other) notFound("USER_NOT_FOUND");
        return {
          id: row.id,
          userId: otherId,
          email: other.email,
          name: other.name,
          createdAt: row.createdAt,
        };
      }),
    };
  }

  async connect(session: RequestSession, body: unknown): Promise<{ ok: true; connected: boolean }> {
    const parsed = connectBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    const [target] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, parsed.data.email))
      .limit(1);
    // Unknown email (or self): neutral success, no row, no signal — the
    // invitation flow's anti-enumeration rule, applied here.
    if (!target || target.id === session.user.id) return { ok: true, connected: false };

    const [low, high] = orderedPair(session.user.id, target.id);
    await this.db
      .insert(userConnection)
      .values({ userLowId: low, userHighId: high })
      .onConflictDoNothing();
    return { ok: true, connected: true };
  }

  async disconnect(session: RequestSession, params: unknown): Promise<{ ok: true }> {
    const parsed = idParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    const [row] = await this.db
      .select({ id: userConnection.id })
      .from(userConnection)
      .where(
        and(
          eq(userConnection.id, parsed.data.id),
          or(
            eq(userConnection.userLowId, session.user.id),
            eq(userConnection.userHighId, session.user.id),
          ),
        ),
      )
      .limit(1);
    if (!row) notFound("CONNECTION_NOT_FOUND");
    await this.db.delete(userConnection).where(eq(userConnection.id, parsed.data.id));
    return { ok: true };
  }
}
