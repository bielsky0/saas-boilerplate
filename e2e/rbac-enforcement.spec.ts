import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §4.2 — authorization is enforced on the backend. A Member reaching an
 * Owner/Admin-only route directly gets a real 403 (via `forbidden()`), regardless
 * of the UI hiding the link. A non-member gets 403 on the org at all.
 */
test("a member is denied owner-only routes with a 403", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  const member = uniqueEmail("member");
  await registerViaApi(request, owner);
  await registerViaApi(request, member);
  const slug = await seedOrg(request, {
    ownerEmail: owner,
    name: "RBAC Co",
    members: [{ email: member, role: "member" }],
  });

  await page.goto("/login");
  await loginViaUi(page, member, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  // Settings is guarded by `organization.update` → 403 for a Member.
  const settingsResp = await page.goto(`/orgs/${slug}/settings`);
  expect(settingsResp?.status()).toBe(403);
  await expect(page.getByText(/access denied/i)).toBeVisible();

  // The members page is readable, but management controls are absent for a Member.
  const membersResp = await page.goto(`/orgs/${slug}/members`);
  expect(membersResp?.status()).toBe(200);
  await expect(page.getByRole("button", { name: /remove/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^save$/i })).toHaveCount(0);
});

test("a non-member is denied the org with a 403", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  const outsider = uniqueEmail("outsider");
  await registerViaApi(request, owner);
  await registerViaApi(request, outsider);
  const slug = await seedOrg(request, { ownerEmail: owner, name: "Private Co" });

  await page.goto("/login");
  await loginViaUi(page, outsider, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  const resp = await page.goto(`/orgs/${slug}`);
  expect(resp?.status()).toBe(403);
});
