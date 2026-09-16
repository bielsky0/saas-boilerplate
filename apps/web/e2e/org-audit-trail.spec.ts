import { expect, test } from "@playwright/test";

import { loginViaUi, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §6.4 — the organization-scoped audit trail.
 *
 * Four properties, in the order they matter:
 *   1. a tenant mutation reaches the trail, readable by the org's own admins;
 *   2. it carries the field-level before → after §6.4 asks for;
 *   3. a Member cannot read it (RBAC, §4.2);
 *   4. one org NEVER sees another's entries — the assertion that justifies making
 *      the ledger's owner column nullable rather than adding a second table.
 *
 * NOTE ON ISOLATION: the suite shares one database across parallel workers, and
 * `audit_log` now accumulates rows from every test in the run. Every assertion
 * below filters by a `uniqueEmail()` and asserts on a `.filter({ hasText })` row —
 * never on list position or "the first row". A test that asserted on row order
 * here would pass locally and flake in CI, which is the worst way to learn this.
 */

/** The audit page for an org, with an optional search filter. */
function auditUrl(slug: string, q?: string): string {
  return q
    ? `/orgs/${slug}/settings/audit?q=${encodeURIComponent(q)}`
    : `/orgs/${slug}/settings/audit`;
}

test("an org admin sees tenant mutations in their own audit trail", async ({ page, request }) => {
  const owner = uniqueEmail("audit-owner");
  const invitee = uniqueEmail("audit-invitee");
  await registerViaApi(request, owner);
  const slug = await seedOrg(request, { ownerEmail: owner, name: "Audit Co" });

  await page.goto("/login");
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  // Drive the REAL invite path, not a seeded row — the point is that the audit
  // write is wired into the action, not that the table can hold a row.
  await page.goto(`/orgs/${slug}/members`);
  await page.getByLabel("Email").fill(invitee);
  await page.getByLabel("Role", { exact: true }).click();
  await page.getByRole("option", { name: "Member" }).click();
  await page.getByRole("button", { name: /send invite/i }).click();
  await expect(page.getByText(/invitation sent to/i)).toBeVisible();

  await page.goto(auditUrl(slug, invitee));

  const row = page.getByRole("row").filter({ hasText: invitee });
  await expect(row, "the invitee is the target").toContainText(invitee);
  await expect(row, "the owner is the actor").toContainText(owner);
  await expect(row, "a human-acted change is actorType User").toContainText("User");
  await expect(
    row.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/),
    "timestamps render in full, never relative",
  ).toBeVisible();
});

test("a role change records the field-level before and after", async ({ page, request }) => {
  const owner = uniqueEmail("diff-owner");
  const member = uniqueEmail("diff-member");
  await registerViaApi(request, owner);
  await registerViaApi(request, member);
  const slug = await seedOrg(request, {
    ownerEmail: owner,
    name: "Diff Co",
    members: [{ email: member, role: "member" }],
  });

  await page.goto("/login");
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  await page.goto(`/orgs/${slug}/members`);
  const memberRow = page.getByRole("row").filter({ hasText: member });
  await memberRow.getByLabel(/member role/i).click();
  await page.getByRole("option", { name: "Admin" }).click();
  await memberRow.getByRole("button", { name: /^save$/i }).click();
  // Wait for the action to COMMIT before reading the trail. Navigating straight
  // to the audit page races the server action and reads an empty list — the audit
  // row lands a moment later, so the failure looks like "auditing is broken"
  // rather than "the test was early". Same reason the invite flows above wait for
  // their toast.
  await expect(page.getByText(/role updated/i)).toBeVisible();

  await page.goto(auditUrl(slug, member));

  // §6.4's "stara wartość → nowa wartość", asserted through the rendered page
  // rather than the column — a diff nobody can read is not an audit trail.
  const row = page.getByRole("row").filter({ hasText: member });
  await expect(row).toContainText("role");
  await expect(row).toContainText("member");
  await expect(row).toContainText("admin");
});

