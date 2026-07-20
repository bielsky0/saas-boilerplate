import { credit } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";
import type { CreditSource } from "./schema";
import { endOfMonthValidity } from "./validity";

/**
 * Credit issuance (langlion §2.4) — the single writer of new `credit` rows.
 *
 * Six sources produce credits and they arrive across five phases: a manual grant
 * here in F4, cash and card payments in F6/F11, cancellations in F7, package and
 * subscription purchases in F12. Routing all of them through one function is what
 * keeps two properties from drifting apart phase by phase:
 *
 *   - `validUntil` is computed from the ACADEMY's zone (US-1.2/AC3), never the
 *     server's. A path that inlined `new Date()` arithmetic would issue credits
 *     that expire on the wrong day for every tenant outside UTC, silently.
 *   - the row is inserted with the CALLER's transaction handle, so issuance is
 *     atomic with whatever justified it — a cash confirmation, a webhook, a
 *     cancellation. A credit that exists without its cause, or a cause without
 *     its credit, is a ledger that cannot be reconciled.
 *
 * Deliberately NOT a server action and deliberately not permission-checked: this
 * is the mechanism. Authorisation belongs to the call site, which knows whether
 * it is an admin's decision (`credits.manual_grant`) or a webhook's consequence.
 */
export async function issueCredits(
  tx: TenantDb,
  input: {
    organizationId: string;
    clientId: string;
    creditTypeId: string;
    /** NULL = family wallet, spendable on any of this parent's children (§2.4). */
    athleteId?: string | null;
    quantity: number;
    source: CreditSource;
    /** IANA zone from `organization.timezone` — never the server's. */
    timeZone: string;
    /** Both set only for `manual_admin_grant` (US-7.3/AC1). */
    grantedByUserId?: string | null;
    reason?: string | null;
    /** Set for `cancellation` / `admin_session_cancellation` — the booking compensated for. */
    sourceBookingId?: string | null;
    /** Set for `subscription_purchase`; the FK arrives with F12. */
    creditPurchaseId?: string | null;
    /** Injectable for tests; the instant validity is measured from. */
    issuedAt?: Date;
  },
): Promise<{ id: string; validUntil: Date }[]> {
  const issuedAt = input.issuedAt ?? new Date();
  const validUntil = endOfMonthValidity(issuedAt, input.timeZone);

  /*
   * One row per credit, not a row with a quantity column, and this is a modelling
   * decision worth being explicit about. A credit is consumed individually, may
   * be reserved for a different child than its siblings, and can be refunded or
   * expire on its own — all of which a quantity counter would have to simulate
   * with arithmetic that no constraint could protect. Ten rows also make the
   * §2.4 audit trail literal: each unit says where it came from and where it went.
   */
  const values = Array.from({ length: input.quantity }, () => ({
    organizationId: input.organizationId,
    clientId: input.clientId,
    creditTypeId: input.creditTypeId,
    athleteId: input.athleteId ?? null,
    validUntil,
    status: "available" as const,
    source: input.source,
    grantedByUserId: input.grantedByUserId ?? null,
    reason: input.reason ?? null,
    sourceBookingId: input.sourceBookingId ?? null,
    creditPurchaseId: input.creditPurchaseId ?? null,
  }));

  return tx
    .insert(credit)
    .values(values)
    .returning({ id: credit.id, validUntil: credit.validUntil });
}
