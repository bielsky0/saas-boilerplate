import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { membership, personalAccount, subscription, user } from "@/lib/db/schema";

/**
 * Onboarding data-access layer (spec 10.3).
 *
 * Scoped by the acting user rather than a tenant owner: a sequence belongs to a
 * person, not a workspace. Same shape as the rest of the repo's data layers —
 * plain functions, no ad-hoc queries in the handler.
 */

/** Statuses that mean "this user is paying". */
const PAID_STATUSES = ["active", "trialing"] as const;

export interface OnboardingUser {
  id: string;
  email: string;
  name: string | null;
}

/** The recipient, or null if the account is gone (spec 11.3 soft delete). */
export async function getOnboardingUser(userId: string): Promise<OnboardingUser | null> {
  const [row] = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(and(eq(user.id, userId), isNull(user.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * The §10.3 interrupt: "przerwanie sekwencji jeśli użytkownik zasubskrybował
 * plan płatny".
 *
 * Counts BOTH owner contexts (spec 5.2): a subscription on the user's personal
 * account, or on any organization they are an active member of. The org branch is
 * deliberately not restricted to Owners — the point of the interrupt is "this
 * person is already a paying customer, stop selling to them", and a member of a
 * paying team is exactly that, whoever holds the card.
 */
export async function hasPaidSubscription(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: subscription.id })
    .from(subscription)
    .leftJoin(personalAccount, eq(personalAccount.id, subscription.accountId))
    .leftJoin(
      membership,
      and(
        eq(membership.organizationId, subscription.organizationId),
        eq(membership.userId, userId),
        eq(membership.status, "active"),
      ),
    )
    .where(
      and(
        inArray(subscription.status, [...PAID_STATUSES]),
        or(eq(personalAccount.userId, userId), eq(membership.userId, userId)),
      ),
    )
    .limit(1);
  return Boolean(row);
}