/**
 * The filter form is a plain GET whose `action` is built from the active locale.
 * A bare `action="/orgs/…/audit"` would drop the `[locale]` prefix on every
 * submit and bounce through a proxy redirect — invisible in English (where the
 * redirect lands on the same content) and wrong in every other language. This is
 * the one difference from /admin/audit, which is untranslated and can hard-code
 * its path, so it is worth an explicit assertion rather than trust.
 */
test("filtering preserves the locale prefix", async ({ page, request }) => {
  const owner = uniqueEmail("locale-owner");
  await registerViaApi(request, owner);
  const slug = await seedOrg(request, { ownerEmail: owner, name: "Locale Co" });

  await page.goto("/login");
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  await page.goto(`/pl/orgs/${slug}/settings/audit`);
  // Polish catalog, not a missing-message fallback or an English leak.
  await expect(page.getByRole("heading", { name: "Dziennik zmian" })).toBeVisible();

  await page.getByRole("searchbox").fill("member");
  await page.getByRole("button", { name: "Filtruj" }).click();

  await page.waitForURL(/\/pl\/orgs\/.*\/settings\/audit\?/);
  expect(page.url(), "the filter submit must not drop /pl/").toContain(`/pl/orgs/${slug}`);
  await expect(page.getByRole("heading", { name: "Dziennik zmian" })).toBeVisible();
});

test("a member cannot read the audit trail", async ({ page, request }) => {
  const owner = uniqueEmail("rbac-owner");
  const member = uniqueEmail("rbac-member");
  await registerViaApi(request, owner);
  await registerViaApi(request, member);
  const slug = await seedOrg(request, {
    ownerEmail: owner,
    name: "Rbac Audit Co",
    members: [{ email: member, role: "member" }],
  });

  await page.goto("/login");
  await loginViaUi(page, member, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");

  // Backend enforcement, not a hidden link: `audit.read` is granted to owner and
  // admin only, and the page calls requireOrgPermission as its first line.
  const resp = await page.goto(auditUrl(slug));
  expect(resp?.status()).toBe(403);
  await expect(page.getByText(/access denied/i)).toBeVisible();

  // …and the nav link is hidden too (cosmetic, per §4.2).
  await page.goto(`/orgs/${slug}`);
  await expect(page.getByRole("link", { name: /audit trail/i })).toHaveCount(0);
});

test("one organization never sees another's audit entries", async ({ page, request }) => {
  const ownerA = uniqueEmail("tenant-a-owner");
  const ownerB = uniqueEmail("tenant-b-owner");
  const inviteeB = uniqueEmail("tenant-b-invitee");
  await registerViaApi(request, ownerA);
  await registerViaApi(request, ownerB);
  const slugA = await seedOrg(request, { ownerEmail: ownerA, name: "Tenant A" });
  const slugB = await seedOrg(request, { ownerEmail: ownerB, name: "Tenant B" });

  // Generate an audited event in org B.
  await page.goto("/login");
  await loginViaUi(page, ownerB, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
  await page.goto(`/orgs/${slugB}/members`);
  await page.getByLabel("Email").fill(inviteeB);
  await page.getByLabel("Role", { exact: true }).click();
  await page.getByRole("option", { name: "Member" }).click();
  await page.getByRole("button", { name: /send invite/i }).click();
  await expect(page.getByText(/invitation sent to/i)).toBeVisible();

  // It is visible to org B's owner…
  await page.goto(auditUrl(slugB, inviteeB));
  await expect(page.getByRole("row").filter({ hasText: inviteeB })).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/login");

  // …and invisible to org A's, who has full `audit.read` on their OWN org. This is
  // the tenant boundary: not "A lacks permission", but "the row is not A's".
  await loginViaUi(page, ownerA, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
  const respA = await page.goto(auditUrl(slugA, inviteeB));
  expect(respA?.status(), "org A's owner may read org A's trail").toBe(200);
  await expect(page.getByRole("row").filter({ hasText: inviteeB })).toHaveCount(0);
  await expect(page.getByText(/no audit entries match/i)).toBeVisible();
});
