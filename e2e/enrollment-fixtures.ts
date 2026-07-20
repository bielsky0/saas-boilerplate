import type { APIRequestContext } from "@playwright/test";

/**
 * Fixtures for public enrollment (langlion §2.3, §5.2, plan F5).
 *
 * Two ways in, on purpose:
 *   - the enrollment UI (`/zapisy/[slug]`), driven with a real browser `page` in
 *     the happy-path and short-path specs — that is what proves a parent can do it;
 *   - `/api/dev/bookings`, driven with an `APIRequestContext` in the concurrency
 *     and constraint specs. It calls the PRODUCTION `createBooking`, so what those
 *     specs exercise is the shipped §5.2 transaction; a Server Action cannot be
 *     invoked reliably from an `APIRequestContext`, and two browser tabs "clicking
 *     at once" give no control over the interleaving.
 *
 * `/api/dev/bookings` is apex-reachable (it is under `/api/dev/`, exempt in
 * proxy.ts) and takes `organizationId` in the body, so these post to the apex
 * origin like the other dev fixtures.
 */

export type CreateBookingResult =
  | { ok: true; bookingId: string; athleteId: string; paymentStatus: string }
  | { ok: false; reason?: string; sqlState?: string | null; constraint?: string | null };

async function post(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await request.post("/api/dev/bookings", { data });
  if (res.status() >= 500) {
    throw new Error(`/api/dev/bookings crashed (${res.status()}): ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Create a booking through the production writer.
 *
 * `holdMs` keeps the session row lock held after acquiring it (create.ts:onLocked)
 * — the widened race window the last-seat spec needs. Placed after the lock, the
 * opposite of the credits route's hold; see the dev route header.
 */
export async function devCreateBooking(
  request: APIRequestContext,
  params: {
    organizationId: string;
    sessionId: string;
    clientId: string;
    athleteId: string;
    paymentMethod?: "online" | "on_site";
    onlineAvailable?: boolean;
    holdMs?: number;
  },
): Promise<CreateBookingResult> {
  return (await post(request, { action: "create", ...params })) as CreateBookingResult;
}

/** How many active (seat-occupying) bookings a session has — the durable invariant. */
export async function activeBookings(
  request: APIRequestContext,
  organizationId: string,
  sessionId: string,
): Promise<number> {
  const body = await post(request, { action: "state", organizationId, sessionId });
  return (body.activeBookings as number) ?? 0;
}
