import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { withTenant } from "@/lib/db/tenant";
import {
  athlete,
  booking,
  classSession,
  client,
  groupType,
  groupTypeRecurrence,
  location,
} from "@/lib/db/schema";
import { env } from "@/lib/env/server";
import { sqlStateOf } from "../sql-error";

/**
 * Test-only langlion fixture seeder (spec 14.1 pattern). Disabled in production.
 *
 * Builds whichever slice of the domain a spec asks for, in one round trip, and
 * returns every id it created. The organization must already exist — seed it via
 * /api/dev/seed-org, which owns slug/subdomain uniqueness.
 *
 * DESIGNED FOR CONSTRUCTING COLLISIONS, not just happy paths. Times, trainer and
 * athlete are all explicit inputs, because the specs this feeds exist to prove
 * the database refuses things: two overlapping sessions for one trainer (§5.1),
 * two overlapping bookings for one athlete (§5.3), a duplicate generated session
 * (§4.4). A seeder that only produced valid fixtures could not set those up.
 *
 * Errors are returned with their SQLSTATE rather than thrown, for the same reason
 * as in rls-probe: a spec asserting "this is rejected with 23P01" needs to tell a
 * correct refusal from a broken endpoint.
 *
 * Writes go through `withTenant`, so this exercises the same RLS path the app
 * uses — a fixture that bypassed policy could mask a policy that rejects the
 * app's own writes.
 */
type Body = {
  organizationId: string;
  trainerId?: string;
  locationName?: string;
  /**
   * Reuse existing rows instead of creating them. This is what lets a spec REPLAY
   * a generation against the same pattern to prove idempotence (§4.4) — a seeder
   * that always created a fresh recurrence could never collide with itself.
   */
  groupTypeId?: string;
  recurrenceId?: string;
  /**
   * The offer. `paymentPolicy`/`allowedPurchaseModes` are inputs (F5) so a spec
   * can seed each cell of the payment matrix — the defaults reproduce the
   * pre-F5 behaviour (`both` / `single_class`).
   */
  groupType?: {
    slug: string;
    name?: string;
    price?: number;
    description?: string;
    paymentPolicy?: "online" | "on_site" | "both";
    allowedPurchaseModes?: ("single_class" | "package")[];
    allowedBillingTypes?: ("one_time" | "recurring")[];
    isNewClientOnly?: boolean;
  };
  /** Set the price on an EXISTING offer, to prove `price_snapshot` is frozen (US-4.6). */
  setGroupTypePrice?: { groupTypeId: string; price: number };
  recurrence?: {
    dayOfWeek: number;
    startTime: string;
    durationMinutes: number;
    capacity: number;
    isRecurring?: boolean;
    occurrencesCount?: number;
    startDate: string;
  };
  /** Explicit ISO instants — the point is to be able to make them overlap. */
  sessions?: { startsAt: string; endsAt: string; capacity?: number; status?: string }[];
  client?: { email: string; name?: string; isVerified?: boolean };
  athletes?: { name: string; age?: number }[];
  bookings?: { sessionIndex: number; athleteIndex: number; paymentStatus?: string }[];
};

