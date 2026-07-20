import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { getOrgBySlug } from "@/features/organizations/data";
import { classSession, groupType, groupTypeRecurrence } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { env } from "@/lib/env/server";

/**
 * Test-only schedule inspector (spec 14.1). Disabled in production.
 *
 * The counterpart to `/api/dev/billing-state` for the langlion schedule: it lets
 * a spec assert what season generation and in-season pattern edits ACTUALLY wrote,
 * rather than inferring it from a rendered page. Both matter, and they answer
 * different questions — the page proves an admin can see it, this proves the row
 * is right. A generated season is dozens of rows whose correctness is about
 * instants and flags, which no table view states precisely.
 *
 * GET /api/dev/langlion-state?orgSlug=acme[&recurrenceId=…][&groupTypeSlug=…]
 *
 * Reads through `withTenant`, like every other dev route since F1a: a fixture
 * that bypassed RLS would stop being evidence that the app's own path works.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const orgSlug = params.get("orgSlug");
  const recurrenceId = params.get("recurrenceId");
  const groupTypeSlug = params.get("groupTypeSlug");
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }

  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    return NextResponse.json({ error: `org ${orgSlug} not found` }, { status: 400 });
  }

  const state = await withTenant(org.id, async (tx) => {
    const groupTypes = await tx
      .select({
        id: groupType.id,
        slug: groupType.slug,
        name: groupType.name,
        description: groupType.description,
        price: groupType.price,
        engine: groupType.engine,
        defaultLocationId: groupType.defaultLocationId,
        allowedPurchaseModes: groupType.allowedPurchaseModes,
        allowedBillingTypes: groupType.allowedBillingTypes,
      })
      .from(groupType)
      .where(eq(groupType.organizationId, org.id))
      .orderBy(asc(groupType.name));

    const targetGroupType = groupTypeSlug
      ? (groupTypes.find((row) => row.slug === groupTypeSlug) ?? null)
      : null;

    const recurrences = await tx
      .select()
      .from(groupTypeRecurrence)
      .where(
        targetGroupType
          ? and(
              eq(groupTypeRecurrence.organizationId, org.id),
              eq(groupTypeRecurrence.groupTypeId, targetGroupType.id),
            )
          : eq(groupTypeRecurrence.organizationId, org.id),
      )
      .orderBy(asc(groupTypeRecurrence.createdAt));

    const sessionFilters = [eq(classSession.organizationId, org.id)];
    if (recurrenceId) {
      sessionFilters.push(eq(classSession.generatedFromRecurrenceId, recurrenceId));
    } else if (targetGroupType) {
      sessionFilters.push(eq(classSession.groupTypeId, targetGroupType.id));
    }

    const sessions = await tx
      .select({
        id: classSession.id,
        startTime: classSession.startTime,
        endTime: classSession.endTime,
        capacity: classSession.capacity,
        status: classSession.status,
        locationId: classSession.locationId,
        trainerId: classSession.trainerId,
        isManuallyAdjusted: classSession.isManuallyAdjusted,
        generatedFromRecurrenceId: classSession.generatedFromRecurrenceId,
      })
      .from(classSession)
      .where(and(...sessionFilters))
      .orderBy(asc(classSession.startTime));

    return { groupTypes, recurrences, sessions, timezone: org.timezone };
  });

  return NextResponse.json(state);
}
