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
 * Create a child under a parent (US-4.1), returning its id.
 *
 * Called INSIDE the booking transaction (F5 decision E), never before OTP. Two
 * reasons it lives there rather than at registration time: an unverified stranger
 * must not be able to attach children to someone else's email, and the spec
 * counts `DISTINCT athlete` toward the `max_students` plan limit (§2.20) — a
 * pre-verification insert would let an anonymous visitor burn an academy's quota.
 * Because it runs in the booking transaction, a rolled-back booking takes the
 * child with it, so there are no orphan rows and no need for an upsert key (a
 * parent may legitimately have two children with the same name).
 */
export async function insertAthlete(
  tx: TenantDb,
  organizationId: string,
  parentClientId: string,
  values: { name: string; age?: number },
): Promise<string> {
  const [row] = await tx
    .insert(athlete)
    .values({
      organizationId,
      parentClientId,
      name: values.name,
      age: values.age ?? null,
    })
    .returning({ id: athlete.id });
  if (!row) throw new Error("insertAthlete: insert returned no row");
  return row.id;
}

/**
 * One child by id, scoped to its parent — the ownership check a booking needs.
 *
 * RLS scopes the tenant but NOT the parent: two parents in one academy are both
 * visible under the same `organizationId`. So `parentClientId` here is the only
 * thing stopping a verified parent from booking another parent's child, and it is
 * not optional (F5, `create.ts`).
 */
export async function getOwnedAthlete(
  tx: TenantDb,
  organizationId: string,
  parentClientId: string,
  athleteId: string,
) {
  const [row] = await tx
    .select()
    .from(athlete)
    .where(
      and(
        eq(athlete.id, athleteId),
        eq(athlete.organizationId, organizationId),
        eq(athlete.parentClientId, parentClientId),
        isNull(athlete.deletedAt),
      ),
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

/**
 * Every parent of an academy — the picker a manual credit grant needs (US-7.3).
 *
 * Unverified rows included: the registration upsert creates a `client` before the
 * OTP is confirmed (US-4.1), and an academy that took cash at the desk from a
 * parent who never finished the email flow still has someone to grant credits to.
 * The list shows verification status rather than hiding those rows, because
 * "this person exists but has not confirmed their address" is information the
 * admin wants, not a reason to make them invisible.
 */
export async function listClients(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(client)
    .where(and(eq(client.organizationId, organizationId), isNull(client.deletedAt)))
    .orderBy(client.email);
}
