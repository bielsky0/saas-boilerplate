import { getTranslations } from "next-intl/server";

import { ApiError } from "@repo/api-client";
import { BillingPanel, type PanelSubscription } from "@/features/billing/components/billing-panel";
import { requireOrgPermission } from "@/features/organizations/context";
import { api } from "@/lib/api";

/**
 * Organization billing (spec 5.3, 5.5).
 *
 * Guarded by `billing.manage`, which is Owner-only — an Admin hitting this route
 * directly gets a real 403 via the shared chokepoint, exactly like every other
 * org page (spec 4.2). This is also the URL the payment provider returns the
 * browser to after checkout or a portal session.
 *
 * The subscription itself is read from Nest (`GET /v1/billing/subscription`,
 * faza 2.5) — the page renders, it never touches the database.
 */
export default async function OrgBillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ org }, t] = await Promise.all([
    requireOrgPermission(slug, "billing.manage"),
    getTranslations("billing"),
  ]);

  let subscription: PanelSubscription | null = null;
  try {
    const data = await api().get<{ subscription: PanelSubscription | null }>(
      "/v1/billing/subscription",
      { query: { slug } },
    );
    subscription = data.subscription;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // Session died mid-render — the proxy guard redirects on the next
    // navigation; an empty panel beats a 500 here.
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{org.name}</p>
      </div>

      <BillingPanel subscription={subscription} slug={slug} />
    </div>
  );
}
