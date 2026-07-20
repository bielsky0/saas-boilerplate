import { expect, test } from "@playwright/test";

import { activeBookings, devCreateBooking } from "./enrollment-fixtures";
import { readOtpCode } from "./client-auth-fixtures";
import {
  registerViaApi,
  seedLanglion,
  seedOrgFull,
  uniqueEmail,
  uniqueNearFutureSlot,
} from "./helpers";
import { uniqueId } from "./billing-fixtures";
import { tenantUrl, uniqueSubdomain } from "./host-fixtures";

const WARSAW = "Europe/Warsaw";

/** `YYYY-MM-DD` for an instant in the academy's zone — the calendar day to click. */
function dayKeyIn(tz: string, iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/**
 * Public enrollment — the §5.2 seat-taking path (langlion EPIK 4/6/14/15, plan F5).
 *
 * This file's HARD claims — the last-seat race, the athlete-overlap constraint,
 * `payment_pending` occupying a seat — are driven through `/api/dev/bookings`,
 * which calls the production `createBooking`. They do NOT go through the browser:
 * a Server Action cannot be invoked reliably from an `APIRequestContext`, and two
 * tabs clicking at once give no control over the interleaving. The UI-driven
 * happy path and short path live in the sibling specs; these prove the mechanism.
 */

async function seedOffer(
  request: Parameters<typeof seedOrgFull>[0],
  prefix: string,
  opts: {
    capacity?: number;
    paymentPolicy?: "online" | "on_site" | "both";
    allowedPurchaseModes?: ("single_class" | "package")[];
    athletes?: number;
  } = {},
) {
  const ownerEmail = uniqueEmail(`${prefix}-owner`);
  await registerViaApi(request, ownerEmail);
  const { orgId, subdomain, slug } = await seedOrgFull(request, {
    ownerEmail,
    name: `${prefix} Academy`,
    slug: uniqueId(prefix),
    subdomain: uniqueSubdomain(prefix),
  });

  const offerSlug = uniqueId(`${prefix}-offer`).replace(/_/g, "-");
  const slot = uniqueNearFutureSlot();
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    groupType: {
      slug: offerSlug,
      name: `${prefix} offer`,
      price: 10_000,
      paymentPolicy: opts.paymentPolicy ?? "on_site",
      allowedPurchaseModes: opts.allowedPurchaseModes ?? ["single_class"],
    },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: opts.capacity ?? 8 }],
    client: { email: uniqueEmail(`${prefix}-parent`), isVerified: true },
    athletes: Array.from({ length: opts.athletes ?? 1 }, (_, i) => ({ name: `Child ${i + 1}` })),
  });

  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);
  return {
    orgId,
    subdomain,
    orgSlug: slug,
    offerSlug,
    groupTypeId: seed.groupTypeId!,
    sessionId: seed.sessionIds![0]!,
    clientId: seed.clientId!,
    athleteIds: seed.athleteIds!,
    slot,
  };
}

test("two parents race for the last seat — exactly one wins", async ({ request }) => {
  const offer = await seedOffer(request, "race", { capacity: 1, athletes: 2 });

  // holdMs on BOTH: the winner holds the session lock while the loser blocks on
  // it, so the loser's capacity count runs after the winner's row exists. Without
  // the lock (mutation: drop `.for("update")`) both read 0 and both insert.
  const [a, b] = await Promise.all([
    devCreateBooking(request, {
      organizationId: offer.orgId,
      sessionId: offer.sessionId,
      clientId: offer.clientId,
      athleteId: offer.athleteIds[0]!,
      holdMs: 400,
    }),
    devCreateBooking(request, {
      organizationId: offer.orgId,
      sessionId: offer.sessionId,
      clientId: offer.clientId,
      athleteId: offer.athleteIds[1]!,
      holdMs: 400,
    }),
  ]);

  // Assert the MULTISET of outcomes, never which one won (langlion-client-auth D38).
  const outcomes = [
    a.ok ? "created" : (a as { reason?: string }).reason,
    b.ok ? "created" : (b as { reason?: string }).reason,
  ].sort();
  expect(outcomes).toEqual(["created", "session_full"]);

  // The durable invariant: exactly one seat taken, whatever the timing.
  expect(await activeBookings(request, offer.orgId, offer.sessionId)).toBe(1);
});

