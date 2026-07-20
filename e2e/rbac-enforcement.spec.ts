import { expect, test } from "./rate-limit-fixtures";

import { loginToAcademy, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";
import { tenantUrl } from "./host-fixtures";

/**
 * Spec §4.2 — authorization is enforced on the backend. A Member reaching an
 * Owner/Admin-only route directly gets a real 403 (via `forbidden()`), regardless
 * of the UI hiding the link. A non-member gets 403 on the academy at all.
 *
 * Since F4.6 the panel lives on the academy's own host, so both users sign in
 * THERE rather than at the apex — the session cookie is host-scoped (§2.19
 * exception #5), and an apex session would simply bounce off the login guard.
 * Note the non-member test still reaches sign-in successfully: authenticating
 * into an academy and being authorized by it are separate questions, and this
 * asserts the second one answers 403.
 */
test("a member is denied owner-only routes with a 403", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  const member = uniqueEmail("member");
  await registerViaApi(request, owner);
  await registerViaApi(request, member);
  const { subdomain } = await seedOrg(request, {
    ownerEmail: owner,
    name: "RBAC Co",
    members: [{ email: member, role: "member" }],
  });

  await loginToAcademy(page, subdomain, member, TEST_PASSWORD);

  // Settings is guarded by `organization.update` → 403 for a Member.
  const settingsResp = await page.goto(tenantUrl(subdomain, "/dashboard/settings"));
  expect(settingsResp?.status()).toBe(403);
  await expect(page.getByText(/access denied/i)).toBeVisible();

  // The members page is readable, but management controls are absent for a Member.
  const membersResp = await page.goto(tenantUrl(subdomain, "/dashboard/members"));
  expect(membersResp?.status()).toBe(200);
  await expect(page.getByRole("button", { name: /remove/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^save$/i })).toHaveCount(0);
});

test("a non-member is denied the academy with a 403", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  const outsider = uniqueEmail("outsider");
  await registerViaApi(request, owner);
  await registerViaApi(request, outsider);
  const { subdomain } = await seedOrg(request, { ownerEmail: owner, name: "Private Co" });

  await loginToAcademy(page, subdomain, outsider, TEST_PASSWORD);

  const resp = await page.goto(tenantUrl(subdomain, "/dashboard"));
  expect(resp?.status()).toBe(403);
});
