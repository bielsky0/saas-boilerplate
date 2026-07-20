import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { client, clientOtp, clientSession } from "@/lib/db/schema";
import { OTP_MAX_ATTEMPTS } from "./config";

/**
 * Data access for parent authentication (langlion §2.19 rewizja 14.1, plan F3).
 *
 * Same two conventions as every langlion DAL: a `TenantDb` handle, so a caller
 * without tenant context is a compile error rather than an empty result, and an
 * explicit `organizationId` predicate that RLS backs up rather than replaces.
 *
 * ─── WHY SO MANY OF THESE ARE ONE STATEMENT ─────────────────────────────────
 *
 * Three functions here (`consumeOtp`, `registerFailedAttempt`, `touchSession`)
 * are deliberately single UPDATEs with their conditions in the WHERE clause,
 * never a read followed by a write. A credential check that reads state, decides
 * in TypeScript, and then writes is a TOCTOU window: two requests carrying the
 * same code both observe `consumedAt IS NULL` before either commits, and both
 * proceed. Being inside a transaction does not close that window — READ COMMITTED
 * lets both snapshots see the un-consumed row.
 *
 * This is the same reasoning as `FOR UPDATE SKIP LOCKED` on credit consumption
 * (F4) and `FOR UPDATE` on session capacity (§5.2), and the same principle as
 * Zasada nadrzędna #3: the guarantee lives in the database, not in the order the
 * application happens to do things.
 */

// ─── Client identity ────────────────────────────────────────────────────────

/**
 * Find-or-create the parent for `(organizationId, email)` — the US-4.1 upsert.
 *
 * PRODUCTION BEHAVIOUR, NOT A TEST SEAM: the spec has the registration form
 * create the client BEFORE the code is verified, which is why `isVerified`
 * defaults to false and why recognition (US-4.2/AC1) requires `true` rather than
 * mere existence. Issuing a code for an address nobody has used yet therefore
 * creates a row, by design.
 *
 * `DO UPDATE` rather than `DO NOTHING` only so that RETURNING yields the row on
 * the conflict path too — `DO NOTHING` returns nothing, which would force a
 * second round trip. Touching `updatedAt` is the cheapest write that keeps the
 * statement a genuine upsert.
 *
 * Safe under RLS despite the F1b finding that `DO UPDATE` raises 42501 on a row
 * invisible to USING: the conflicting row is by construction in this tenant, both
 * because `organizationId` is part of the unique key and because the caller is
 * already inside `withTenant` for that same organization.
 */
export async function upsertClient(
  tx: TenantDb,
  organizationId: string,
  email: string,
  fields?: { name?: string | null; phone?: string | null },
) {
  const [row] = await tx
    .insert(client)
    .values({
      organizationId,
      email,
      name: fields?.name ?? null,
      phone: fields?.phone ?? null,
    })
    .onConflictDoUpdate({
      target: [client.organizationId, client.email],
      set: { updatedAt: new Date() },
    })
    .returning();
  return row!;
}

/** Flip `isVerified` after a code is redeemed (US-4.5/AC1). Idempotent. */
export async function markClientVerified(tx: TenantDb, organizationId: string, clientId: string) {
  await tx
    .update(client)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(and(eq(client.id, clientId), eq(client.organizationId, organizationId)));
}

// ─── One-time codes ─────────────────────────────────────────────────────────

/**
 * Invalidate every live code for this address before issuing a new one.
 *
 * Without this, "resend the code" would leave both codes working, and the size of
 * the guessable set would grow with every resend — the opposite of what a resend
 * should cost an attacker. Writing `consumedAt` is how a superseded code and a
 * redeemed one become the same state; see the schema header for why that
 * conflation is intended.
 */
export async function supersedeLiveOtps(tx: TenantDb, organizationId: string, email: string) {
  await tx
    .update(clientOtp)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(clientOtp.organizationId, organizationId),
        eq(clientOtp.email, email),
        isNull(clientOtp.consumedAt),
      ),
    );
}

export async function insertOtp(
  tx: TenantDb,
  values: {
    organizationId: string;
    clientId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
  },
) {
  const [row] = await tx.insert(clientOtp).values(values).returning({ id: clientOtp.id });
  return row!;
}

/**
 * Redeem a code — ATOMICALLY (decyzja D38).
 *
 * ⚠️ DO NOT REFACTOR THIS INTO A SELECT AND AN UPDATE. Every condition that makes
 * a code redeemable — right tenant, right address, right hash, not already used,
 * not expired — is in the WHERE clause, so Postgres evaluates them and marks the
 * row consumed in one indivisible step. Exactly one of two concurrent requests
 * carrying the same code can match an un-consumed row; the loser gets no row back
 * and must be refused BEFORE any session is created.
 *
 * A null return therefore means "wrong, expired, superseded, or already
 * redeemed", and the caller must not try to distinguish those in its response:
 * telling a guesser which of those it was is telling them whether the code
 * existed.
 */
