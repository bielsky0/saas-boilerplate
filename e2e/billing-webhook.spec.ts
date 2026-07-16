import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  invoiceEvent,
  signedRequest,
  stripeSignature,
  subscriptionEvent,
  uniqueId,
} from "./billing-fixtures";
import { registerViaApi, seedOrg, uniqueEmail } from "./helpers";

/**
 * Billing webhook E2E (spec 5.4). Runs fully offline: signature verification is
 * a local HMAC, so no Stripe account, API key or `stripe listen` is involved.
 *
 * Every test mints its own org, customer and event ids — the suite shares one
 * database and never tears down.
 */

type Fixture = { orgSlug: string; customerId: string };

/** An org with a provider customer mapped to it, as checkout would leave it. */
async function seedBillingOrg(request: APIRequestContext): Promise<Fixture> {
  const ownerEmail = uniqueEmail("billing-owner");
  await registerViaApi(request, ownerEmail);
  // A unique slug per test, not just a unique name: these specs run in parallel
  // against one shared database, and letting the seeder derive the same slug
  // from a shared name races two workers onto the same unique constraint.
  const orgSlug = await seedOrg(request, {
    ownerEmail,
    name: "Billing Co",
    slug: uniqueId("billing-co"),
  });
  const customerId = uniqueId("cus");
  const res = await request.post("/api/dev/seed-billing-customer", {
    data: { providerCustomerId: customerId, orgSlug },
  });
  expect(res.ok(), `seed-billing-customer failed: ${await res.text()}`).toBe(true);
  return { orgSlug, customerId };
}

