import { and, count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import {
  createBooking,
  ForeignAthleteError,
  PaymentMethodUnavailableError,
  SessionCancelledError,
  SessionFullError,
  SessionPastError,
  UnknownSessionError,
} from "@/features/bookings/create";
import { ACTIVE_BOOKING_FILTER } from "@/features/bookings/data";
import { getGroupType } from "@/features/groups/data";
import { getClient } from "@/features/clients/data";
import { getOrgById } from "@/features/organizations/data";
import { booking, classSession } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { env } from "@/lib/env/server";
import { constraintOf, sqlStateOf } from "../sql-error";

/**
 * Test-only booking fixture (F5). Disabled in production.
 *
 * Calls the PRODUCTION `createBooking` — the whole point, the same argument the
 * credits route's header makes: a fixture that reimplemented the §5.2 transaction
 * would stop being evidence that the shipped one is correct. It is how the
 * concurrency and constraint specs drive the seat-taking path from an
 * `APIRequestContext`, which cannot reliably invoke a Server Action.
 *
 * ⚠️ `holdMs` SLEEPS AFTER THE ROW LOCK, before the capacity count/insert — the
 * OPPOSITE placement from the credits route, where the sleep follows the claim.
 * That difference is deliberate: here the winner must HOLD the session lock while
 * the loser blocks on it, which is what makes the last-seat race real. Do not
 * "align" the two — see the note on `onLocked` in create.ts.
 */

type Body = {
  action: "create" | "state";
  organizationId?: string;
  sessionId?: string;
  clientId?: string;
  // create — participant is an existing athlete for fixtures
  athleteId?: string;
  paymentMethod?: "online" | "on_site";
  /** F5 default false (no Stripe). A spec can force true to exercise the online branch. */
  onlineAvailable?: boolean;
  /** Fixture-only: hold the session lock open after acquiring it, to widen the race. */
  holdMs?: number;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  const organizationId = body.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  if (body.action === "state") {
    const result = await withTenant(organizationId, async (tx) => {
      const [countRow] = await tx
        .select({ value: count() })
        .from(booking)
        .where(
          and(
            eq(booking.organizationId, organizationId),
            eq(booking.sessionId, body.sessionId!),
            ACTIVE_BOOKING_FILTER,
          ),
        );
      // The rows too, so a spec can assert the frozen price and status (US-4.6),
      // not just the count.
      const rows = await tx
        .select({
          id: booking.id,
          athleteId: booking.athleteId,
          paymentStatus: booking.paymentStatus,
          priceSnapshot: booking.priceSnapshot,
          attendanceStatus: booking.attendanceStatus,
          consumedCreditId: booking.consumedCreditId,
        })
        .from(booking)
        .where(
          and(eq(booking.organizationId, organizationId), eq(booking.sessionId, body.sessionId!)),
        );
      return { activeBookings: countRow?.value ?? 0, bookings: rows };
    });
    return NextResponse.json({ ok: true, ...result });
  }

  if (body.action === "create") {
    // The offer and currency `createBooking` needs are resolved from the session
    // and the org before the transaction opens — the org table is outside RLS.
    const org = await getOrgById(organizationId);
    if (!org) return NextResponse.json({ error: "unknown_organization" }, { status: 404 });

    try {
      const result = await withTenant(organizationId, async (tx) => {
        const [session] = await tx
          .select({ groupTypeId: classSession.groupTypeId })
          .from(classSession)
          .where(
            and(
              eq(classSession.id, body.sessionId!),
              eq(classSession.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!session) throw new Error(`session ${body.sessionId} not found`);

        const groupType = await getGroupType(tx, organizationId, session.groupTypeId);
        if (!groupType) throw new Error(`group type ${session.groupTypeId} not found`);

        const client = await getClient(tx, organizationId, body.clientId!);
        if (!client) throw new Error(`client ${body.clientId} not found`);

        return createBooking(tx, {
          organizationId,
          groupType: {
            id: groupType.id,
            price: groupType.price,
            paymentPolicy: groupType.paymentPolicy,
            allowedPurchaseModes: groupType.allowedPurchaseModes,
          },
          currency: org.currency,
          client: { id: client.id, email: client.email },
          sessionId: body.sessionId!,
          paymentMethod: body.paymentMethod ?? "on_site",
          participant: { kind: "existing", athleteId: body.athleteId! },
          onlineAvailable: body.onlineAvailable ?? false,
          onLocked: body.holdMs
            ? () => new Promise((resolve) => setTimeout(resolve, body.holdMs))
            : undefined,
        });
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      const reason = reasonFor(error);
      if (reason) return NextResponse.json({ ok: false, reason });
      // A real constraint refusal (athlete overlap §5.3) — return the state so a
      // spec can tell a correct refusal from a broken endpoint.
      const sqlState = sqlStateOf(error);
      if (sqlState) {
        return NextResponse.json({ ok: false, sqlState, constraint: constraintOf(error) });
      }
      throw error;
    }
  }

  return NextResponse.json({ error: `unknown action ${body.action}` }, { status: 400 });
}

/** The typed refusals `createBooking` throws, mapped to a stable wire string. */
function reasonFor(error: unknown): string | null {
  if (error instanceof SessionFullError) return "session_full";
  if (error instanceof UnknownSessionError) return "unknown_session";
  if (error instanceof SessionCancelledError) return "session_cancelled";
  if (error instanceof SessionPastError) return "session_past";
  if (error instanceof PaymentMethodUnavailableError) return "payment_method_unavailable";
  if (error instanceof ForeignAthleteError) return "foreign_athlete";
  return null;
}
