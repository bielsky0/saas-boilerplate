import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { withSystemBypass } from "@/lib/db/system";
import { membership, personalAccount, subscription, user } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { toLocale } from "@/lib/i18n/user-locale";

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
  /** What language to write to them in (spec 16.1). Null = they never chose. */
  locale: Locale;
}

/** The recipient, or null if the account is gone (spec 11.3 soft delete). */
export async function getOnboardingUser(userId: string): Promise<OnboardingUser | null> {
  const [row] = await db
    // `locale` comes along in the query that was already fetching the recipient,
    // so knowing which language to write in costs nothing extra (spec 16.1).
    .select({ id: user.id, email: user.email, name: user.name, locale: user.locale })
    .from(user)
    .where(and(eq(user.id, userId), isNull(user.deletedAt)))
    .limit(1);
  return row ? { ...row, locale: toLocale(row.locale) } : null;
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
  // BYPASS (F1a): the question is "is this person paying ANYWHERE", so the input
  // is a user id and there is no single owner to scope by — the join fans out
  // over every org the user belongs to plus their personal account. `membership`
  // is under RLS, so without this the answer would always be "no", silently.
  const [row] = await withSystemBypass(
    "onboarding paid-subscription check — spans every org the user is in",
    (tx) =>
      tx
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
        .limit(1),
  );
  return Boolean(row);
}
