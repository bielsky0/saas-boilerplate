import { getTranslations } from "next-intl/server";

import { BillingPanel } from "@/features/billing/components/billing-panel";
import { resolveBillingOwner } from "@/features/billing/context";

/**
 * Personal-account billing (spec 5.2 — a plan attaches to an organization OR a
 * personal account, B2B vs B2C).
 *
 * Reuses `resolveBillingOwner` with a null slug rather than resolving the account
 * inline, so the page and the checkout route agree on who is being billed by
 * construction. You own your own account, so there is no permission to check
 * beyond a valid session.
 */
export default async function PersonalBillingPage() {
  const [{ owner }, t] = await Promise.all([resolveBillingOwner(), getTranslations("billing")]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("personalSubtitle")}</p>
      </div>

      <BillingPanel owner={owner} />
    </div>
  );
}
