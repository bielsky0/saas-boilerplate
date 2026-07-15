import { expect, test } from "@playwright/test";

import { loginViaUi, registerViaApi, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §3.2/§3.4 — an organization must always keep at least one Owner. The sole
 * Owner can neither demote themselves nor be removed; the action is blocked
 * server-side (transaction with a locked owner count), not just in the UI.
 */
test("the last owner cannot be demoted or removed", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  await registerViaApi(request, owner);

  await page.goto("/login");
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  // Create an org (creator becomes Owner) with a deterministic slug.
  const slug = `last-owner-${Date.now()}`;
  await page.goto("/orgs/new");
  await page.getByLabel("Organization name").fill("Last Owner Co");
  await page.getByLabel("Slug (optional)").fill(slug);
  await page.getByRole("button", { name: /create organization/i }).click();
  await page.waitForURL(`**/orgs/${slug}`);

  await page.goto(`/orgs/${slug}/members`);
  const row = page.getByRole("listitem").filter({ hasText: owner });
  await expect(row).toBeVisible();

  // Attempt to demote self to member → blocked.
  await row.getByRole("combobox").selectOption("member");
  await row.getByRole("button", { name: /save/i }).click();
  await expect(row.getByText(/keep at least one owner/i)).toBeVisible();

  // Attempt to remove self → blocked.
  await row.getByRole("button", { name: /remove/i }).click();
  await expect(row.getByText(/can't remove the last owner/i)).toBeVisible();

  // Still an owner after both attempts (the status label, not the <option>).
  await page.reload();
  const rowAfter = page.getByRole("listitem").filter({ hasText: owner });
  await expect(rowAfter.getByText("owner", { exact: true })).toBeVisible();
});
