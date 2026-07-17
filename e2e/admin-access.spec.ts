import { expect, test } from "@playwright/test";

import {
  loginViaUi,
  registerViaApi,
  seedOrg,
  seedSuperAdmin,
  TEST_PASSWORD,
  uniqueEmail,
} from "./helpers";

/**
 * Spec §6.1 — the admin panel is reachable only with the system-level super-admin
 * flag, which is independent of every organization role.
 *
 * Acceptance criterion 1: "a regular user (even an org Owner) has no access to any
 * admin panel route".
 */

const ADMIN_ROUTES = ["/admin", "/admin/users", "/admin/organizations", "/admin/audit"];

test("an org owner has no access to any admin panel route", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  await registerViaApi(request, owner);
  // Being Owner of an org is the strongest ORG role there is — and it must still
  // grant nothing here. That is the whole point of §6.1's "rola systemowa".
  await seedOrg(request, { ownerEmail: owner, name: "Admin Access Co" });

  await page.goto("/login");
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  for (const path of ADMIN_ROUTES) {
    const resp = await page.goto(path);
    expect(resp?.status(), `${path} must be a real 403`).toBe(403);
  }
  await expect(page.getByText(/access denied/i)).toBeVisible();
});

/**
 * POSITIVE CONTROL. Without this, a typo in a route path would make the test above
 * pass for entirely the wrong reason — a route that does not exist denies everyone.
 */
test("a super admin reaches the admin panel", async ({ page, request }) => {
  const admin = uniqueEmail("superadmin");
  await registerViaApi(request, admin);
  await seedSuperAdmin(request, admin);

  await page.goto("/login");
  await loginViaUi(page, admin, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  for (const path of ADMIN_ROUTES) {
    const resp = await page.goto(path);
    expect(resp?.status(), `${path} must be reachable for a super admin`).toBe(200);
  }
  await expect(page.getByRole("heading", { name: /audit log/i })).toBeVisible();
});

test("an anonymous request to the admin panel is redirected to login", async ({ page }) => {
  await page.goto("/admin/users");
  // The panel lives under `[locale]` like every other page, so the guard's
  // redirect carries the prefix on both the destination and the callback.
  await page.waitForURL("**/en/login?callbackUrl=%2Fen%2Fadmin%2Fusers");
});

/**
 * The auth engine's admin plugin mounts /api/auth/admin/* — a second path to
 * impersonate/ban/delete that would bypass our server actions and therefore the
 * audit log (spec 6.3). It is closed in the catch-all route; this proves it stays
 * closed.
 */
test("the auth engine's admin HTTP surface is not exposed", async ({ request }) => {
  const resp = await request.post("/api/auth/admin/impersonate-user", {
    data: { userId: "anything" },
    failOnStatusCode: false,
  });
  expect(resp.status()).toBe(404);

  const listResp = await request.get("/api/auth/admin/list-users", { failOnStatusCode: false });
  expect(listResp.status()).toBe(404);
});
