import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";
import { tenantOrigin, tenantUrl } from "./host-fixtures";

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
  //
  // Two hops, both asserted by the final URL: `/dashboard` first gains the
  // negotiated locale prefix (§16), then the guard sends it to login. The
  // callbackUrl KEEPS the prefix, which is what makes redirect-back return the
  // user to the language they were reading.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/en\/login\?callbackUrl=%2Fen%2Fdashboard$/);

  await loginViaUi(page, email, TEST_PASSWORD);

  // Redirect-back to the originally requested page (the personal dashboard).
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Personal" })).toBeVisible();
});

/**
 * The same guard on an ACADEMY host (F4.6).
 *
 * `/dashboard` is `stage: "both"` — the personal account on the apex, an
 * academy's panel on its own host — so the guard has to hold on both. The apex
 * half is the test above; this is the half that did not exist before the panel
 * moved.
 *
 * ⚠️ THE REDIRECT MUST STAY ON THE ACADEMY'S HOST. It is built with
 * `new URL(…, request.url)` precisely so it follows the incoming Host; sending
 * the user to the apex login would mint a cookie that is never sent back here
 * (§2.19 exception #5), which is a login loop with nothing in it saying why.
 */
test("an academy panel redirects to login ON THAT HOST", async ({ page, request }) => {
  const owner = uniqueEmail("tenant-redirect");
  await registerViaApi(request, owner);
  const { subdomain } = await seedOrg(request, { ownerEmail: owner, name: "Redirect Academy" });

  await page.goto(tenantUrl(subdomain, "/dashboard"));

  const url = new URL(page.url());
  expect(url.host, "the login page must be the academy's own").toBe(
    new URL(tenantOrigin(subdomain)).host,
  );
  expect(url.pathname).toBe("/en/login");
  expect(url.searchParams.get("callbackUrl")).toBe("/en/dashboard");

  // And signing in here reaches the academy's panel, not the personal one.
  //
  // The explicit navigation is the same one `loginToAcademy` performs, and for
  // the same documented reason: the landing produced by the sign-in Server Action
  // bypasses the proxy, so the tenant is not resolved on that first render. See
  // the note on `loginToAcademy` in e2e/helpers.ts.
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL(`${tenantOrigin(subdomain)}/**/dashboard`);
  await page.goto(tenantUrl(subdomain, "/dashboard"));
  await expect(page.getByRole("heading", { name: "Redirect Academy" })).toBeVisible();
});