test("the same athlete cannot hold two overlapping bookings (§5.3), regardless of role", async ({
  request,
}) => {
  // Two overlapping sessions, different offers, different trainers — so the ONLY
  // thing that can refuse the second booking is the athlete-overlap constraint,
  // not capacity and not a trainer clash.
  const ownerEmail = uniqueEmail("overlap-owner");
  await registerViaApi(request, ownerEmail);
  const { orgId } = await seedOrgFull(request, {
    ownerEmail,
    name: "Overlap Academy",
    slug: uniqueId("overlap"),
    subdomain: uniqueSubdomain("overlap"),
  });

  const slot = uniqueNearFutureSlot();
  const parentEmail = uniqueEmail("overlap-parent");

  const a = await seedLanglion(request, {
    organizationId: orgId,
    trainerId: undefined,
    groupType: { slug: uniqueId("offer-a").replace(/_/g, "-"), name: "Offer A", price: 10_000 },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
    client: { email: parentEmail, isVerified: true },
    athletes: [{ name: "Only Child" }],
  });
  expect(a.ok).toBe(true);

  const b = await seedLanglion(request, {
    organizationId: orgId,
    groupType: { slug: uniqueId("offer-b").replace(/_/g, "-"), name: "Offer B", price: 10_000 },
    // Same window, one minute in — genuinely overlapping.
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
  });
  expect(b.ok).toBe(true);

  const athleteId = a.athleteIds![0]!;
  const clientId = a.clientId!;

  // Book on A — succeeds.
  const first = await devCreateBooking(request, {
    organizationId: orgId,
    sessionId: a.sessionIds![0]!,
    clientId,
    athleteId,
  });
  expect(first.ok).toBe(true);

  // Book the SAME athlete on the overlapping session B — refused by the exclusion
  // constraint (23P01 on booking_athlete_no_overlap_excl). This is what "regardless
  // of role" means while F5 has no staff booking UI: a production-writer call with
  // no capacity or trainer reason to fail still cannot overlap the athlete.
  const collision = await devCreateBooking(request, {
    organizationId: orgId,
    sessionId: b.sessionIds![0]!,
    clientId,
    athleteId,
  });
  expect(collision.ok).toBe(false);
  expect((collision as { sqlState?: string }).sqlState).toBe("23P01");
  expect((collision as { constraint?: string }).constraint).toBe("booking_athlete_no_overlap_excl");

  // Same athlete, SAME session again — caught by the SAME constraint (a range
  // overlaps itself), which is why no unique(sessionId, athleteId) index exists.
  const selfOverlap = await devCreateBooking(request, {
    organizationId: orgId,
    sessionId: a.sessionIds![0]!,
    clientId,
    athleteId,
  });
  expect(selfOverlap.ok).toBe(false);
  expect((selfOverlap as { sqlState?: string }).sqlState).toBe("23P01");
});

test("a payment_pending booking occupies a seat", async ({ request }) => {
  // Capacity 1, `both` policy so online is a permitted method. The only way to
  // prove this clause of F5's scope: online is disabled in F5, so the UI has no
  // reachable path to payment_pending — the dev route forces online available to
  // manufacture the seat, then a real on-site attempt must see it as taken.
  const offer = await seedOffer(request, "pending", {
    capacity: 1,
    paymentPolicy: "both",
    athletes: 2,
  });

  const pending = await devCreateBooking(request, {
    organizationId: offer.orgId,
    sessionId: offer.sessionId,
    clientId: offer.clientId,
    athleteId: offer.athleteIds[0]!,
    paymentMethod: "online",
    onlineAvailable: true,
  });
  expect(pending.ok, "the pending seat should be taken").toBe(true);
  expect((pending as { paymentStatus?: string }).paymentStatus).toBe("payment_pending");

  // A second parent tries the same single seat on-site — refused, because the
  // payment_pending booking counts as active (§2.3).
  const blocked = await devCreateBooking(request, {
    organizationId: offer.orgId,
    sessionId: offer.sessionId,
    clientId: offer.clientId,
    athleteId: offer.athleteIds[1]!,
    paymentMethod: "on_site",
  });
  expect(blocked.ok).toBe(false);
  expect((blocked as { reason?: string }).reason).toBe("session_full");
  expect(await activeBookings(request, offer.orgId, offer.sessionId)).toBe(1);
});

/* ─── UI-driven paths ──────────────────────────────────────────────────── */

