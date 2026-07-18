import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §3.5 / §1.3 — switching context filters data by tenant. A user in two orgs
 * sees each org's own members and never the other's; the active tenant comes from
 * the URL, and switching via the account switcher navigates between them.
 */
test("switching org context filters members by tenant", async ({ page, request }) => {
  const user = uniqueEmail("multi");
  const alphaMember = uniqueEmail("alpha");
  const betaMember = uniqueEmail("beta");
  await registerViaApi(request, user);
  await registerViaApi(request, alphaMember);
  await registerViaApi(request, betaMember);

  const alphaSlug = await seedOrg(request, {
    ownerEmail: user,
    name: "Alpha",
    members: [{ email: alphaMember, role: "member" }],
  });
  const betaSlug = await seedOrg(request, {
    ownerEmail: user,
    name: "Beta",
    members: [{ email: betaMember, role: "member" }],
  });

  await page.goto("/login");
  await loginViaUi(page, user, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  // The theme toggle is also a menu button, so target the switcher by its label.
  const switcher = page.getByRole("button", { name: "Switch account" });

  // Switch to Alpha via the account switcher.
  await switcher.click();
  await page.getByRole("menuitem", { name: "Alpha" }).click();
  await page.waitForURL(`**/orgs/${alphaSlug}`);

  await page.goto(`/orgs/${alphaSlug}/members`);
  await expect(page.getByText(alphaMember)).toBeVisible();
  await expect(page.getByText(betaMember)).toHaveCount(0);

  // Switch to Beta and confirm the members list changes accordingly.
  await switcher.click();
  await page.getByRole("menuitem", { name: "Beta" }).click();
  await page.waitForURL(`**/orgs/${betaSlug}`);

  await page.goto(`/orgs/${betaSlug}/members`);
  await expect(page.getByText(betaMember)).toBeVisible();
  await expect(page.getByText(alphaMember)).toHaveCount(0);
});
