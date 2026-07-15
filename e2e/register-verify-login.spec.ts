import { expect, test } from "@playwright/test";

import { getVerificationLink, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §2.1 — registration, email verification (token + link), and the verified
 * session landing on a protected route. Uses the dev email outbox to read the
 * verification link.
 */
test("register → verify email → reach protected dashboard", async ({ page, request }) => {
  const email = uniqueEmail("register");

  // Register through the UI.
  await page.goto("/signup");
  await page.getByLabel("Name (optional)").fill("New User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();

  // Neutral "check your inbox" screen.
  await page.waitForURL("**/verify-email?status=sent");
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  // Retrieve and open the verification link → verifies + auto sign-in → dashboard.
  const link = await getVerificationLink(request, email);
  await page.goto(link);
  await page.waitForURL("**/dashboard");

  await expect(page.getByText(`Signed in as`)).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  // Verified users do not see the reminder banner.
  await expect(page.getByText(/please verify your email/i)).toHaveCount(0);
});
