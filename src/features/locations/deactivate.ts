import { and, eq, isNull } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { listFutureSessionsForLocation } from "@/features/schedule/data";
import { location } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Location deactivation (langlion §2.11, EPIK 20, decyzja #6).
 *
 * Locations are informational — they do not participate in the booking engine or
 * the credit system. Deactivation therefore only WARNS about future sessions at
 * this location rather than hard-blocking like trainer or group_type deactivation.
 * See `schedule/data.ts:listFutureSessionsForLocation` for the query.
 */

export class LocationNotFoundError extends Error {
  constructor() {
    super("Location not found");
    this.name = "LocationNotFoundError";
  }
}

export interface DeactivateLocationInput {
  organizationId: string;
  locationId: string;
  actor: AuditActor;
  now?: Date;
}

export interface DeactivateLocationResult {
  affectedSessions: number;
}

export async function deactivateLocation(
  tx: TenantDb,
  input: DeactivateLocationInput,
): Promise<DeactivateLocationResult> {
  const now = input.now ?? new Date();

  // 1. Verify the location exists and is not already deactivated.
  const [existing] = await tx
    .select({ id: location.id, name: location.name })
    .from(location)
    .where(
      and(
        eq(location.id, input.locationId),
        eq(location.organizationId, input.organizationId),
        isNull(location.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new LocationNotFoundError();

  // 2. Count future sessions at this location (for the warning toast — not a block).
  const futureSessions = await listFutureSessionsForLocation(tx, input.organizationId, input.locationId, now);

  // 3. Soft delete the location.
  await tx
    .update(location)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(location.id, input.locationId), eq(location.organizationId, input.organizationId)));

  // 4. Audit.
  await recordAudit(tx, {
    action: "location.deactivate",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "location",
    targetId: input.locationId,
    targetLabel: existing.name,
    metadata: {
      affectedSessions: futureSessions.length,
    },
  });

  return { affectedSessions: futureSessions.length };
}
