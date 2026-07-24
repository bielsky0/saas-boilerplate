import { NextResponse, type NextRequest } from "next/server";

import { z } from "zod";

import { withOwner } from "@/lib/db/tenant";
import { requireOrgPermission } from "@/features/organizations/context";
import { isSupportedCountry, setOrgCountry } from "@/features/billing/connect-data";
import { invalidJson, validationFailed } from "@/lib/validation/http";

const countrySchema = z.object({
  country: z.string().min(2).max(2),
});

/**
 * Save the organization's country for Stripe Connect (POST).
 *
 * Called from the ConnectPanel component when the user picks a country
 * after being redirected with ?connect=country_required.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await requireOrgPermission("billing_connect.manage");

  const body: unknown = await request.json().catch(() => null);
  if (!body) return invalidJson();

  const parsed = countrySchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error, "Invalid country code");

  const country = parsed.data.country.toUpperCase();
  if (!isSupportedCountry(country)) {
    return NextResponse.json(
      { error: `Country ${country} is not supported by Stripe Connect` },
      { status: 422 },
    );
  }

  await withOwner(
    { kind: "organization", organizationId: ctx.org.id },
    (tx) => setOrgCountry(tx, ctx.org.id, country),
  );

  return NextResponse.json({ status: "ok" });
}
