import { getTranslations } from "next-intl/server";

import { ApiError } from "@repo/api-client";
import { BillingPanel, type PanelSubscription } from "@/features/billing/components/billing-panel";
import { api } from "@/lib/api";

/**
 * Personal-account billing (spec 5.2 — a plan attaches to an organization OR a
 * personal account, B2B vs B2C).
 *
 * No owner resolution here: the subscription endpoint resolves the personal
 * account from the session itself (faza 2.5), so the page and the checkout
 * route agree on who is being billed by construction. You own your own
 * account, so there is no permission to check beyond a valid session (the
 * proxy redirects anonymous visitors to login).
 */
export default async function PersonalBillingPage() {
  const t = await getTranslations("billing");

  let subscription: PanelSubscription | null = null;
  try {
    const data = await api().get<{ subscription: PanelSubscription | null }>(
      "/v1/billing/subscription",
    );
    subscription = data.subscription;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("personalSubtitle")}</p>
      </div>

      <BillingPanel subscription={subscription} slug={null} />
    </div>
  );
}
