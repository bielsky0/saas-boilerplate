import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Fixtures for the credit engine (langlion §2.4, plan F4).
 *
 * F4 ships no UI — the wallet is F13 and the booking path is F5 — so these specs
 * drive the engine through `/api/dev/credits`. That route writes through
 * `withTenant` like the app does, so the tests still exercise the real RLS path
 * rather than a privileged shortcut.
 */

export type CreditRow = {
  id: string;
  status: "available" | "used" | "expired" | "refunded" | "pending_refund";
  source: string;
  athleteId: string | null;
  validUntil: string;
  usedInBookingId: string | null;
  reason: string | null;
  grantedByUserId: string | null;
};

export type CreditState = {
  credits: CreditRow[];
  bookings: { id: string; consumedCreditId: string | null }[];
  availableBalance: number;
};

async function post(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await request.post("/api/dev/credits", { data });
  if (res.status() >= 500) {
    throw new Error(`/api/dev/credits crashed (${res.status()}): ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function seedCreditType(
  request: APIRequestContext,
  input: { organizationId: string; groupTypeId: string; name?: string },
): Promise<string> {
  const body = await post(request, { action: "seed-type", ...input });
  expect(body.ok, `seed-type failed: ${JSON.stringify(body)}`).toBe(true);
  return body.creditTypeId as string;
}

/**
 * Issue credits.
 *
 * `validUntil` is the fixture-only escape hatch: passing it inserts the rows
 * directly rather than through `issueCredits`, which by design refuses to be told
 * when a credit expires. It is how a spec holds an ALREADY-LAPSED credit without
 * waiting a month for one.
 */
export async function issueCredits(
  request: APIRequestContext,
  input: {
    organizationId: string;
    clientId: string;
    creditTypeId: string;
    athleteId?: string | null;
    quantity?: number;
    source?: string;
    timeZone?: string;
    validUntil?: string;
  },
): Promise<{ creditIds: string[]; validUntil: string | null }> {
  const body = await post(request, { action: "issue", ...input });
  expect(body.ok, `issue failed: ${JSON.stringify(body)}`).toBe(true);
  return {
    creditIds: body.creditIds as string[],
    validUntil: (body.validUntil as string | null) ?? null,
  };
}

/**
 * Book a seat and spend a credit on it, in one transaction — the F5 shape minus
 * the capacity lock, which is F5's own responsibility.
 *
 * `holdMs` keeps that transaction open after the claim, which is what makes the
 * concurrency test (US-7.2) exercise a genuine overlap rather than pass because
 * two requests happened to serialise themselves.
 */
export function consumeCredit(
  request: APIRequestContext,
  input: {
    organizationId: string;
    clientId: string;
    creditTypeId: string;
    athleteId: string;
    sessionId: string;
    holdMs?: number;
  },
) {
  return request.post("/api/dev/credits", { data: { action: "consume", ...input } });
}

/** Run the real expiry job handler, not a reimplementation of it. */
export async function runExpirySweep(request: APIRequestContext): Promise<void> {
  const body = await post(request, { action: "expire" });
  expect(body.ok, `expire failed: ${JSON.stringify(body)}`).toBe(true);
}

export async function getCreditState(
  request: APIRequestContext,
  organizationId: string,
  clientId: string,
): Promise<CreditState> {
  const params = new URLSearchParams({ organizationId, clientId });
  const res = await request.get(`/api/dev/credits?${params.toString()}`);
  expect(res.ok(), `credit state failed: ${await res.text()}`).toBe(true);
  return (await res.json()) as CreditState;
}
