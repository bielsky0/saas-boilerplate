import { expect, test } from "./rate-limit-fixtures";
import { tenantUrl } from "./host-fixtures";

import { loginToAcademy, loginViaUi, registerViaApi, TEST_PASSWORD, uniqueEmail } from "./helpers";

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
  // Required with no default (langlion Constraint 5). Reusing the unique slug as
  // the subdomain keeps parallel workers off each other's UNIQUE constraint.
  await page.getByLabel("Subdomain").fill(slug);
  await page.getByRole("button", { name: /create organization/i }).click();
  // Back to the APEX dashboard, not into the new academy (F4.6): the staff
  // cookie is host-scoped, so redirecting into `{subdomain}` would land on a
  // login screen seconds after signing in. The directory confirms it exists.
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("link", { name: "Last Owner Co" })).toBeVisible();

  // Entering the academy is a separate sign-in, by design (§2.19 exception #5).
  await loginToAcademy(page, slug, owner, TEST_PASSWORD);
  await page.goto(tenantUrl(slug, "/dashboard/members"));
  const row = page.getByRole("row").filter({ hasText: owner });
  await expect(row).toBeVisible();

  // Attempt to demote self to member → blocked. The role control is a Radix
  // Select (a combobox button + a portaled listbox), not a native <select>.
  await row.getByRole("combobox").click();
  await page.getByRole("option", { name: "Member" }).click();
  await row.getByRole("button", { name: /save/i }).click();
  await expect(row.getByText(/keep at least one owner/i)).toBeVisible();

  // Attempt to remove self → blocked. Removal is confirmed in a dialog first.
  await row.getByRole("button", { name: /^remove$/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /remove member/i })
    .click();
  await expect(row.getByText(/can't remove the last owner/i)).toBeVisible();

  // Still an owner after both attempts. §16 translated the role label, so the
  // badge now reads "Owner" — and so do the role SELECT's value and option, which
  // is why this scopes to the read-only badge CELL (accessible name exactly
  // "Owner") rather than the row: "Owner" appears three times in the row now.
  await page.reload();
  const rowAfter = page.getByRole("row").filter({ hasText: owner });
  await expect(rowAfter.getByRole("cell", { name: "Owner", exact: true })).toBeVisible();
});
