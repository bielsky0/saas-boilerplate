import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { consumeCreditForBooking } from "@/features/credits/consume";
import { creditsExpireHandler } from "@/features/credits/expire";
import { issueCredits } from "@/features/credits/issue";
import { availableCreditBalance } from "@/features/credits/data";
import type { CreditSource } from "@/features/credits/schema";
import { booking, classSession, credit, creditType } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { env } from "@/lib/env/server";
import { sqlStateOf } from "../sql-error";

/**
 * Test-only credit fixture + prober (spec 14.1 pattern). Disabled in production.
 *
 * The credit engine has no UI in F4 — the wallet is F13 and the booking path is
 * F5 — so this route is how a spec drives it. That makes it a fixture in the same
 * sense as `seed-langlion`: it must be able to CONSTRUCT the states the engine is
 * supposed to refuse, not just the happy ones.
 *
 * Two capabilities exist purely for that, and neither has a production analogue:
 *   - `validUntil` can be set explicitly, so a spec can hold an already-lapsed
 *     credit without waiting for a month to pass;
 *   - `consume` accepts a `holdMs`, which keeps the claiming transaction open
 *     after it has taken its row. That widens the race window so two parallel
 *     requests reliably exercise the concurrent path (US-7.2) instead of
 *     passing because they happened not to overlap.
 *
 * Everything writes through `withTenant`, like every dev route since F1a: a
 * fixture that bypassed RLS would stop being evidence that the app's own path
 * works. The one exception is `expire`, which calls the real job handler and so
 * takes the same narrow bypass production does.
 */

type Body = {
  action: "seed-type" | "issue" | "consume" | "expire";
  organizationId?: string;
  // seed-type
  groupTypeId?: string;
  name?: string;
  // issue
  clientId?: string;
  creditTypeId?: string;
  athleteId?: string | null;
  quantity?: number;
  source?: CreditSource;
  timeZone?: string;
  /** Fixture-only: bypasses end-of-month computation to construct a lapsed credit. */
  validUntil?: string;
  // consume
  sessionId?: string;
  /** Fixture-only: hold the transaction open after claiming, to widen the race. */
  holdMs?: number;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;

  try {
    if (body.action === "expire") {
      // The real handler, not a reimplementation: the point of asserting on it is
      // that the shipped sweep does what the spec says.
      await creditsExpireHandler(
        {},
        { id: "dev", name: "credits.expire", attempt: 1, maxAttempts: 1 },
      );
      return NextResponse.json({ ok: true });
    }

    const organizationId = body.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    if (body.action === "seed-type") {
      const [row] = await withTenant(organizationId, (tx) =>
        tx
          .insert(creditType)
          .values({
            organizationId,
            groupTypeId: body.groupTypeId!,
            name: body.name ?? "E2E Credit Type",
          })
          .returning({ id: creditType.id }),
      );
      return NextResponse.json({ ok: true, creditTypeId: row!.id });
    }

    if (body.action === "issue") {
      const issued = await withTenant(organizationId, async (tx) => {
        if (body.validUntil) {
          // Explicit instant — the lapsed-credit fixture. Inserted directly rather
          // than through `issueCredits`, which by design refuses to be told when a
          // credit expires.
          return tx
            .insert(credit)
            .values(
              Array.from({ length: body.quantity ?? 1 }, () => ({
                organizationId,
                clientId: body.clientId!,
                creditTypeId: body.creditTypeId!,
                athleteId: body.athleteId ?? null,
                validUntil: new Date(body.validUntil!),
                source: body.source ?? ("manual_admin_grant" as CreditSource),
              })),
            )
            .returning({ id: credit.id, validUntil: credit.validUntil });
        }
        return issueCredits(tx, {
          organizationId,
          clientId: body.clientId!,
          creditTypeId: body.creditTypeId!,
          athleteId: body.athleteId ?? null,
          quantity: body.quantity ?? 1,
          source: body.source ?? "manual_admin_grant",
          timeZone: body.timeZone ?? "Europe/Warsaw",
        });
      });
      return NextResponse.json({
        ok: true,
        creditIds: issued.map((row) => row.id),
        validUntil: issued[0]?.validUntil.toISOString() ?? null,
      });
    }

    if (body.action === "consume") {
      const result = await withTenant(organizationId, async (tx) => {
        // The seat-taking half of §5.2 (capacity lock) belongs to F5; this creates
        // the booking so the credit has something to be spent on, which is the
        // part F4 is responsible for.
        const [session] = await tx
          .select({
            id: classSession.id,
            startTime: classSession.startTime,
            endTime: classSession.endTime,
          })
          .from(classSession)
          .where(
            and(
              eq(classSession.id, body.sessionId!),
              eq(classSession.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!session) throw new Error(`session ${body.sessionId} not found`);

        const [created] = await tx
          .insert(booking)
          .values({
            organizationId,
            sessionId: session.id,
            athleteId: body.athleteId!,
            paymentStatus: "confirmed",
            priceSnapshot: { amount: 10_000, currency: "PLN" },
            sessionStartTime: session.startTime,
            sessionEndTime: session.endTime,
          })
          .returning({ id: booking.id });

        const creditId = await consumeCreditForBooking(tx, {
          organizationId,
          clientId: body.clientId!,
          creditTypeId: body.creditTypeId!,
          athleteId: body.athleteId!,
          bookingId: created!.id,
        });

        if (body.holdMs) {
          await new Promise((resolve) => setTimeout(resolve, body.holdMs));
        }

        return { bookingId: created!.id, creditId };
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: `unknown action ${body.action}` }, { status: 400 });
  } catch (error) {
    // SQLSTATE returned rather than thrown, as in rls-probe: a spec asserting "the
    // database refused this" must be able to tell a correct refusal from a broken
    // endpoint.
    return NextResponse.json({
      ok: false,
      sqlState: sqlStateOf(error),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** GET /api/dev/credits?organizationId=…&clientId=… — the ledger, as stored. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const organizationId = params.get("organizationId");
  const clientId = params.get("clientId");
  if (!organizationId || !clientId) {
    return NextResponse.json(
      { error: "organizationId and clientId are required" },
      { status: 400 },
    );
  }

  const state = await withTenant(organizationId, async (tx) => {
    const credits = await tx
      .select({
        id: credit.id,
        status: credit.status,
        source: credit.source,
        athleteId: credit.athleteId,
        validUntil: credit.validUntil,
        usedInBookingId: credit.usedInBookingId,
        reason: credit.reason,
        grantedByUserId: credit.grantedByUserId,
      })
      .from(credit)
      .where(and(eq(credit.organizationId, organizationId), eq(credit.clientId, clientId)))
      .orderBy(asc(credit.validUntil), asc(credit.id));

    const bookings = await tx
      .select({ id: booking.id, consumedCreditId: booking.consumedCreditId })
      .from(booking)
      .where(eq(booking.organizationId, organizationId));

    return {
      credits: credits.map((row) => ({ ...row, validUntil: row.validUntil.toISOString() })),
      bookings,
      availableBalance: await availableCreditBalance(tx, organizationId, clientId),
    };
  });

  return NextResponse.json(state);
}
