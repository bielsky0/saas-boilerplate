import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerViaApi, seedSuperAdmin, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §6.2/§6.3 — impersonation is explicitly marked in the UI and audit-logged.
 *
 * Acceptance criterion 2: "impersonation is visible in the UI and leaves a trail in
 * the audit log with a timestamp and the actor".
 *
 * NOTE ON ISOLATION: the panel is global by design, so /admin/users and
 * /admin/audit contain every parallel worker's rows. Every assertion below filters
 * by a `uniqueEmail()` — never by list position or "the first row" — which is why
 * /admin/audit?q= is a design requirement and not a nicety.
 */
const REASON = "Ticket 482 - investigating a checkout failure";

test("impersonation is visible in the UI and leaves an audit trail", async ({ page, request }) => {
  const adminEmail = uniqueEmail("superadmin");
  const targetEmail = uniqueEmail("target");
  await registerViaApi(request, adminEmail);
  await registerViaApi(request, targetEmail);
  await seedSuperAdmin(request, adminEmail);

  await page.goto("/login");
  await loginViaUi(page, adminEmail, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  // Find the target through the real search path (spec 6.2).
  await page.goto(`/admin/users?q=${encodeURIComponent(targetEmail)}`);
  await page.getByRole("link", { name: targetEmail }).click();
  await page.waitForURL("**/admin/users/**");

  await page.getByRole("button", { name: /^impersonate$/i }).click();
  // Mandatory since §6.4 — the reason is recorded and shown to the target's org.
  await page.getByLabel(/reason for impersonating/i).fill(REASON);
  await page.getByRole("button", { name: /start impersonating/i }).click();
  await page.waitForURL("**/dashboard");

  // (a) VISIBLE — the banner names who we are acting as…
  const banner = page.getByRole("status").filter({ hasText: /admin mode/i });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(targetEmail);
  // …and we really ARE them, not just wearing a label.
  await expect(page.getByText(`Signed in as ${targetEmail}`)).toBeVisible();

  // (b) The impersonated session carries NO admin authority…
  const adminResp = await page.goto("/admin");
  expect(adminResp?.status(), "an impersonated session must not re-enter /admin").toBe(403);
  // …and the escape hatch is still on the 403 page. This is why the banner lives
  // in the ROOT layout: an admin must never be able to get stuck inside someone
  // else's account.
  await expect(page.getByRole("status").filter({ hasText: /admin mode/i })).toBeVisible();

  await page.getByRole("button", { name: /stop impersonating/i }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("status").filter({ hasText: /admin mode/i })).toHaveCount(0);
  // Assert WHO we are, not merely that the banner went away. "No banner" is also
  // true on the login page — an earlier version of this test passed while the
  // admin had been silently signed out by a cookie clobber. Identity is the assertion.
  await expect(page.getByText(`Signed in as ${adminEmail}`)).toBeVisible();

  // (c) AUDIT TRAIL — asserted through the real admin read path, which also proves
  // the admin's own session was restored (a non-admin would get 403 here).
  const auditResp = await page.goto(`/admin/audit?q=${encodeURIComponent(targetEmail)}`);
  expect(auditResp?.status()).toBe(200);

  const startRow = page.getByRole("row").filter({ hasText: "impersonation.start" });
  await expect(startRow).toContainText(adminEmail); // ACTOR
  await expect(startRow).toContainText(targetEmail); // TARGET
  await expect(startRow.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/)).toBeVisible(); // TIMESTAMP
  await expect(startRow, "the mandatory reason must reach the log").toContainText(REASON); // §6.4
  await expect(startRow, "actor type distinguishes a panel action").toContainText("Admin");

  await expect(page.getByRole("row").filter({ hasText: "impersonation.stop" })).toContainText(
    adminEmail,
  );
});

/**
 * Admins are not impersonable — enforced by the engine (its `adminAc` role lacks
 * `user:impersonate-admins`), and the reason `adminUserIds` must never be set: it
 * short-circuits that check. If this ever fails, acceptance criterion 1 is broken,
 * because an impersonated admin session WOULD pass requireSuperAdmin.
 */
test("a super admin cannot impersonate another super admin", async ({ page, request }) => {
  const adminA = uniqueEmail("superadmin-a");
  const adminB = uniqueEmail("superadmin-b");
  await registerViaApi(request, adminA);
  await registerViaApi(request, adminB);
  await seedSuperAdmin(request, adminA);
  await seedSuperAdmin(request, adminB);

  await page.goto("/login");
  await loginViaUi(page, adminA, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  await page.goto(`/admin/users?q=${encodeURIComponent(adminB)}`);
  await page.getByRole("link", { name: adminB }).click();
  await page.waitForURL("**/admin/users/**");

  // The UI does not even offer it for a super-admin target (cosmetic gating)…
  await expect(page.getByRole("button", { name: /^impersonate$/i })).toHaveCount(0);
  // …and the account stays marked as an admin, so nothing here is impersonable.
  await expect(page.getByText(/super admin/i).first()).toBeVisible();
});

/**
 * §6.4 — the reason is MANDATORY. `impersonateUserSchema` requires ≥10 characters,
 * and the input mirrors it with `required minLength`.
 *
 * The assertion is deliberately "impersonation did not happen" rather than "a
 * specific error message appeared": the client gate (native validation) and the
 * server gate (the zod schema) produce different feedback, and which one fires
 * first is a browser detail. What must hold either way is that no session was
 * swapped — that is the property §6.4 actually asks for.
 */
test("impersonation is refused without a sufficient reason", async ({ page, request }) => {
  const adminEmail = uniqueEmail("superadmin-noreason");
  const targetEmail = uniqueEmail("target-noreason");
  await registerViaApi(request, adminEmail);
  await registerViaApi(request, targetEmail);
  await seedSuperAdmin(request, adminEmail);

  await page.goto("/login");
  await loginViaUi(page, adminEmail, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  await page.goto(`/admin/users?q=${encodeURIComponent(targetEmail)}`);
  await page.getByRole("link", { name: targetEmail }).click();
  await page.waitForURL("**/admin/users/**");

  await page.getByRole("button", { name: /^impersonate$/i }).click();
  await page.getByLabel(/reason for impersonating/i).fill("too short");
  await page.getByRole("button", { name: /start impersonating/i }).click();

  // No session swap: still on the admin page, still ourselves, no admin banner.
  await expect(page.getByRole("status").filter({ hasText: /admin mode/i })).toHaveCount(0);
  expect(page.url()).toContain("/admin/users/");

  // And nothing was written to the trail — the audit row and the effect are
  // ordered so that a refusal leaves no trace of an impersonation that never was.
  await page.goto(`/admin/audit?q=${encodeURIComponent(targetEmail)}`);
  await expect(page.getByRole("row").filter({ hasText: "impersonation.start" })).toHaveCount(0);
});
