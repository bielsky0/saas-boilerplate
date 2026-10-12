import { expect, test } from "@playwright/test";

import { apiUrl, loginAsFreshUser, uniqueEmail } from "./helpers";

/**
 * Etap 4, faza 4 — own profile settings (`PATCH /v1/profile`).
 *
 * Name change round-trips through the API and the session-backed header
 * refreshes via invalidation; client and server validation share rules.
 * Profile is personal, not org-scoped — these run in every tenancy mode.
 */

test("display name change persists and reflects in the header", async ({ page, request }) => {
  const email = uniqueEmail("profile");
  await loginAsFreshUser(page, request, "profile", email);
  await page.goto("/en/settings/profile");

  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  const name = page.getByLabel("Display name");
  await expect(name).toHaveValue("E2E User");

  await name.fill("Renamed User");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile updated")).toBeVisible();

  // Header profile menu re-read the session through invalidation.
  await page.getByRole("button", { name: /^Profile:/ }).click();
  await expect(page.getByRole("menu").getByText("Renamed User")).toBeVisible();
});

test("empty name is rejected client-side", async ({ page, request }) => {
  const email = uniqueEmail("profile-empty");
  await loginAsFreshUser(page, request, "profile", email);
  await page.goto("/en/settings/profile");

  // RHF validates on submit: clearing + saving surfaces the translated rule.
  await page.getByLabel("Display name").fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter your display name")).toBeVisible();
});

test("polish labels render under /pl", async ({ page, request }) => {
  const email = uniqueEmail("profile-pl");
  await loginAsFreshUser(page, request, "profile", email);
  await page.goto("/pl/settings/profile");

  await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
  await expect(page.getByLabel("Nazwa wyświetlana")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zapisz" })).toBeVisible();
});

test("profile page issues no CSP violations or failed API requests", async ({ page, request }) => {
  const email = uniqueEmail("profile-csp");
  await loginAsFreshUser(page, request, "profile", email);

  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/content-security-policy/i.test(msg.text())) violations.push(msg.text());
  });
  page.on("pageerror", (err) => violations.push(String(err)));
  const failed: string[] = [];
  page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()}`));

  await page.goto("/en/settings/profile");
  await expect(page.getByLabel("Display name")).toBeVisible();

  expect(violations).toEqual([]);
  const apiOrigin = new URL(apiUrl("/v1/health")).origin;
  expect(failed.filter((url) => url.startsWith(apiOrigin))).toEqual([]);
});
