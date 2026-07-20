import { expect, test, type APIRequestContext } from "@playwright/test";

import { signedRequest, subscriptionEvent, uniqueId } from "./billing-fixtures";
import {
  drainJobs,
  getEmails,
  getJobs,
  registerAndVerify,
  seedOrg,
  uniqueEmail,
  waitForEmail,
  waitForJobsSettled,
} from "./helpers";

/**
 * The onboarding sequence and its interrupt (spec 10.3).
 *
 * Day 0/3/7 are enqueued upfront and fast-forwarded here, scoped to each test's
 * own user id — the suite is parallel against one shared database, so an unscoped
 * fast-forward would drag other specs' scheduled jobs into the present.
 */

test("all three steps are queued upfront, and run in order", async ({ request }) => {
  const email = uniqueEmail("sequence");
  const userId = await registerAndVerify(request, email);
  const prefix = `onboarding:${userId}:`;

  // Upfront, not chained: one query shows the whole sequence, which is exactly
  // what §12.2 asks for and what a chain could never offer.
  const queued = await getJobs(request, { dedupeKeyPrefix: prefix });
  expect(queued).toHaveLength(3);
  expect(queued.map((j) => j.dedupeKey).sort()).toEqual([
    `${prefix}features`,
    `${prefix}tips`,
    `${prefix}welcome`,
  ]);

  // Days 3 and 7 are scheduled into the future, and still PENDING.
  //
  // The pending filter is load-bearing, not decoration: `runAt` doubles as the
  // claim's visibility timeout, so a job that has already run also carries a
  // future `runAt` (now + CLAIM_TIMEOUT). Filtering on `runAt` alone would count
  // the already-delivered welcome as "scheduled" — and day 0's job may well have
  // been drained by `kickDrain()` before this line runs.
  const scheduled = queued.filter(
    (j) => j.status === "pending" && new Date(j.runAt).getTime() > Date.now(),
  );
  expect(scheduled.map((j) => j.dedupeKey).sort()).toEqual([`${prefix}features`, `${prefix}tips`]);

  await drainJobs(request, { dedupeKeyPrefix: prefix });
  await waitForEmail(request, email, "welcome");
  expect((await getEmails(request, email)).map((m) => m.template)).not.toContain("onboarding-tips");

  await drainJobs(request, { dedupeKeyPrefix: prefix, fastForward: true });
  await waitForEmail(request, email, "onboarding-tips");
  await waitForEmail(request, email, "onboarding-features");
});

test("verifying twice does not start the sequence twice", async ({ request }) => {
  const email = uniqueEmail("double-verify");
  const userId = await registerAndVerify(request, email);

  // The engine's `emailVerified` early-return is not atomic with the UPDATE that
  // sets it, so a mail scanner prefetching the link while the human clicks can
  // fire `afterEmailVerification` twice. The dedupe keys are what close that.
  const jobs = await getJobs(request, { dedupeKeyPrefix: `onboarding:${userId}:` });
  expect(jobs).toHaveLength(3);

  await drainJobs(request, { dedupeKeyPrefix: `onboarding:${userId}:` });
  const welcomes = (await getEmails(request, email)).filter((m) => m.template === "welcome");
  expect(welcomes).toHaveLength(1);
});

/** A paying org owned by `ownerEmail`, as a completed checkout would leave it. */
async function subscribeOrg(request: APIRequestContext, ownerEmail: string): Promise<void> {
  const { slug: orgSlug } = await seedOrg(request, {
    ownerEmail,
    name: "Paying Co",
    slug: uniqueId("paying-co"),
  });
  const customerId = uniqueId("cus");
  await request.post("/api/dev/seed-billing-customer", {
    data: { providerCustomerId: customerId, orgSlug },
  });
  const res = await request.post(
    "/api/billing/webhook",
    signedRequest(
      subscriptionEvent({
        eventId: uniqueId("evt"),
        customerId,
        subscriptionId: uniqueId("sub"),
        type: "customer.subscription.created",
        status: "active",
      }),
    ),
  );
  expect(res.status()).toBe(200);
}

test("subscribing interrupts the rest of the sequence", async ({ request }) => {
  const email = uniqueEmail("converts");
  const userId = await registerAndVerify(request, email);
  const prefix = `onboarding:${userId}:`;

  await drainJobs(request, { dedupeKeyPrefix: prefix });
  await waitForEmail(request, email, "welcome");

  // Spec 10.3: "z możliwością przerwania sekwencji jeśli użytkownik wykona
  // określoną akcję (np. zasubskrybował plan płatny)".
  await subscribeOrg(request, email);

  // Days 3 and 7 were queued on day 0, long before the subscription existed. The
  // rows are still there — deliberately, they are never deleted — and the guard
  // inside the handler is what stops the send.
  await drainJobs(request, { dedupeKeyPrefix: prefix, fastForward: true });

  const templates = (await getEmails(request, email)).map((m) => m.template);
  expect(templates).not.toContain("onboarding-tips");
  expect(templates).not.toContain("onboarding-features");

  // Skipped, not failed: an interrupt is the system working as designed.
  const jobs = await waitForJobsSettled(request, prefix);
  expect(jobs.map((j) => j.status)).toEqual(jobs.map(() => "done"));
});
