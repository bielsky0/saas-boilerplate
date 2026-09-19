import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerViaApi, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §2.5 — an unauthenticated request to a protected route redirects to
 * /login carrying the target, and after login the user lands back on the
 * originally requested page (redirect-back).
 *
 * Faza 3.4: the proxy no longer guards sessions — auth resolves in the render
 * (`requireSession` → `GET /v1/session` through `@/lib/api`). The redirect
 * below comes from the dashboard's server component, so the callback is the
 * unprefixed path the component passed (`/dashboard`); the proxy's locale
 * redirect then prefixes only the login destination, preserving the search.
 */
test("protected route redirects to login and returns after sign-in", async ({ page, request }) => {
  const email = uniqueEmail("redirect");
  // Seed an account in a separate request context (does not touch the browser).
  await registerViaApi(request, email);

  // Fresh browser context (this `page`) has no session.
  //
  // Two hops, both asserted by the final URL: `/dashboard` first gains the
  // negotiated locale prefix (§16) on the way to the render, then the render's
  // `requireSession("/dashboard")` sends it to login. The callback keeps the
  // component-passed (unprefixed) path; redirect-back re-enters through the
  // locale redirect, so the user still lands in the language they were reading.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/en\/login\?callbackUrl=%2Fdashboard$/);

  await loginViaUi(page, email, TEST_PASSWORD);

  // Redirect-back to the originally requested page (the personal dashboard).
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Personal" })).toBeVisible();
});
