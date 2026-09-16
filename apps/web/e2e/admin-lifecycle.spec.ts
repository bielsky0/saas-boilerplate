import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerViaApi, seedSuperAdmin, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §6.2/§11.3 — account suspension and soft deletion, and their audit trail.
 */

test("suspending an account blocks sign-in, and reactivating restores it", async ({
  page,
  request,
  browser,
}) => {
  const adminEmail = uniqueEmail("superadmin");
  const targetEmail = uniqueEmail("suspend-target");
  await registerViaApi(request, adminEmail);
  await registerViaApi(request, targetEmail);
  await seedSuperAdmin(request, adminEmail);

  await page.goto("/login");
  await loginViaUi(page, adminEmail, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  await page.goto(`/admin/users?q=${encodeURIComponent(targetEmail)}`);
  await page.getByRole("link", { name: targetEmail }).click();
  await page.waitForURL("**/admin/users/**");

  await page.getByLabel(/suspension reason/i).fill("E2E abuse test");
  await page.getByRole("button", { name: /^suspend$/i }).click();
  await expect(page.getByText(/suspended/i).first()).toBeVisible();

  // The suspended user cannot sign in — in a clean browser context, so this tests
  // the real sign-in path rather than a stale cookie.
  const suspendedContext = await browser.newContext();
  const suspendedPage = await suspendedContext.newPage();
  await suspendedPage.goto("/login");
  await loginViaUi(suspendedPage, targetEmail, TEST_PASSWORD);
  await expect(suspendedPage.getByText(/suspended/i)).toBeVisible();
  await expect(suspendedPage).toHaveURL(/\/login/);
  await suspendedContext.close();

  // The audit trail records it, attributed to the admin.
  await page.goto(`/admin/audit?q=${encodeURIComponent(targetEmail)}`);
  await expect(page.getByRole("row").filter({ hasText: "user.suspend" })).toContainText(adminEmail);

  // Reactivate → sign-in works again.
  await page.goto(`/admin/users?q=${encodeURIComponent(targetEmail)}`);
  await page.getByRole("link", { name: targetEmail }).click();
  await page.getByRole("button", { name: /reactivate/i }).click();
  await expect(page.getByText(/^active$/i).first()).toBeVisible();

  const restoredContext = await browser.newContext();
  const restoredPage = await restoredContext.newPage();
  await restoredPage.goto("/login");
  await loginViaUi(restoredPage, targetEmail, TEST_PASSWORD);
  await restoredPage.waitForURL("**/dashboard");
  await restoredContext.close();
});

/**
 * Soft delete (spec 11.3) must kill a LIVE session, not just block future sign-ins.
 * That is the `getSession` null path — the structural guard that makes correctness
 * independent of the session-revoke call succeeding.
 */
test("soft-deleting an account ends its live session on the next request", async ({
  page,
  request,
  browser,
}) => {
  const adminEmail = uniqueEmail("superadmin");
  const targetEmail = uniqueEmail("delete-target");
  await registerViaApi(request, adminEmail);
  await registerViaApi(request, targetEmail);
  await seedSuperAdmin(request, adminEmail);

  // The target is signed in and browsing BEFORE the deletion.
  const victimContext = await browser.newContext();
  const victimPage = await victimContext.newPage();
  await victimPage.goto("/login");
  await loginViaUi(victimPage, targetEmail, TEST_PASSWORD);
  await victimPage.waitForURL("**/dashboard");

  await page.goto("/login");
  await loginViaUi(page, adminEmail, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  await page.goto(`/admin/users?q=${encodeURIComponent(targetEmail)}`);
  await page.getByRole("link", { name: targetEmail }).click();
  await page.waitForURL("**/admin/users/**");
  await page.getByRole("button", { name: /^delete$/i }).click();
  await page.getByRole("button", { name: /delete account/i }).click();
  await expect(page.getByText(/^deleted$/i).first()).toBeVisible();

  // The victim's existing session is dead on their very next navigation.
  await victimPage.goto("/dashboard");
  await victimPage.waitForURL(/\/login/);
  await victimContext.close();

  await page.goto(`/admin/audit?q=${encodeURIComponent(targetEmail)}`);
  await expect(page.getByRole("row").filter({ hasText: "user.delete" })).toContainText(adminEmail);
});

test("an admin cannot suspend or delete their own account", async ({ page, request }) => {
  const adminEmail = uniqueEmail("superadmin");
  await registerViaApi(request, adminEmail);
  await seedSuperAdmin(request, adminEmail);

  await page.goto("/login");
  await loginViaUi(page, adminEmail, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  await page.goto(`/admin/users?q=${encodeURIComponent(adminEmail)}`);
  await page.getByRole("link", { name: adminEmail }).click();
  await page.waitForURL("**/admin/users/**");

  // Cosmetic gating: none of the self-destructive controls are offered. The
  // actions re-check server-side regardless (spec 4.2).
  await expect(page.getByRole("button", { name: /^suspend$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /revoke super admin/i })).toHaveCount(0);
});
