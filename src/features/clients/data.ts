import { and, eq, isNull } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { athlete, client } from "@/lib/db/schema";

/**
 * Client (parent) and athlete (child) data access (langlion §1.2 rewizja 14.1, §2.8).
 *
 * Same two conventions as `features/locations/data.ts`: a `TenantDb` handle, and
 * an explicit `organizationId` filter that RLS backs up rather than replaces.
 *
 * The tenant filter carries extra weight in this module. A client is identified
 * by `(organizationId, email)`, so the same address is two unrelated people in
 * two academies. A lookup that dropped the tenant would not merely leak — it
 * would return the wrong person's children, and the OTP flow would then verify a
 * stranger into someone else's account.
 */

/**
 * Find a parent by email WITHIN one academy (§2.8, US-4.2/AC1).
 *
 * Returns unverified rows too: the registration upsert creates the row before
 * the OTP is confirmed, so both the "recognise and shorten the flow" path and the
 * "issue a code for the existing row" path need it. Only the caller may decide
 * that `isVerified` matters — recognition requires it, issuing a code does not.
 */
export async function getClientByEmail(tx: TenantDb, organizationId: string, email: string) {
  const [row] = await tx
    .select()
    .from(client)
    .where(
      and(
        eq(client.organizationId, organizationId),
        eq(client.email, email),
        isNull(client.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** One parent by id, or null. */
export async function getClient(tx: TenantDb, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(client)
    .where(
      and(eq(client.id, id), eq(client.organizationId, organizationId), isNull(client.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A parent's children — the set a "family wallet" credit is spendable on.
 *
 * A credit with a NULL `athleteId` may be used by any of these (§2.4, US-7.4),
 * which is why this list is the unit of authorization, not a single child.
 */
export async function listAthletes(tx: TenantDb, organizationId: string, parentClientId: string) {
  return tx
    .select()
    .from(athlete)
    .where(
      and(
        eq(athlete.organizationId, organizationId),
        eq(athlete.parentClientId, parentClientId),
        isNull(athlete.deletedAt),
      ),
    )
    .orderBy(athlete.name);
}