type PaymentStatus = "payment_pending" | "booked_offline" | "confirmed" | "cancelled" | "no_show";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  if (!body.organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  try {
    const result = await withTenant(body.organizationId, async (tx) => {
      const orgId = body.organizationId;

      let locationId: string | null = null;
      if (body.locationName) {
        const [row] = await tx
          .insert(location)
          .values({ organizationId: orgId, name: body.locationName })
          .returning({ id: location.id });
        locationId = row!.id;
      }

      let groupTypeId: string | null = body.groupTypeId ?? null;
      if (body.groupType) {
        const [row] = await tx
          .insert(groupType)
          .values({
            organizationId: orgId,
            name: body.groupType.name ?? "E2E Group",
            slug: body.groupType.slug,
            description: body.groupType.description ?? null,
            engine: "schedule_first",
            paymentPolicy: body.groupType.paymentPolicy ?? "both",
            price: body.groupType.price ?? 10_000,
            allowedPurchaseModes: body.groupType.allowedPurchaseModes ?? ["single_class"],
            allowedBillingTypes: body.groupType.allowedBillingTypes ?? null,
            isNewClientOnly: body.groupType.isNewClientOnly ?? false,
            defaultLocationId: locationId,
          })
          .returning({ id: groupType.id });
        groupTypeId = row!.id;
      }

      if (body.setGroupTypePrice) {
        await tx
          .update(groupType)
          .set({ price: body.setGroupTypePrice.price })
          .where(
            and(
              eq(groupType.id, body.setGroupTypePrice.groupTypeId),
              eq(groupType.organizationId, orgId),
            ),
          );
      }

      let recurrenceId: string | null = body.recurrenceId ?? null;
      if (body.recurrence && groupTypeId) {
        const [row] = await tx
          .insert(groupTypeRecurrence)
          .values({
            organizationId: orgId,
            groupTypeId,
            dayOfWeek: body.recurrence.dayOfWeek,
            startTime: body.recurrence.startTime,
            durationMinutes: body.recurrence.durationMinutes,
            capacity: body.recurrence.capacity,
            trainerId: body.trainerId ?? null,
            locationId,
            isRecurring: body.recurrence.isRecurring ?? false,
            occurrencesCount: body.recurrence.occurrencesCount ?? null,
            startDate: body.recurrence.startDate,
          })
          .returning({ id: groupTypeRecurrence.id });
        recurrenceId = row!.id;
      }

      const sessionIds: string[] = [];
      for (const s of body.sessions ?? []) {
        if (!groupTypeId) break;
        const [row] = await tx
          .insert(classSession)
          .values({
            organizationId: orgId,
            groupTypeId,
            trainerId: body.trainerId ?? null,
            startTime: new Date(s.startsAt),
            endTime: new Date(s.endsAt),
            capacity: s.capacity ?? 10,
            locationId,
            status: (s.status as "scheduled" | "cancelled" | undefined) ?? "scheduled",
            generatedFromRecurrenceId: recurrenceId,
          })
          .returning({ id: classSession.id });
        sessionIds.push(row!.id);
      }

      let clientId: string | null = null;
      if (body.client) {
        const [row] = await tx
          .insert(client)
          .values({
            organizationId: orgId,
            email: body.client.email,
            name: body.client.name ?? null,
            isVerified: body.client.isVerified ?? false,
          })
          .returning({ id: client.id });
        clientId = row!.id;
      }

      const athleteIds: string[] = [];
      for (const a of body.athletes ?? []) {
        if (!clientId) break;
        const [row] = await tx
          .insert(athlete)
          .values({
            organizationId: orgId,
            parentClientId: clientId,
            name: a.name,
            age: a.age ?? null,
          })
          .returning({ id: athlete.id });
        athleteIds.push(row!.id);
      }

      const bookingIds: string[] = [];
      for (const b of body.bookings ?? []) {
        const sessionId = sessionIds[b.sessionIndex];
        const athleteId = athleteIds[b.athleteIndex];
        const target = (body.sessions ?? [])[b.sessionIndex];
        if (!sessionId || !athleteId || !target) continue;
        const [row] = await tx
          .insert(booking)
          .values({
            organizationId: orgId,
            sessionId,
            athleteId,
            paymentStatus: (b.paymentStatus as PaymentStatus | undefined) ?? "confirmed",
            priceSnapshot: { amount: 10_000, currency: "PLN" },
            // Copied from the session, exactly as the real booking path must —
            // after which ON UPDATE CASCADE keeps them in step (decyzja D4).
            sessionStartTime: new Date(target.startsAt),
            sessionEndTime: new Date(target.endsAt),
          })
          .returning({ id: booking.id });
        bookingIds.push(row!.id);
      }

      return {
        locationId,
        groupTypeId,
        recurrenceId,
        sessionIds,
        clientId,
        athleteIds,
        bookingIds,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const sqlState = sqlStateOf(error);
    return NextResponse.json({
      ok: false,
      sqlState,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
