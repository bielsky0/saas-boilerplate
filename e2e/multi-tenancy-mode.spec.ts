import { expect, test } from "./rate-limit-fixtures";
import { tenantUrl } from "./host-fixtures";

import { loginViaUi, registerAndVerify, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";
import { TENANCY_MODE } from "./tenancy-fixtures";

/**
 * Spec §1.4 — configurable multi-tenancy.
 *
 * This file runs in BOTH CI legs and branches on the mode, rather than being
 * disabled-only: the `required` branch is free regression coverage that adding
 * the flag did not change the default behaviour, asserted by the same file that
 * asserts the change.
 *
 * The central claim under test is that the flag is COSMETIC — it hides the org
 * layer, it does not touch the data model. The strongest assertion here is the
 * seed-then-404 pair: an organization is created through the real data layer
 * while the mode is `disabled`, and its own owner gets a 404. Data present, UI
 * hidden, no migration in either direction.
 */

test.describe("tenancy mode: required", () => {
  test.skip(TENANCY_MODE !== "required", "only meaningful in the default mode");

  test("organizations are offered and reachable", async ({ page, request }) => {
    const email = uniqueEmail("tenancy-req");
    await registerAndVerify(request, email);

    await page.goto("/login");
    await loginViaUi(page, email, TEST_PASSWORD);
    await page.waitForURL("**/dashboard");

    // The account switcher was removed in F4.6 (§2.19 exception #5); what
    // advertises organizations in `required` mode is now the create button on the
    // apex dashboard. Same claim as before — the mode is exposed — asserted
    // against the control that actually exists.
    await expect(page.getByRole("link", { name: /new organization/i })).toBeVisible();

    // And the route actually serves.
    const res = await page.goto("/orgs/new");
    expect(res?.status()).toBe(200);
    await expect(page.getByLabel("Organization name")).toBeVisible();
  });

  // Heading role, not getByText: the hero subtitle also says "multi-tenancy", so
  // a bare text match is a strict-mode violation rather than an assertion.
  test("landing page advertises multi-tenancy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Multi-tenancy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personal workspace" })).toHaveCount(0);
  });
});

test.describe("tenancy mode: disabled", () => {
  test.skip(TENANCY_MODE !== "disabled", "only meaningful with organizations off");

  test("org UI is hidden but the personal context still works", async ({ page, request }) => {
    const email = uniqueEmail("tenancy-off");
    await registerAndVerify(request, email);

    await page.goto("/login");
    await loginViaUi(page, email, TEST_PASSWORD);
    await page.waitForURL("**/dashboard");

    // No switcher, no creation CTA — nothing hints organizations exist.
    await expect(page.getByRole("button", { name: "Switch account" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /new organization/i })).toHaveCount(0);

    // The tenant layer is intact: this is B2C, not a broken app. The personal
    // account is still resolving owners for the features that depend on it.
    await expect(page.getByRole("button", { name: /notifications/i })).toBeVisible();
    const prefs = await page.goto("/settings/notifications");
    expect(prefs?.status()).toBe(200);
  });

  test("org routes 404 while org data survives untouched", async ({ page, request }) => {
    const email = uniqueEmail("tenancy-off-data");
    await registerAndVerify(request, email);

    // THE CENTRAL ASSERTION (§1.4, "kosmetyczna zmiana" + "zero migracji"): the
    // data layer still creates and stores an organization perfectly well while
    // the mode is disabled — it is only the UI that is gone.
    const { subdomain } = await seedOrg(request, { ownerEmail: email, name: "Ghost Team" });

    await page.goto("/login");
    await loginViaUi(page, email, TEST_PASSWORD);
    await page.waitForURL("**/dashboard");

    // ...and its own OWNER cannot reach it, on the academy's own host.
    const orgRes = await page.goto(tenantUrl(subdomain, "/dashboard"));
    expect(orgRes?.status()).toBe(404);

    const newRes = await page.goto("/orgs/new");
    expect(newRes?.status()).toBe(404);

    // Invitation links already in flight are dead too (§3.3 landing page).
    const inviteRes = await page.goto("/invitations/any-token-at-all");
    expect(inviteRes?.status()).toBe(404);
  });

  test("landing page does not advertise organizations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Personal workspace" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Multi-tenancy" })).toHaveCount(0);
    // The hero swaps too — a public page must not promise teams the app hides.
    await expect(page.getByText(/multi-tenancy/i)).toHaveCount(0);
  });
});
