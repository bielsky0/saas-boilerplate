import { expect, test } from "./rate-limit-fixtures";

import { loginToAcademy, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";
import { tenantUrl } from "./host-fixtures";

/**
 * Spec §3.5 / §1.3 / §2.19 exception #5 — the active academy comes from the HOST,
 * and each one is a separate authentication.
 *
 * ─── What this replaced, and why it is not simply deleted (F4.6) ────────────
 *
 * This was `context-switch.spec.ts`, which drove the account switcher. That
 * control is gone: an academy is a separate origin now, not a context you swap
 * inside one session. But the switcher was only half of what the old test
 * asserted — the other half was that the data follows the active tenant, which
 * is §1.3 and is MORE load-bearing than before, not less. Deleting the file
 * would have taken that assertion with it, and cross-tenant leakage is otherwise
 * covered only obliquely (org-audit-trail, storage-isolation).
 *
 * So the mechanism changed and the claim did not: one user, two academies, each
 * host showing only its own members.
 *
 * ⚠️ USES `sharedRequest`-style browser navigation deliberately. The isolation
 * being tested is the browser's cookie host-scoping, so both academies are driven
 * through the same `page` (one cookie jar). A fresh API context per academy would
 * make this pass for the wrong reason.
 */
test("each academy host shows only its own members, and needs its own sign-in", async ({
  page,
  request,
}) => {
  const user = uniqueEmail("multi");
  const alphaMember = uniqueEmail("alpha");
  const betaMember = uniqueEmail("beta");
  await registerViaApi(request, user);
  await registerViaApi(request, alphaMember);
  await registerViaApi(request, betaMember);

  const { subdomain: alpha } = await seedOrg(request, {
    ownerEmail: user,
    name: "Alpha",
    members: [{ email: alphaMember, role: "member" }],
  });
  const { subdomain: beta } = await seedOrg(request, {
    ownerEmail: user,
    name: "Beta",
    members: [{ email: betaMember, role: "member" }],
  });

  // Signing in at Alpha does NOT carry to Beta. This is the §2.19 exception #5
  // guarantee stated as a test: the cookie is host-scoped, so the second academy
  // is an entirely separate authentication even for the same person.
  await loginToAcademy(page, alpha, user, TEST_PASSWORD);

  const betaBeforeLogin = await page.goto(tenantUrl(beta, "/dashboard/members"));
  expect(betaBeforeLogin?.url(), "an Alpha session must not authenticate Beta").toContain("/login");

  // Back to Alpha: its own members, and none of Beta's.
  await page.goto(tenantUrl(alpha, "/dashboard/members"));
  await expect(page.getByText(alphaMember)).toBeVisible();
  await expect(page.getByText(betaMember)).toHaveCount(0);

  // Now authenticate into Beta separately and confirm the data follows the host.
  await loginToAcademy(page, beta, user, TEST_PASSWORD);
  await page.goto(tenantUrl(beta, "/dashboard/members"));
  await expect(page.getByText(betaMember)).toBeVisible();
  await expect(page.getByText(alphaMember)).toHaveCount(0);

  // And Alpha still works — the two sessions coexist rather than replacing one
  // another, which is what makes this a directory of installations and not a
  // switcher (D40 closed the same point for parent sessions in F4.5).
  await page.goto(tenantUrl(alpha, "/dashboard/members"));
  await expect(page.getByText(alphaMember)).toBeVisible();
});