async function billingState(request: APIRequestContext, orgSlug: string) {
  const res = await request.get(`/api/dev/billing-state?orgSlug=${orgSlug}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as {
    subscriptions: Array<{ providerSubscriptionId: string; status: string; planId: string | null }>;
    payments: Array<{ providerPaymentId: string; status: string; amount: number }>;
    webhookEvents: Array<{ providerEventId: string; type: string }>;
    totalPaid: number;
  };
}

test.describe("signature verification (spec 5.4)", () => {
  test("rejects a body signed with the wrong secret", async ({ request }) => {
    const { orgSlug, customerId } = await seedBillingOrg(request);
    const event = subscriptionEvent({
      eventId: uniqueId("evt"),
      customerId,
      subscriptionId: uniqueId("sub"),
      type: "customer.subscription.created",
    });

    const res = await request.post(
      "/api/billing/webhook",
      signedRequest(event, "whsec_theWrongSigningSecretEntirely"),
    );

    expect(res.status()).toBe(400);
    // Rejected before any write — the signature gates everything.
    const state = await billingState(request, orgSlug);
    expect(state.subscriptions).toHaveLength(0);
    expect(state.webhookEvents).toHaveLength(0);
  });

  test("rejects a request with no signature header", async ({ request }) => {
    const { customerId } = await seedBillingOrg(request);
    const event = subscriptionEvent({
      eventId: uniqueId("evt"),
      customerId,
      subscriptionId: uniqueId("sub"),
      type: "customer.subscription.created",
    });

    const res = await request.post("/api/billing/webhook", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify(event),
    });

    expect(res.status()).toBe(400);
  });

  test("rejects a tampered body carrying a signature valid for the original", async ({
    request,
  }) => {
    const { orgSlug, customerId } = await seedBillingOrg(request);
    const event = subscriptionEvent({
      eventId: uniqueId("evt"),
      customerId,
      subscriptionId: uniqueId("sub"),
      type: "customer.subscription.created",
    });

    // Sign the honest body, then post a different one under that signature.
    // This is the vector that proves real verification rather than merely
    // checking the header is present.
    const original = JSON.stringify(event);
    const signature = stripeSignature(original);
    const tampered = original.replace('"status":"active"', '"status":"trialing"');
    expect(tampered).not.toBe(original);

    const res = await request.post("/api/billing/webhook", {
      headers: { "content-type": "application/json", "stripe-signature": signature },
      data: tampered,
    });

    expect(res.status()).toBe(400);
    const state = await billingState(request, orgSlug);
    expect(state.subscriptions).toHaveLength(0);
  });
});

test.describe("idempotency (spec 5.4)", () => {
  test("delivering the same event twice creates no duplicate subscription", async ({ request }) => {
    const { orgSlug, customerId } = await seedBillingOrg(request);
    const event = subscriptionEvent({
      eventId: uniqueId("evt"),
      customerId,
      subscriptionId: uniqueId("sub"),
      type: "customer.subscription.created",
    });
    const signed = signedRequest(event);

    const first = await request.post("/api/billing/webhook", signed);
    const second = await request.post("/api/billing/webhook", signed);

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect((await first.json()).status).toBe("processed");
    // The redelivery is acknowledged but applied to nothing.
    expect((await second.json()).status).toBe("duplicate");

    const state = await billingState(request, orgSlug);
    expect(state.subscriptions).toHaveLength(1);
    expect(state.webhookEvents).toHaveLength(1);
    expect(state.subscriptions[0]!.status).toBe("active");
    // The configured price resolved to an internal plan.
    expect(state.subscriptions[0]!.planId).toBe("pro");
  });

  test("delivering the same invoice twice does not double the charge", async ({ request }) => {
    const { orgSlug, customerId } = await seedBillingOrg(request);
    const event = invoiceEvent({
      eventId: uniqueId("evt"),
      customerId,
      invoiceId: uniqueId("in"),
      subscriptionId: uniqueId("sub"),
      type: "invoice.paid",
      amount: 2900,
    });
    const signed = signedRequest(event);

    await request.post("/api/billing/webhook", signed);
    await request.post("/api/billing/webhook", signed);

    const state = await billingState(request, orgSlug);
    expect(state.payments).toHaveLength(1);
    // The literal acceptance criterion: one payment's worth of money.
    expect(state.totalPaid).toBe(2900);
  });

  test("concurrent delivery of the same event still applies it once", async ({ request }) => {
    const { orgSlug, customerId } = await seedBillingOrg(request);
    const event = subscriptionEvent({
      eventId: uniqueId("evt"),
      customerId,
      subscriptionId: uniqueId("sub"),
      type: "customer.subscription.created",
    });
    const signed = signedRequest(event);

    // Exercises the unique-index block: whichever transaction loses waits for
    // the winner to commit, then finds the conflict and skips.
    const [a, b] = await Promise.all([
      request.post("/api/billing/webhook", signed),
      request.post("/api/billing/webhook", signed),
    ]);

    const statuses = [(await a.json()).status, (await b.json()).status].sort();
    expect(statuses).toEqual(["duplicate", "processed"]);

    const state = await billingState(request, orgSlug);
    expect(state.subscriptions).toHaveLength(1);
  });
});

test.describe("delivery ordering (spec 5.4)", () => {
  test("a stale event cannot resurrect a cancelled subscription", async ({ request }) => {
    const { orgSlug, customerId } = await seedBillingOrg(request);
    const subscriptionId = uniqueId("sub");
    const t0 = Math.floor(Date.now() / 1000);

    // The cancellation happened later...
    await request.post(
      "/api/billing/webhook",
      signedRequest(
        subscriptionEvent({
          eventId: uniqueId("evt"),
          customerId,
          subscriptionId,
          type: "customer.subscription.deleted",
          status: "canceled",
          createdAt: t0 + 60,
        }),
      ),
    );

    // ...but an older "active" update is delivered after it (a retry landing
    // late is exactly this). It must not take effect.
    const stale = await request.post(
      "/api/billing/webhook",
      signedRequest(
        subscriptionEvent({
          eventId: uniqueId("evt"),
          customerId,
          subscriptionId,
          type: "customer.subscription.updated",
          status: "active",
          createdAt: t0,
        }),
      ),
    );
    expect(stale.status()).toBe(200);

    const state = await billingState(request, orgSlug);
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]!.status).toBe("canceled");
  });
});

test.describe("unknown customer (spec 5.4)", () => {
  test("is acknowledged without writing, so it is not retried forever", async ({ request }) => {
    const { orgSlug } = await seedBillingOrg(request);
    const event = subscriptionEvent({
      eventId: uniqueId("evt"),
      // A customer belonging to nobody — e.g. another environment sharing the
      // provider's test account.
      customerId: uniqueId("cus_unknown"),
      subscriptionId: uniqueId("sub"),
      type: "customer.subscription.created",
    });

    const res = await request.post("/api/billing/webhook", signedRequest(event));

    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("unknown_customer");
    const state = await billingState(request, orgSlug);
    expect(state.subscriptions).toHaveLength(0);
    // No marker: a later mapping fix + resend must still be able to process it.
    expect(state.webhookEvents).toHaveLength(0);
  });
});