test("a new parent enrols through the calendar and OTP, paying on site", async ({
  page,
  request,
}) => {
  const offer = await seedOffer(request, "happy", { capacity: 8, athletes: 0 });
  const email = uniqueEmail("happy-parent");

  await page.goto(tenantUrl(offer.subdomain, `/en/zapisy/${offer.offerSlug}`));

  // Date → slot. The calendar opens on the slot's month (defaultMonth), so the
  // day cell is present without navigating.
  const dayKey = dayKeyIn(WARSAW, offer.slot.startsAt);
  await page.locator(`[data-day-key="${dayKey}"]`).click();
  await page.locator(`[data-session-id="${offer.sessionId}"]`).click();

  // A new parent: email → OTP, read from the outbox (never a fixture route).
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = await readOtpCode(request, email);
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Confirm" }).click();

  // Participant (new) → pay on site → enrol.
  await page.getByLabel("Participant name").fill("Ola");
  await page.getByRole("button", { name: "Enrol" }).click();

  await expect(page.getByText("Booking created.")).toBeVisible();

  // The page proved a parent CAN; the row proves it is RIGHT.
  const state = await request.post("/api/dev/bookings", {
    data: { action: "state", organizationId: offer.orgId, sessionId: offer.sessionId },
  });
  const body = (await state.json()) as {
    activeBookings: number;
    bookings: { paymentStatus: string; priceSnapshot: { amount: number; currency: string } }[];
  };
  expect(body.activeBookings).toBe(1);
  expect(body.bookings[0]!.paymentStatus).toBe("booked_offline");
  expect(body.bookings[0]!.priceSnapshot).toEqual({ amount: 10_000, currency: "PLN" });
});

test("a booking's price is frozen against a later change on the definition (US-4.6)", async ({
  request,
}) => {
  const offer = await seedOffer(request, "freeze", { capacity: 8, athletes: 1 });

  const booked = await devCreateBooking(request, {
    organizationId: offer.orgId,
    sessionId: offer.sessionId,
    clientId: offer.clientId,
    athleteId: offer.athleteIds[0]!,
  });
  expect(booked.ok).toBe(true);

  // Raise the catalogue price AFTER the booking.
  await seedLanglion(request, {
    organizationId: offer.orgId,
    setGroupTypePrice: { groupTypeId: offer.groupTypeId, price: 12_000 },
  });

  // The snapshot stays 10000 …
  const state = await request.post("/api/dev/bookings", {
    data: { action: "state", organizationId: offer.orgId, sessionId: offer.sessionId },
  });
  const body = (await state.json()) as {
    bookings: { priceSnapshot: { amount: number } }[];
  };
  expect(body.bookings[0]!.priceSnapshot.amount).toBe(10_000);

  // … while the OFFER now shows the new price — the half that distinguishes
  // "frozen" from "the update never happened".
  const langlion = await request.get(
    `/api/dev/langlion-state?orgSlug=${offer.orgSlug}&groupTypeSlug=${offer.offerSlug}`,
  );
  const ls = (await langlion.json()) as { groupTypes: { price: number }[] };
  expect(ls.groupTypes[0]!.price).toBe(12_000);
});

test("the payment matrix renders per policy and purchase mode (US-4.4)", async ({
  page,
  request,
}) => {
  // The confirm-step method options are covered exhaustively by payment-options.test.ts;
  // this proves the UI renders the three top-level SHAPES a parent can land on.

  // Bookable: on_site offer shows the price and a calendar.
  const onSite = await seedOffer(request, "m-onsite", { paymentPolicy: "on_site", athletes: 0 });
  await page.goto(tenantUrl(onSite.subdomain, `/en/zapisy/${onSite.offerSlug}`));
  await expect(page.getByText("Price per class")).toBeVisible();
  await expect(page.locator("[data-day-key]").first()).toBeVisible();

  // Packages-only: message, NO calendar, no booking (US-4.4/AC4).
  const pkg = await seedOffer(request, "m-pkg", { allowedPurchaseModes: ["package"], athletes: 0 });
  await page.goto(tenantUrl(pkg.subdomain, `/en/zapisy/${pkg.offerSlug}`));
  await expect(page.getByText("No packages available — please contact the academy.")).toBeVisible();
  await expect(page.locator("[data-day-key]")).toHaveCount(0);

  // Online-only with online disabled (F5): the none-available message, no calendar.
  // A real, reachable state in F5 that no acceptance criterion covered (decision F).
  const online = await seedOffer(request, "m-online", { paymentPolicy: "online", athletes: 0 });
  await page.goto(tenantUrl(online.subdomain, `/en/zapisy/${online.offerSlug}`));
  await expect(
    page.getByText("Online enrolment is temporarily unavailable — please contact the academy."),
  ).toBeVisible();
  await expect(page.locator("[data-day-key]")).toHaveCount(0);
});

