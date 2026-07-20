import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { buildMonthGrid, defaultMonth } from "@/features/bookings/calendar";
import { listSessionAvailability } from "@/features/bookings/data";
import { paymentOptionsFor } from "@/features/bookings/payment-options";
import { EnrollmentFlow } from "@/features/bookings/components/enrollment-flow";
import { resolveClientSession } from "@/features/client-auth/session";
import { listAthletes } from "@/features/clients/data";
import { getGroupTypeBySlug } from "@/features/groups/data";
import { requireServedOrganization } from "@/features/organizations/served-org";
import { withTenant } from "@/lib/db/tenant";
import { monthRangeInZone, shiftMonth } from "@/lib/datetime";

/**
 * Public enrollment for one offer (langlion EPIK 4, §2.27).
 *
 * ⚠️ `requireServedOrganization()` IS THE FIRST STATEMENT, before params, before
 * any query. On the apex the proxy forwards `/zapisy/*` here via an early return
 * that skips default-deny (see reserved-slugs.ts / proxy.ts): this call is the
 * ONLY thing that makes that safe, `notFound()`ing for the apex, a foreign host
 * or an unknown academy alike. Moving it down would serve one academy's form on
 * the platform domain. Pinned by e2e/langlion-subdomain-routing.spec.ts.
 */
export const dynamic = "force-dynamic";

/**
 * `noindex`, and NO canonical. `pageMetadata()` builds a canonical against the
 * APEX origin (`absoluteUrl`), which on a tenant host points at a URL that 404s
 * (§2.27) — so this page sets robots directly rather than borrowing that helper.
 * A per-tenant canonical belongs to the CMS module's own metadata, which resolves
 * a host; an enrollment funnel is not a search landing page anyway.
 */
export function generateMetadata() {
  return { robots: { index: false, follow: false } };
}

export default async function EnrollmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupTypeSlug: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const org = await requireServedOrganization();
  const { groupTypeSlug } = await params;
  const { m } = await searchParams;

  const t = await getTranslations("enrollment");

  const groupType = await withTenant(org.id, (tx) => getGroupTypeBySlug(tx, org.id, groupTypeSlug));
  if (!groupType) notFound();

  const principal = await resolveClientSession(org.id);
  const recognized = principal?.isVerified ? principal : null;

  // F5: Stripe Connect is F10, online checkout F11 — no organisation can take a
  // card yet, so online is never actually available. F10/F11 swaps this literal.
  const paymentView = paymentOptionsFor(
    {
      paymentPolicy: groupType.paymentPolicy,
      allowedPurchaseModes: groupType.allowedPurchaseModes,
    },
    { onlineAvailable: false },
  );

  // The month the calendar shows. Package-only / none-available offers render no
  // calendar (see the flow), so the query only runs when there is something to book.
  const { availability, month, athletes } = await withTenant(org.id, async (tx) => {
    if (paymentView.kind !== "options") {
      return { availability: [], month: m ?? "", athletes: [] };
    }
    const now = new Date();
    // One cheap query to decide the opening month, then the month itself. Both
    // ranges are computed in the academy's zone (a month boundary is a wall-clock
    // fact, not a UTC one).
    const upcoming = await listSessionAvailability(tx, org.id, {
      groupTypeId: groupType.id,
      from: now,
      to: monthRangeInZone(shiftMonth(defaultMonthSeed(now, org.timezone), 12), org.timezone).to,
      now,
    });
    const chosenMonth = m ?? defaultMonth(upcoming, org.timezone, now);
    const range = monthRangeInZone(chosenMonth, org.timezone);
    const monthRows = await listSessionAvailability(tx, org.id, {
      groupTypeId: groupType.id,
      from: range.from,
      to: range.to,
      now,
    });
    return {
      availability: monthRows,
      month: chosenMonth,
      athletes: recognized ? await listAthletes(tx, org.id, recognized.clientId) : [],
    };
  });

  const grid =
    paymentView.kind === "options" ? buildMonthGrid(month, availability, org.timezone) : [];

  return (
    <main>
      <h1 className="text-2xl font-semibold">{t("title", { name: groupType.name })}</h1>
      {groupType.description ? (
        <div className="text-muted-foreground mt-2 whitespace-pre-line">
          {groupType.description}
        </div>
      ) : null}

      <EnrollmentFlow
        groupTypeSlug={groupTypeSlug}
        groupTypeName={groupType.name}
        price={groupType.price}
        currency={org.currency}
        isNewClientOnly={groupType.isNewClientOnly}
        paymentView={paymentView}
        month={month}
        prevMonth={shiftMonth(month || todayMonth(org.timezone), -1)}
        nextMonth={shiftMonth(month || todayMonth(org.timezone), 1)}
        grid={grid}
        recognized={
          recognized
            ? {
                email: recognized.email,
                name: recognized.name,
                athletes: athletes.map((a) => ({ id: a.id, name: a.name })),
              }
            : null
        }
      />
    </main>
  );
}

/** The current `YYYY-MM` in the academy's zone — the seed for the upcoming-window probe. */
function defaultMonthSeed(now: Date, timeZone: string): string {
  return todayMonthWith(now, timeZone);
}

function todayMonth(timeZone: string): string {
  return todayMonthWith(new Date(), timeZone);
}

function todayMonthWith(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}
