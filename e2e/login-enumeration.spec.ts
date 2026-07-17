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

/**
 * The same guarantee, in another language (spec 2.1 + 16.1).
 *
 * The English test above cannot catch the failure that §16 introduces. Once the
 * message is a translation, "wrong password" and "no such account" could diverge
 * in ANY language — and the suite is pinned to en-US (playwright.config.ts), so a
 * Polish-only divergence would ship silently.
 *
 * The real defence is structural: both branches reference ONE key,
 * `auth.errors.invalidCredentials`, so there is a single string to translate and
 * nothing to pull apart (see features/auth/actions.ts's header). This test does
 * not add safety so much as make that invariant VISIBLE — if someone "helpfully"
 * splits the key into two, this fails and says why.
 */
test("the neutral login error holds in every language, not just English", async ({
  page,
  request,
}) => {
  const realEmail = uniqueEmail("enum-pl");
  await registerViaApi(request, realEmail);
  const formError = page.locator('p[role="alert"]');

  // Filled via the POLISH labels rather than `loginViaUi`, which is hard-coded to
  // the English ones. That is not a workaround — it means this test also fails if
  // the form itself stops being translated, which is the other half of the claim.
  async function failedLogin(email: string) {
    await page.goto("/pl/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Hasło").fill("WrongPassword9");
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    return formError.textContent();
  }

  const wrongPwError = await failedLogin(realEmail);
  const noUserError = await failedLogin(uniqueEmail("enum-pl-ghost"));

  // Actually Polish — otherwise this would pass trivially against two English
  // strings and prove nothing about translations.
  expect(wrongPwError).toBe("Nieprawidłowy e-mail lub hasło.");
  expect(noUserError, "the two branches must stay indistinguishable in pl too").toBe(wrongPwError);
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
