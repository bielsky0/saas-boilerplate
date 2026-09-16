import { type APIRequestContext } from "@playwright/test";
import { expect, test } from "./rate-limit-fixtures";

import { invoiceEvent, signedRequest, subscriptionEvent, uniqueId } from "./billing-fixtures";
import {
  TEST_PASSWORD,
  drainJobs,
  getEmails,
  getJobs,
  registerAndVerify,
  registerViaApi,
  seedOrg,
  uniqueEmail,
  waitForEmail,
} from "./helpers";

/**
 * Every transactional email from phases 2/3/5 actually sends (spec 10.2).
 *
 * The acceptance criterion for this phase, one test per template. All of them now
 * travel through the job queue, so each asserts on the outbox AFTER a drain rather
 * than immediately — see `waitForEmail`.
 *
 * Runs offline: EMAIL_PROVIDER=log and the billing signatures are local HMACs.
 */

/** An org with a provider customer mapped to it, as checkout would leave it. */
async function seedBillingOrg(
  request: APIRequestContext,
  extraOwners: string[] = [],
): Promise<{ orgSlug: string; customerId: string; ownerEmail: string }> {
  const ownerEmail = uniqueEmail("mail-owner");
  await registerViaApi(request, ownerEmail);
  for (const e of extraOwners) await registerViaApi(request, e);

  const orgSlug = await seedOrg(request, {
    ownerEmail,
    name: "Mail Co",
    // Unique slug per test: the suite is parallel against one shared database.
    slug: uniqueId("mail-co"),
    members: extraOwners.map((email) => ({ email, role: "owner" })),
  });

  const customerId = uniqueId("cus");
  const res = await request.post("/api/dev/seed-billing-customer", {
    data: { providerCustomerId: customerId, orgSlug },
  });
  expect(res.ok(), `seed-billing-customer failed: ${await res.text()}`).toBe(true);
  return { orgSlug, customerId, ownerEmail };
}

test("verify-email sends on registration", async ({ request }) => {
  const email = uniqueEmail("verify");
  await registerViaApi(request, email);

  const mail = await waitForEmail(request, email, "verify-email");
  expect(mail.url).toBeTruthy();
  expect(mail.subject).toMatch(/verify/i);
  // Transactional mail must never carry an unsubscribe affordance.
  expect(mail.headers?.["List-Unsubscribe"]).toBeUndefined();
});

test("welcome sends after verification, as day 0 of the sequence", async ({ request }) => {
  const email = uniqueEmail("welcome");
  const userId = await registerAndVerify(request, email);

  await drainJobs(request, { dedupeKeyPrefix: `onboarding:${userId}:` });

  const mail = await waitForEmail(request, email, "welcome");
  expect(mail.subject).toMatch(/welcome/i);
  // Onboarding mail, unlike transactional, MUST be unsubscribable (spec 10.3).
  expect(mail.headers?.["List-Unsubscribe"]).toContain("/api/unsubscribe");
  expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
});

