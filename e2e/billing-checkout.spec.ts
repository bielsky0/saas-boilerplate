import { tenantUrl } from "./host-fixtures";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { signedRequest, subscriptionEvent, uniqueId, E2E_PRO_PRICE_ID } from "./billing-fixtures";
import {
  loginToAcademy,
  loginViaUi,
  registerViaApi,
  seedOrg,
  TEST_PASSWORD,
  uniqueEmail,
} from "./helpers";

/**
 * Checkout & customer portal E2E (spec 5.3, 5.5).
 *
 * DELIBERATELY OFFLINE. The suite's Stripe key is a dummy that never leaves the
 * process, so any test that actually reached `stripe.customers.create` would make
 * a real outbound request and fail on credentials — slowly, and differently in CI
 * than locally. Every assertion here therefore exercises a path that resolves
 * BEFORE the provider is called: validation, purchasability, RBAC, and the
 * "no customer yet" portal branch.
 *
 * That is not a gap in coverage so much as the design being visible: the
 * expensive call is last, and everything that can reject a request cheaply does.
 */

/** Sign in on the apex — for the personal-account cases. */
async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await loginViaUi(page, email, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
}

async function billingState(request: APIRequestContext, orgSlug: string) {
  const res = await request.get(`/api/dev/billing-state?orgSlug=${orgSlug}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as {
    subscriptions: Array<{ providerSubscriptionId: string; status: string; planId: string | null }>;
  };
}

test.describe("checkout boundary (spec 5.3)", () => {
  test("an anonymous request never reaches the provider", async ({ request }) => {
    const res = await request.post("/api/billing/checkout", {
      data: { plan: "pro" },
      maxRedirects: 0,
    });
    // The proxy default-denies: no session cookie → redirected to login, not 200.
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login");
  });

  test("the free plan is not purchasable", async ({ page }) => {
    const email = uniqueEmail("free-plan");
    await registerViaApi(page.request, email);
    await loginAs(page, email);

    // Free has no price id by construction, so it falls out of `purchasablePlan`
    // before any provider call — a 404, because the request is well-formed and
    // the resource simply does not exist.
    const res = await page.request.post("/api/billing/checkout", { data: { plan: "free" } });
    expect(res.status()).toBe(404);
  });

  test("an unknown plan is rejected as invalid input", async ({ page }) => {
    const email = uniqueEmail("bad-plan");
    await registerViaApi(page.request, email);
    await loginAs(page, email);

    // Constrained by the zod enum at the boundary (spec 22.2) → 422, not 404:
    // this request is malformed, not pointing at a missing resource.
    const res = await page.request.post("/api/billing/checkout", { data: { plan: "enterprise" } });
    expect(res.status()).toBe(422);
  });
});

test.describe("checkout authorization (spec 4.2 → 5.3)", () => {
  test("a member cannot start checkout for the organization", async ({ page }) => {
    const owner = uniqueEmail("bill-owner");
    const member = uniqueEmail("bill-member");
    await registerViaApi(page.request, owner);
    await registerViaApi(page.request, member);
    const { subdomain } = await seedOrg(page.request, {
      ownerEmail: owner,
      name: "Checkout Co",
      slug: uniqueId("checkout-co"),
      members: [{ email: member, role: "member" }],
    });

    await loginToAcademy(page, subdomain, member, TEST_PASSWORD);
    // The academy comes from the HOST now (F4.6), so this posts to its own origin
    // and carries no tenant field at all.
    const res = await page.request.post(tenantUrl(subdomain, "/api/billing/checkout"), {
      data: { plan: "pro" },
    });
    expect(res.status()).toBe(403);
  });

  /**
   * Pins the owner-only decision documented in `features/rbac/index.ts`: an Admin
   * manages people and settings but may not spend the organization's money. If
   * `billing.manage` is ever widened to admins, this test is the thing that says
   * so out loud rather than letting it happen quietly.
   */
  test("an admin cannot start checkout — billing.manage is owner-only", async ({ page }) => {
    const owner = uniqueEmail("bill-owner2");
    const admin = uniqueEmail("bill-admin");
    await registerViaApi(page.request, owner);
    await registerViaApi(page.request, admin);
    const { subdomain } = await seedOrg(page.request, {
      ownerEmail: owner,
      name: "Admin Checkout Co",
      slug: uniqueId("admin-checkout-co"),
      members: [{ email: admin, role: "admin" }],
    });

    await loginToAcademy(page, subdomain, admin, TEST_PASSWORD);
    // The academy comes from the HOST now (F4.6), so this posts to its own origin
    // and carries no tenant field at all.
    const res = await page.request.post(tenantUrl(subdomain, "/api/billing/checkout"), {
      data: { plan: "pro" },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("customer portal (spec 5.5)", () => {
  test("a tenant that never checked out has no portal", async ({ page }) => {
    const owner = uniqueEmail("portal-owner");
    await registerViaApi(page.request, owner);
    const { subdomain } = await seedOrg(page.request, {
      ownerEmail: owner,
      name: "Portal Co",
      slug: uniqueId("portal-co"),
    });

    await loginToAcademy(page, subdomain, owner, TEST_PASSWORD);
    // Resolved from our own table before any provider call: no mapping → 404,
    // rather than creating a customer just to show an empty portal.
    const res = await page.request.post(tenantUrl(subdomain, "/api/billing/portal"), { data: {} });
    expect(res.status()).toBe(404);
  });

  test("a member cannot open the organization's portal", async ({ page }) => {
    const owner = uniqueEmail("portal-owner2");
    const member = uniqueEmail("portal-member");
    await registerViaApi(page.request, owner);
    await registerViaApi(page.request, member);
    const { subdomain } = await seedOrg(page.request, {
      ownerEmail: owner,
      name: "Portal Guard Co",
      slug: uniqueId("portal-guard-co"),
      members: [{ email: member, role: "member" }],
    });

    await loginToAcademy(page, subdomain, member, TEST_PASSWORD);
    const res = await page.request.post(tenantUrl(subdomain, "/api/billing/portal"), { data: {} });
    // 403 before the "no customer" 404: authorization is decided first, so the
    // response cannot be used to probe whether the org has ever paid.
    expect(res.status()).toBe(403);
  });
});

/**
 * THE LOAD-BEARING GUARANTEE of spec 5.3: the success redirect confirms, the
 * webhook entitles. A user can close the tab before ever being redirected, so if
 * landing on the success URL granted access, every abandoned-but-paid checkout
 * would be unentitled — and worse, anyone could type the URL.
 */
test("access follows the webhook, not the success redirect", async ({ page, request }) => {
  const owner = uniqueEmail("redirect-owner");
  await registerViaApi(request, owner);
  const { slug, subdomain } = await seedOrg(request, {
    ownerEmail: owner,
    name: "Redirect Co",
    slug: uniqueId("redirect-co"),
  });
  const customerId = uniqueId("cus");
  const seeded = await request.post("/api/dev/seed-billing-customer", {
    data: { providerCustomerId: customerId, orgSlug: slug },
  });
  expect(seeded.ok(), `seed-billing-customer failed: ${await seeded.text()}`).toBe(true);

  await loginToAcademy(page, subdomain, owner, TEST_PASSWORD);

  // Walk the exact URL the provider would send the browser back to. Asserting
  // the status matters: `returnPath` in `features/billing/checkout.ts` builds
  // this URL, and a typo there would strand every paying customer on a 404 that
  // no other test would notice.
  const landed = await page.goto(
    tenantUrl(subdomain, "/dashboard/settings/billing?checkout=success"),
  );
  expect(landed?.status(), "the checkout return URL must resolve").toBe(200);
  await expect(page.getByRole("heading", { name: /billing/i })).toBeVisible();

  const afterRedirect = await billingState(request, slug);
  expect(
    afterRedirect.subscriptions,
    "the success redirect must not create a subscription",
  ).toHaveLength(0);

  // Now the provider actually tells us it happened.
  const subscriptionId = uniqueId("sub");
  const res = await request.post(
    "/api/billing/webhook",
    signedRequest(
      subscriptionEvent({
        eventId: uniqueId("evt"),
        customerId,
        subscriptionId,
        type: "customer.subscription.created",
        priceId: E2E_PRO_PRICE_ID,
      }),
    ),
  );
  expect(res.ok(), `webhook failed: ${await res.text()}`).toBe(true);

  const afterWebhook = await billingState(request, slug);
  expect(afterWebhook.subscriptions).toHaveLength(1);
  expect(afterWebhook.subscriptions[0]?.providerSubscriptionId).toBe(subscriptionId);
  expect(afterWebhook.subscriptions[0]?.planId).toBe("pro");
});