export async function consumeOtp(
  tx: TenantDb,
  organizationId: string,
  email: string,
  codeHash: string,
) {
  const [row] = await tx
    .update(clientOtp)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(clientOtp.organizationId, organizationId),
        eq(clientOtp.email, email),
        eq(clientOtp.codeHash, codeHash),
        isNull(clientOtp.consumedAt),
        gt(clientOtp.expiresAt, new Date()),
      ),
    )
    .returning({ id: clientOtp.id, clientId: clientOtp.clientId });
  return row ?? null;
}

/**
 * Count a wrong guess against this address's live codes, burning them at the cap.
 *
 * One statement again, and for a sharper reason than elsewhere: this runs on the
 * FAILURE path, which is the path an attacker controls the rate of. A read-then-
 * write here could be raced into never reaching the cap at all, which would leave
 * `OTP_MAX_ATTEMPTS` decorative. The CASE burns the code in the same UPDATE that
 * increments, so the guess that hits the limit is also the one that ends it.
 */
export async function registerFailedAttempt(
  tx: TenantDb,
  organizationId: string,
  email: string,
): Promise<void> {
  await tx
    .update(clientOtp)
    .set({
      attempts: sql`${clientOtp.attempts} + 1`,
      consumedAt: sql`case when ${clientOtp.attempts} + 1 >= ${OTP_MAX_ATTEMPTS} then now() else ${clientOtp.consumedAt} end`,
    })
    .where(
      and(
        eq(clientOtp.organizationId, organizationId),
        eq(clientOtp.email, email),
        isNull(clientOtp.consumedAt),
        gt(clientOtp.expiresAt, new Date()),
      ),
    );
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function insertClientSession(
  tx: TenantDb,
  values: {
    organizationId: string;
    clientId: string;
    tokenHash: string;
    expiresAt: Date;
  },
) {
  const [row] = await tx.insert(clientSession).values(values).returning({ id: clientSession.id });
  return row!;
}

/**
 * Resolve a cookie token to a live session and its parent, WITHIN one academy.
 *
 * The `organizationId` predicate is what makes a cookie from Academy A find
 * nothing at Academy B — the isolation §2.19 asks for, holding today on a shared
 * host, before the subdomain middleware (F5) can scope the cookie itself.
 *
 * Expiry is a predicate here rather than a check on the result, so an expired
 * session is indistinguishable from a missing one at every call site. A caller
 * that received the row and had to remember to compare the clock would eventually
 * be a caller that forgot.
 */
export async function findLiveSessionByTokenHash(
  tx: TenantDb,
  organizationId: string,
  tokenHash: string,
) {
  const [row] = await tx
    .select({
      sessionId: clientSession.id,
      clientId: clientSession.clientId,
      expiresAt: clientSession.expiresAt,
      lastUsedAt: clientSession.lastUsedAt,
      email: client.email,
      name: client.name,
      isVerified: client.isVerified,
    })
    .from(clientSession)
    .innerJoin(
      client,
      and(eq(client.id, clientSession.clientId), eq(client.organizationId, organizationId)),
    )
    .where(
      and(
        eq(clientSession.organizationId, organizationId),
        eq(clientSession.tokenHash, tokenHash),
        gt(clientSession.expiresAt, new Date()),
        isNull(client.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Slide the expiry window forward. Called only past the refresh threshold. */
export async function touchSession(
  tx: TenantDb,
  organizationId: string,
  sessionId: string,
  expiresAt: Date,
) {
  await tx
    .update(clientSession)
    .set({ expiresAt, lastUsedAt: new Date() })
    .where(and(eq(clientSession.id, sessionId), eq(clientSession.organizationId, organizationId)));
}

/**
 * Log out — the row is DELETED, not flagged.
 *
 * A revoked-but-present row would need every reader to remember to exclude it,
 * and the failure mode of forgetting is an accepted credential. Deletion has no
 * such mode. Nothing of audit value is lost: the session carried no history of
 * its own, and `features/admin/audit.ts` is where events belong.
 */
export async function deleteSessionByTokenHash(
  tx: TenantDb,
  organizationId: string,
  tokenHash: string,
): Promise<void> {
  await tx
    .delete(clientSession)
    .where(
      and(eq(clientSession.organizationId, organizationId), eq(clientSession.tokenHash, tokenHash)),
    );
}