test("invitation sends via the queue, and its job payload is scrubbed", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("inviter");
  const inviteeEmail = uniqueEmail("invitee");
  await registerViaApi(request, ownerEmail);
  const slug = await seedOrg(request, {
    ownerEmail,
    name: "Invite Co",
    slug: uniqueId("invite-co"),
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL("**/dashboard");

  await page.goto(`/orgs/${slug}/members`);
  await page.getByLabel("Email").fill(inviteeEmail);
  await page.getByLabel("Role", { exact: true }).click();
  await page.getByRole("option", { name: "Member" }).click();
  await page.getByRole("button", { name: /send invite/i }).click();
  await expect(page.getByText(/invitation sent to/i)).toBeVisible();

  const mail = await waitForEmail(request, inviteeEmail, "invitation");
  expect(mail.url).toContain("/invitations/");
  expect(mail.headers?.["List-Unsubscribe"]).toBeUndefined();

  // The raw invite link is a working credential, and `invitation.tokenHash`
  // deliberately never stores one ("a database leak cannot yield working links").
  // Queuing the email put that link into `job.payload`, so the success path must
  // scrub it — otherwise the queue quietly repeals that guarantee.
  const rawToken = mail.url!.split("/invitations/")[1]!;
  expect(rawToken).toBeTruthy();
  const inviteJobs = await getJobs(request, { dedupeKeyPrefix: "invitation:" });
  expect(inviteJobs.length).toBeGreaterThan(0);
  const leaked = inviteJobs.filter((j) => JSON.stringify(j.payload).includes(rawToken));
  expect(leaked, "a delivered invitation must not leave its raw link in job.payload").toEqual([]);
});

test("password-reset sends and the link works end to end", async ({ page, request }) => {
  const email = uniqueEmail("reset");
  await registerViaApi(request, email);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /send reset link/i }).click();
  await expect(page.getByText(/we've sent a link|check your inbox/i)).toBeVisible();

  const mail = await waitForEmail(request, email, "password-reset");
  expect(mail.url).toBeTruthy();
  expect(mail.headers?.["List-Unsubscribe"]).toBeUndefined();

  // The link points at the engine, which validates then redirects to our page.
  await page.goto(mail.url!);
  await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();

  const newPassword = "NewPassword456";
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: /set new password/i }).click();
  await expect(page).toHaveURL(/\/login/);

  // Spec 2.1: the new password works.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("password-reset invalidates the old session and the old password", async ({
  browser,
  request,
}) => {
  const email = uniqueEmail("reset-sessions");
  await registerViaApi(request, email);

  // Sign in first, so there is a live session for the reset to kill (spec 2.1).
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await request.post("/api/auth/request-password-reset", {
    data: { email, redirectTo: "/reset-password" },
  });
  const mail = await waitForEmail(request, email, "password-reset");

  const resetPage = await (await browser.newContext()).newPage();
  await resetPage.goto(mail.url!);
  await resetPage.getByLabel("New password").fill("RotatedPassword789");
  await resetPage.getByRole("button", { name: /set new password/i }).click();
  await expect(resetPage).toHaveURL(/\/login/);

  // The ORIGINAL session must now be dead: revisiting a guarded page bounces.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  await context.close();
});

test("payment-failed reaches every active owner", async ({ request }) => {
  const secondOwner = uniqueEmail("co-owner");
  const { customerId, ownerEmail } = await seedBillingOrg(request, [secondOwner]);

  const res = await request.post(
    "/api/billing/webhook",
    signedRequest(
      invoiceEvent({
        eventId: uniqueId("evt"),
        customerId,
        invoiceId: uniqueId("in"),
        type: "invoice.payment_failed",
        amount: 2900,
      }),
    ),
  );
  expect(res.status()).toBe(200);

  await drainJobs(request);

  // Both owners, not just whoever ran checkout — the fan-out is the point.
  const first = await waitForEmail(request, ownerEmail, "payment-failed");
  expect(first.subject).toMatch(/payment/i);
  expect(first.text).toContain("29.00");
  await waitForEmail(request, secondOwner, "payment-failed");
});

test("subscription-confirmed sends once a subscription is created", async ({ request }) => {
  const { customerId, ownerEmail } = await seedBillingOrg(request);

  const res = await request.post(
    "/api/billing/webhook",
    signedRequest(
      subscriptionEvent({
        eventId: uniqueId("evt"),
        customerId,
        subscriptionId: uniqueId("sub"),
        type: "customer.subscription.created",
      }),
    ),
  );
  expect(res.status()).toBe(200);

  await drainJobs(request);

  const mail = await waitForEmail(request, ownerEmail, "subscription-confirmed");
  expect(mail.text).toContain("Pro");
});

test("a cancelled subscription never gets a confirmation", async ({ request }) => {
  const { customerId, ownerEmail } = await seedBillingOrg(request);
  const subscriptionId = uniqueId("sub");
  const now = Math.floor(Date.now() / 1000);

  // A NEWER cancellation lands first, then a STALE `created` arrives late. The
  // watermark drops the upsert; without the handler's re-read the notification
  // would still fire and announce an active subscription that is already dead.
  await request.post(
    "/api/billing/webhook",
    signedRequest(
      subscriptionEvent({
        eventId: uniqueId("evt"),
        customerId,
        subscriptionId,
        type: "customer.subscription.deleted",
        status: "canceled",
        createdAt: now,
      }),
    ),
  );
  await request.post(
    "/api/billing/webhook",
    signedRequest(
      subscriptionEvent({
        eventId: uniqueId("evt"),
        customerId,
        subscriptionId,
        type: "customer.subscription.created",
        status: "active",
        createdAt: now - 600,
      }),
    ),
  );

  await drainJobs(request);

  const emails = await getEmails(request, ownerEmail);
  expect(emails.map((m) => m.template)).not.toContain("subscription-confirmed");
});
