import { expect, test } from "@playwright/test";

import { loginViaUi, registerViaApi, uniqueEmail } from "./helpers";

/**
 * Spec §2.1 — failed login must not reveal whether an email exists. A wrong
 * password on a real account and a login for a non-existent account must produce
 * the identical error, and a sign-up for an existing email must look the same as
 * a fresh sign-up.
 */
test("failed login does not reveal whether the email exists", async ({ page, request }) => {
  const realEmail = uniqueEmail("enum-real");
  await registerViaApi(request, realEmail);

  // The form's own error paragraph (not Next's route-announcer div).
  const formError = page.locator('p[role="alert"]');

  // Real account, wrong password.
  await page.goto("/login");
  await loginViaUi(page, realEmail, "WrongPassword9");
  await expect(formError).toHaveText("Invalid email or password.");
  const wrongPwError = await formError.textContent();

  // Non-existent account.
  await page.goto("/login");
  await loginViaUi(page, uniqueEmail("enum-ghost"), "WhateverPass9");
  await expect(formError).toHaveText("Invalid email or password.");
  const noUserError = await formError.textContent();

  // Identical signal in both cases.
  expect(noUserError).toBe(wrongPwError);
});

test("signing up an existing email looks identical to a fresh signup", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("enum-signup");
  await registerViaApi(request, email);

  // Re-registering the same email must NOT reveal that it already exists.
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Password123");
  await page.getByRole("button", { name: /create account/i }).click();

  await page.waitForURL("**/verify-email?status=sent");
  // Scope to the heading — /check your inbox/ also matches Next's route announcer.
  await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible();
});
