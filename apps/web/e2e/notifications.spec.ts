import { expect, test, type APIRequestContext } from "@playwright/test";

import { invoiceEvent, signedRequest, uniqueId } from "./billing-fixtures";
import {
  drainJobs,
  failNextEmails,
  getEmails,
  getNotifications,
  registerViaApi,
  seedOrg,
  setNotificationPreference,
  uniqueEmail,
  waitForEmail,
  waitForJobsSettled,
  waitForNotification,
} from "./helpers";

/**
 * Notification center E2E (spec 23) — the two acceptance criteria for 11a.3:
 *   1. a §10.2 event raises an in-app notification INDEPENDENTLY of the email;
 *   2. disabling the preference for a type actually STOPS those notifications.
 *
 * Uses the billing `payment-failed` event as the trigger: it fans out through
 * `billing.notify` into an `email.send` child AND a `notification.create` child,
 * which is exactly where the two channels must be shown to be independent. Runs
 * offline (local HMAC signature), like the rest of the billing suite.
 */

type Fixture = { ownerEmail: string; orgSlug: string; customerId: string };

/** An org with a provider customer mapped to it, as checkout would leave it. */
async function seedBillingOrg(request: APIRequestContext): Promise<Fixture> {
  const ownerEmail = uniqueEmail("notif-owner");
  await registerViaApi(request, ownerEmail);
  const orgSlug = await seedOrg(request, {
    ownerEmail,
    name: "Notif Co",
    slug: uniqueId("notif-co"),
  });
  const customerId = uniqueId("cus");
  const res = await request.post("/api/dev/seed-billing-customer", {
    data: { providerCustomerId: customerId, orgSlug },
  });
  expect(res.ok(), `seed-billing-customer failed: ${await res.text()}`).toBe(true);
  return { ownerEmail, orgSlug, customerId };
}

/** Deliver a signed `invoice.payment_failed`. Returns the provider event id. */
async function postPaymentFailed(request: APIRequestContext, customerId: string): Promise<string> {
  const eventId = uniqueId("evt");
  const event = invoiceEvent({
    eventId,
    customerId,
    invoiceId: uniqueId("in"),
    subscriptionId: uniqueId("sub"),
    type: "invoice.payment_failed",
    amount: 2900,
  });
  const res = await request.post("/api/billing/webhook", signedRequest(event));
  expect(res.status()).toBe(200);
  return eventId;
}

test("a payment-failed event notifies in-app even when the email never sends", async ({
  request,
}) => {
  const { ownerEmail, customerId } = await seedBillingOrg(request);

  // Guarantee the payment-failed EMAIL cannot deliver. If the channels were
  // coupled, killing the email would kill the notification too — that is the
  // failure this test exists to catch.
  await failNextEmails(request, ownerEmail, 99);

  await postPaymentFailed(request, customerId);
  // Two passes: the first runs `billing.notify`, which enqueues the children; the
  // second guarantees the `notification.create` child has run even if the cascade
  // did not complete within one drain.
  await drainJobs(request);
  await drainJobs(request);

  const notif = await waitForNotification(request, ownerEmail, "payment-failed");
  expect(notif.readAt, "a fresh notification is unread").toBeNull();

  // The email specifically did NOT go out — yet the in-app notification did.
  const paymentEmails = (await getEmails(request, ownerEmail)).filter(
    (m) => m.template === "payment-failed",
  );
  expect(paymentEmails, "the email channel failed independently").toHaveLength(0);
});

test("disabling the in-app preference for a type stops those notifications", async ({
  request,
}) => {
  const { ownerEmail, customerId } = await seedBillingOrg(request);

  // Turn the in-app channel OFF for this type, before the event fires.
  await setNotificationPreference(request, ownerEmail, "payment-failed", false);

  const eventId = await postPaymentFailed(request, customerId);
  await drainJobs(request);
  await drainJobs(request);

  // Wait for the `notification.create` job to SETTLE (it runs and no-ops), so the
  // "no notification" assertion below is deterministic, not a race against a job
  // that simply hasn't run yet.
  await waitForJobsSettled(request, `notif:payment-failed:${eventId}`);

  // The email still arrives — the email channel is governed separately, so the
  // in-app opt-out must not silence it.
  await waitForEmail(request, ownerEmail, "payment-failed");

  // ...but no in-app notification of the disabled type was created.
  const paymentNotifs = (await getNotifications(request, ownerEmail)).filter(
    (n) => n.type === "payment-failed",
  );
  expect(paymentNotifs, "the disabled preference suppressed the in-app channel").toHaveLength(0);
});
