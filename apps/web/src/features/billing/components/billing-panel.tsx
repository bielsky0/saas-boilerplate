import { getFormatter, getTranslations } from "next-intl/server";

import { isSubscriptionStatus } from "@repo/billing";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { DEFAULT_PLAN_ID, PLANS, PLAN_LIST, isPlanId } from "../plans";
import { CheckoutButton, PortalButton } from "./billing-actions";

/**
 * The billing surface shared by the organization and personal settings pages
 * (spec 5.3, 5.5, 5.7).
 *
 * One component for both contexts because the only difference is which owner is
 * being billed. Presentational: the page resolves the active subscription from
 * Nest (`GET /v1/billing/subscription`, faza 2.5) and passes it in — this file
 * never touches the database, so the billing module stays DB-free in web.
 *
 * The current plan is read from the SUBSCRIPTION ROW, which only ever exists
 * because a webhook wrote it (spec 5.4). Nothing here asks the provider anything,
 * and nothing here infers a plan from a redirect the user just came back from.
 */

/** The shape `GET /v1/billing/subscription` answers with (null = no active plan). */
export interface PanelSubscription {
  planId: string | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export async function BillingPanel({
  subscription,
  slug,
}: {
  subscription: PanelSubscription | null;
  slug: string | null;
}) {
  const [t, format] = await Promise.all([getTranslations("billing"), getFormatter()]);
  const active = subscription;

  // A subscription whose price id is not mapped in this environment has a null
  // planId; it still entitles nothing specific, so it reads as the default plan
  // rather than crashing or inventing a name (see `planIdForPriceId`).
  const currentPlanId = active?.planId && isPlanId(active.planId) ? active.planId : DEFAULT_PLAN_ID;
  const currentPlan = PLANS[currentPlanId];
  const periodEnd = active?.currentPeriodEnd ? new Date(active.currentPeriodEnd) : null;

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
            {active && periodEnd
              ? ` · ${t(active.cancelAtPeriodEnd ? "endsOn" : "renewsOn", {
                  date: format.dateTime(periodEnd, { dateStyle: "medium" }),
                })}`
              : null}
          </p>
        </CardHeader>
        {active ? (
          <CardContent>
            {/* Plan changes and cancellation happen in the provider's portal and
                come back as webhooks — we never mutate subscriptions ourselves. */}
            <PortalButton slug={slug} />
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
                    slug={slug}
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