test("the backend refuses a payment method outside the offer's policy (Constraint 7)", async ({
  request,
}) => {
  // The direct-API case US-4.4/AC3 does not cover: nothing rendered the option, so
  // nothing in the UI would have stopped it either. An on_site-only offer must
  // refuse an online booking at the writer, whatever the UI shows.
  const offer = await seedOffer(request, "policy", { paymentPolicy: "on_site", athletes: 1 });
  const refused = await devCreateBooking(request, {
    organizationId: offer.orgId,
    sessionId: offer.sessionId,
    clientId: offer.clientId,
    athleteId: offer.athleteIds[0]!,
    paymentMethod: "online",
    onlineAvailable: true,
  });
  expect(refused.ok).toBe(false);
  expect((refused as { reason?: string }).reason).toBe("payment_method_unavailable");
});

/** Enrol the parent bound to `email` through the UI, creating a child. Leaves the cookie. */
async function enrolNewParent(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  subdomain: string,
  offerSlug: string,
  sessionId: string,
  slotIso: string,
  email: string,
  childName: string,
): Promise<void> {
  await page.goto(tenantUrl(subdomain, `/en/zapisy/${offerSlug}`));
  await page.locator(`[data-day-key="${dayKeyIn(WARSAW, slotIso)}"]`).click();
  await page.locator(`[data-session-id="${sessionId}"]`).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = await readOtpCode(request, email);
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByLabel("Participant name").fill(childName);
  await page.getByRole("button", { name: "Enrol" }).click();
  await expect(page.getByText("Booking created.")).toBeVisible();
}

/** Seed one more offer with a known slug and a captured slot on an existing academy. */
async function seedSecondOffer(
  request: import("@playwright/test").APIRequestContext,
  organizationId: string,
  prefix: string,
  extra: { isNewClientOnly?: boolean } = {},
): Promise<{ slug: string; sessionId: string; slot: { startsAt: string; endsAt: string } }> {
  const slug = uniqueId(prefix).replace(/_/g, "-");
  const slot = uniqueNearFutureSlot(9);
  const seed = await seedLanglion(request, {
    organizationId,
    groupType: {
      slug,
      name: `${prefix} offer`,
      price: 10_000,
      isNewClientOnly: extra.isNewClientOnly,
    },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
  });
  expect(seed.ok).toBe(true);
  return { slug, sessionId: seed.sessionIds![0]!, slot };
}

test("a recognised parent skips OTP and picks an existing child (US-4.2)", async ({
  page,
  request,
}) => {
  // Recognition is COOKIE-based (decision D), not email-typed. Establish the cookie
  // with a first enrolment, then a second offer in the same browser skips OTP.
  const offer = await seedOffer(request, "known", { capacity: 8, athletes: 0 });
  await enrolNewParent(
    page,
    request,
    offer.subdomain,
    offer.offerSlug,
    offer.sessionId,
    offer.slot.startsAt,
    uniqueEmail("known-parent"),
    "Zosia",
  );

  const second = await seedSecondOffer(request, offer.orgId, "known-2");
  await page.goto(tenantUrl(offer.subdomain, `/en/zapisy/${second.slug}`));
  await page.locator(`[data-day-key="${dayKeyIn(WARSAW, second.slot.startsAt)}"]`).click();
  await page.locator(`[data-session-id="${second.sessionId}"]`).click();

  // No OTP step: the confirm button is reachable directly, and the existing child
  // is offered rather than an email field.
  await expect(page.getByRole("button", { name: "Enrol" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  // The existing child is offered as an <option> — not "visible" in Playwright's
  // sense, so assert the select's contents rather than visibility.
  await expect(page.locator('select[name="athleteId"]')).toContainText("Zosia");
});

test("is_new_client_only does not gate a recognised existing client (US-4.3)", async ({
  page,
  request,
}) => {
  // The ONLY evidence for US-4.3/AC1: the implementation is the ABSENCE of a branch,
  // so a recognised existing client booking a flagged offer must simply succeed.
  const offer = await seedOffer(request, "flag", { capacity: 8, athletes: 0 });
  await enrolNewParent(
    page,
    request,
    offer.subdomain,
    offer.offerSlug,
    offer.sessionId,
    offer.slot.startsAt,
    uniqueEmail("flag-parent"),
    "Ala",
  );

  const flagged = await seedSecondOffer(request, offer.orgId, "flagged", { isNewClientOnly: true });
  await page.goto(tenantUrl(offer.subdomain, `/en/zapisy/${flagged.slug}`));
  await expect(page.getByText("aimed primarily at new clients")).toBeVisible();
  await page.locator(`[data-day-key="${dayKeyIn(WARSAW, flagged.slot.startsAt)}"]`).click();
  await page.locator(`[data-session-id="${flagged.sessionId}"]`).click();
  await expect(page.getByRole("button", { name: "Enrol" })).toBeVisible();
});
