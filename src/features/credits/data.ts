import { and, asc, count, eq, gt, isNull } from "drizzle-orm";

import { credit, creditType } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Credit data access (langlion §1.2, §2.4, EPIK 7).
 *
 * Same two conventions as every other langlion DAL: a `TenantDb` handle, and an
 * explicit `organizationId` filter that RLS backs up rather than replaces.
 *
 * The spend path is NOT here — it lives in `./consume.ts`, because it is a
 * transaction shape rather than a query and its callers must compose it with the
 * §5.2 capacity lock.
 */

/** Credit types an academy can still sell into (soft delete, EPIK 20). */
export async function listCreditTypes(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(creditType)
    .where(and(eq(creditType.organizationId, organizationId), isNull(creditType.deletedAt)))
    .orderBy(asc(creditType.name));
}

/** The credit type bound to a group type, or null. The 1:1 makes this total. */
export async function getCreditTypeForGroupType(
  tx: TenantDb,
  organizationId: string,
  groupTypeId: string,
) {
  const [row] = await tx
    .select()
    .from(creditType)
    .where(
      and(
        eq(creditType.organizationId, organizationId),
        eq(creditType.groupTypeId, groupTypeId),
        isNull(creditType.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A parent's spendable credits, earliest-expiring first.
 *
 * The same predicate `claimCredit` uses, deliberately: `status = 'available'` AND
 * not past its exclusive `validUntil`. If the wallet showed a credit the booking
 * path would refuse to spend, the parent would be looking at a number that lies
 * — which is worse than showing zero.
 *
 * Note this is what the expiry sweep makes true rather than what defines it: a
 * credit past `validUntil` is invisible here from the instant it lapses, whether
 * or not the nightly job has stamped `expired` on it yet (see `expire.ts`).
 */
export async function listAvailableCredits(
  tx: TenantDb,
  organizationId: string,
  clientId: string,
  now: Date = new Date(),
) {
  return tx
    .select()
    .from(credit)
    .where(
      and(
        eq(credit.organizationId, organizationId),
        eq(credit.clientId, clientId),
        eq(credit.status, "available"),
        gt(credit.validUntil, now),
      ),
    )
    .orderBy(asc(credit.validUntil));
}

/**
 * The wallet's headline number (US-7.6/AC1).
 *
 * Zero means the wallet section is not rendered at all — the wallet exists only
 * when there is something in it, so a parent who paid online for one class never
 * sees a balance widget that would always read zero (US-7.6/AC3).
 */
export async function availableCreditBalance(
  tx: TenantDb,
  organizationId: string,
  clientId: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(credit)
    .where(
      and(
        eq(credit.organizationId, organizationId),
        eq(credit.clientId, clientId),
        eq(credit.status, "available"),
        gt(credit.validUntil, now),
      ),
    );
  return row?.value ?? 0;
}

/** Every credit of a parent, any status — the audit view, not the wallet. */
export async function listCreditsForClient(tx: TenantDb, organizationId: string, clientId: string) {
  return tx
    .select()
    .from(credit)
    .where(and(eq(credit.organizationId, organizationId), eq(credit.clientId, clientId)))
    .orderBy(asc(credit.validUntil));
}
