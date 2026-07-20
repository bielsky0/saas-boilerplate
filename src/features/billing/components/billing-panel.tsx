import { getFormatter, getTranslations } from "next-intl/server";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { withOwner } from "@/lib/db/tenant";
import { getActiveSubscriptionForOwner } from "../data";
import type { BillingOwner } from "../context";
import { DEFAULT_PLAN_ID, PLANS, PLAN_LIST, isPlanId } from "../plans";
import { isSubscriptionStatus } from "../status";
import { CheckoutButton, PortalButton } from "./billing-actions";

/**
 * The billing surface shared by the organization and personal settings pages
 * (spec 5.3, 5.5, 5.7).
 *
 * One component for both contexts because the only difference is which owner is
 * being billed — the same distinction `resolveBillingOwner` now draws from the host
 * rather than having two call paths.
 *
 * The current plan is read from the SUBSCRIPTION ROW, which only ever exists
 * because a webhook wrote it (spec 5.4). Nothing here asks the provider anything,
 * and nothing here infers a plan from a redirect the user just came back from.
 */
export async function BillingPanel({ owner }: { owner: BillingOwner }) {
  const [t, format, active] = await Promise.all([
    getTranslations("billing"),
    getFormatter(),
    withOwner(owner, (tx) => getActiveSubscriptionForOwner(tx, owner)),
  ]);

  // A subscription whose price id is not mapped in this environment has a null
  // planId; it still entitles nothing specific, so it reads as the default plan
  // rather than crashing or inventing a name (see `planIdForPriceId`).
  const currentPlanId = active?.planId && isPlanId(active.planId) ? active.planId : DEFAULT_PLAN_ID;
  const currentPlan = PLANS[currentPlanId];

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>{t("currentPlan")}</CardTitle>
            {/* An unrecognized status is shown as the raw provider string rather
                than throwing MISSING_MESSAGE and 500ing the page. */}
            {active ? (
              <Badge variant="outline">
                {isSubscriptionStatus(active.status) ? t(`status.${active.status}`) : active.status}
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {currentPlan.name}
            {active?.currentPeriodEnd
              ? ` · ${t(active.cancelAtPeriodEnd ? "endsOn" : "renewsOn", {
                  date: format.dateTime(active.currentPeriodEnd, { dateStyle: "medium" }),
                })}`
              : null}
          </p>
        </CardHeader>
        {active ? (
          <CardContent>
            {/* Plan changes and cancellation happen in the provider's portal and
                come back as webhooks — we never mutate subscriptions ourselves. */}
            <PortalButton />
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <Card key={plan.id} className={plan.featured ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {isCurrent ? <Badge className="normal-case">{t("current")}</Badge> : null}
                </div>
                <p className="text-2xl font-semibold">
                  {format.number(plan.amount / 100, {
                    style: "currency",
                    currency: plan.currency.toUpperCase(),
                    maximumFractionDigits: plan.amount % 100 === 0 ? 0 : 2,
                  })}
                </p>
              </CardHeader>
              <CardContent>
                {/* The free plan has no price id, so there is nothing to buy; the
                    current plan has nothing to buy again. */}
                {plan.priceId && !isCurrent ? (
                  <CheckoutButton
                    plan={plan.id}
                    label={t("choose", { plan: plan.name })}
                    variant={plan.featured ? "default" : "outline"}
                  />
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
