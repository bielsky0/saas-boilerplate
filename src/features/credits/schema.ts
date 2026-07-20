import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Credit validation (langlion §1.2, §2.4, EPIK 7).
 */

type ValidationTranslator = NamespaceTranslator<"credits.validation">;

/**
 * The credit lifecycle — the runtime form of the union declared on the column.
 *
 * `pending_refund` is the one that carries a rule rather than a meaning: a credit
 * held while a refund is in flight (§2.9). FIFO consumption filters on
 * `available` alone, so such credits fall out of the wallet automatically instead
 * of needing a second exclusion everywhere (US-18.2/AC5, F16).
 */
export const creditStatus = z.enum(["available", "used", "expired", "refunded", "pending_refund"]);

/**
 * How a credit came into existence (§2.4) — six paths, one row shape.
 *
 * `online_payment` and `on_site_payment` are created and consumed in the same
 * transaction and never sit in a wallet (US-7.6/AC3). They are still recorded,
 * because "how was this seat paid for" is a question the ledger must answer.
 */
export const creditSource = z.enum([
  "cancellation",
  "manual_admin_grant",
  "on_site_payment",
  "subscription_purchase",
  "admin_session_cancellation",
  "online_payment",
]);

/**
 * A manual grant by an admin (US-7.3).
 *
 * `reason` IS REQUIRED, and that is the entire point of this schema. A grant
 * creates settlement value out of nothing, so the ledger must record why —
 * US-7.3/AC1 makes rejecting an unexplained grant an acceptance criterion, not a
 * nicety. `min(1)` after `trim()` so a spacebar does not satisfy it.
 *
 * `athleteId` omitted means the family wallet (§2.4, US-7.4/AC1): spendable on
 * any of that parent's children. That is the more useful default for an academy
 * making a goodwill gesture to a family.
 */
export function grantCreditsSchema(t: ValidationTranslator) {
  return z.object({
    clientId: z.string().min(1),
    creditTypeId: z.string().min(1, t("creditTypeRequired")),
    athleteId: z.string().min(1).optional(),
    // Bounded above: a grant is a gesture, and a four-digit one is a typo that
    // would be tedious to unwind credit by credit.
    quantity: z.coerce.number().int().min(1, t("quantityMin")).max(100, t("quantityMax")),
    reason: z.string().trim().min(1, t("reasonRequired")).max(500),
  });
}

export type CreditStatus = z.infer<typeof creditStatus>;
export type CreditSource = z.infer<typeof creditSource>;
export type GrantCreditsValues = z.infer<ReturnType<typeof grantCreditsSchema>>;
