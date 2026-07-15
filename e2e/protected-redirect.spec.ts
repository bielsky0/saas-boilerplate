import { expect, test } from "@playwright/test";

import { loginViaUi, registerViaApi, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §2.5 — an unauthenticated request to a protected route redirects to
 * /login carrying the target, and after login the user lands back on the
 * originally requested page (redirect-back).
 */
test("protected route redirects to login and returns after sign-in", async ({ page, request }) => {
  const email = uniqueEmail("redirect");
  // Seed an account in a separate request context (does not touch the browser).
  await registerViaApi(request, email);

  // Fresh browser context (this `page`) has no session.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard$/);

  await loginViaUi(page, email, TEST_PASSWORD);

  // Redirect-back to the originally requested page.
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
