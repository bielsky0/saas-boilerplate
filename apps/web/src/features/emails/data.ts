import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailSuppression } from "@/lib/db/schema";
import type { SuppressibleCategory } from "./categories";

/**
 * Email suppression data-access layer (spec 10.3).
 *
 * `email_suppression` is keyed on the address and has no tenant owner (see its
 * schema header), so these helpers are not owner-scoped. Their boundary is the
 * HMAC-signed link that reaches them, not a session.
 */

/**
 * Is this address opted out of this category?
 *
 * `"all"` suppresses everything suppressible, so it is always checked alongside
 * the specific category — one query, both rows.
 *
 * Never asked about transactional mail: `SuppressibleCategory` excludes it, so
 * the question is unrepresentable rather than merely never asked.
 */
export async function isSuppressed(
  email: string,
  category: SuppressibleCategory,
): Promise<boolean> {
  const [row] = await db
    .select({ id: emailSuppression.id })
    .from(emailSuppression)
    .where(
      and(
        eq(emailSuppression.email, email.toLowerCase()),
        inArray(emailSuppression.category, [category, "all"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Record an opt-out. Idempotent: clicking unsubscribe twice, or a mail client
 * re-issuing the one-click POST, is not an error.
 */
export async function suppress(
  email: string,
  category: SuppressibleCategory,
  reason: "unsubscribe" | "bounce" | "complaint" | "admin" = "unsubscribe",
): Promise<void> {
  await db
    .insert(emailSuppression)
    .values({ email: email.toLowerCase(), category, reason })
    .onConflictDoNothing({
      target: [emailSuppression.email, emailSuppression.category],
    });
}
