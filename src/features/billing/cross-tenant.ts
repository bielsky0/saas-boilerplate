import { and, eq } from "drizzle-orm";

import { withSystemBypass } from "@/lib/db/system";
import { billingCustomer } from "@/lib/db/schema";

/**
 * The billing read that cannot be scoped to one owner (spec 5.4, F1b).
 *
 * `billing_customer` is under Row-Level Security since F1b, and every other query
 * against it names its owner first — those live in `./data.ts` and take a
 * `TenantDb`. This one cannot, for a reason that is structural rather than
 * inconvenient, so it sits here behind the documented bypass and this module is
 * the one added to the `no-restricted-imports` allow-list in `eslint.config.mjs`.
 *
 * WHY A SEPARATE FILE RATHER THAN AN EXEMPTION ON `webhooks.ts`. The plan for F1b
 * anticipated exempting the webhook module itself. That would put
 * `withSystemBypass` in scope in the same file as `applySubscriptionEvent` and
 * `applyPaymentEvent` — the two upserts whose `WITH CHECK` is the last line of
 * defence on the only externally-driven write path in the application. The fence
 * exists to keep the escape hatch away from exactly that code. This follows D20:
 * `features/organizations/cross-tenant.ts` was split off `./data.ts` on the same
 * reasoning, and a file is this repo's established unit of carve-out.
 *
 * One function, one justification. Do not add a second without one.
 */

/**
 * Resolve a provider customer id to its tenant owner. This is the ONE place a
 * webhook learns who an event belongs to (spec 5.4), and the documented
 * exception to "scope every query by owner" — like `getOrgBySlug` and
 * `getInvitationByTokenHash`, it is the lookup that PRODUCES the owner rather
 * than consuming it. There is no owner to scope by until it returns.
 *
 * BYPASS: the provider customer id arrives on an unauthenticated request from
 * outside; nothing in it names a tenant until this row maps it to one.
 */
export async function findBillingCustomer(provider: string, providerCustomerId: string) {
  return withSystemBypass(
    "billing webhook — owner unknown until the provider customer id resolves",
    async (tx) => {
      const [row] = await tx
        .select()
        .from(billingCustomer)
        .where(
          and(
            eq(billingCustomer.provider, provider),
            eq(billingCustomer.providerCustomerId, providerCustomerId),
          ),
        )
        .limit(1);
      return row ?? null;
    },
  );
}
