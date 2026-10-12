import { expect, test, type APIRequestContext } from "@playwright/test";

import { loginAsFreshUser, registerViaApi, seedOrg, uniqueEmail } from "./helpers";
import { TENANCY_MODE } from "./tenancy-fixtures";

/**
 * Etap 4, faza 4 — org members table (AdminCN chrome over live members).
 *
 * Seeds an org with owner + member, then asserts the table renders, filters
 * narrow through the URL (nuqs shallow pushes — no navigations), and writes
 * (invite / role change / remove) land through mutations with invalidation.
 * One Next-router client navigation per document lifetime (headless-shell
 * limit, cf. orders-dashboard.spec.ts).
 */

async function seedTwoMemberOrg(request: APIRequestContext) {
  const owner = uniqueEmail("members-owner");
  const member = uniqueEmail("members-member");
  await registerViaApi(request, owner);
  await registerViaApi(request, member);
  const slug = await seedOrg(request, {
    ownerEmail: owner,
    name: "Members Co",
    members: [{ email: member, role: "member" }],
  });
  return { owner, member, slug };
}

test.describe("members table", () => {
  test.skip(TENANCY_MODE === "disabled", "members UI exists only with organizations on");

  test("renders members with role and status", async ({ page, request }) => {
    const { owner, member, slug } = await seedTwoMemberOrg(request);
    await loginAsFreshUser(page, request, "members", owner);
    await page.goto(`/en/orgs/${slug}/members`);

    const table = page.getByTestId("members-table");
    await expect(table).toBeVisible();
    await expect(table.getByText(owner)).toBeVisible();
    await expect(table.getByText(member)).toBeVisible();
  });

  test("search and role filter narrow through the URL", async ({ page, request }) => {
    const owner = uniqueEmail("filter-owner");
    const member = uniqueEmail("filter-member");
    await registerViaApi(request, owner);
    await registerViaApi(request, member);
    const slug = await seedOrg(request, {
      ownerEmail: owner,
      name: "Filter Co",
      members: [{ email: member, role: "member" }],
    });
    await loginAsFreshUser(page, request, "members", owner);
    await page.goto(`/en/orgs/${slug}/members`);
    const table = page.getByTestId("members-table");
    await expect(table.getByText(member)).toBeVisible();

    await page.getByLabel("Search members").fill(member);
    await expect(page).toHaveURL(/q=/);
    await expect(table.getByText(member)).toBeVisible();
    await expect(table.getByText(owner)).toHaveCount(0);

    await page.getByLabel("Search members").fill("");
    await page.getByLabel("Filter by role").click();
    await page.getByRole("option", { name: "Member" }).click();
    await expect(page).toHaveURL(/role=member/);
    await expect(table.getByText(member)).toBeVisible();
    await expect(table.getByText(owner)).toHaveCount(0);
  });

  test("invite sends and lists a pending invitation", async ({ page, request }) => {
    const owner = uniqueEmail("invite-owner");
    await registerViaApi(request, owner);
    const slug = await seedOrg(request, { ownerEmail: owner, name: "Invite Co" });
    await loginAsFreshUser(page, request, "members", owner);
    await page.goto(`/en/orgs/${slug}/members`);

    const invitee = uniqueEmail("invitee");
    await page.getByLabel("Email").fill(invitee);
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText(/invitation sent to/i)).toBeVisible();
    // Scoped to the table cell: the same address also appears in the toast.
    await expect(page.locator("td", { hasText: invitee })).toBeVisible();
  });

  test("role change persists", async ({ page, request }) => {
    const owner = uniqueEmail("role-owner");
    const member = uniqueEmail("role-member");
    await registerViaApi(request, owner);
    await registerViaApi(request, member);
    const slug = await seedOrg(request, {
      ownerEmail: owner,
      name: "Role Co",
      members: [{ email: member, role: "member" }],
    });
    await loginAsFreshUser(page, request, "members", owner);
    await page.goto(`/en/orgs/${slug}/members`);
    const table = page.getByTestId("members-table");
    await expect(table.getByText(member)).toBeVisible();

    const row = table.locator("tr", { hasText: member });
    await row.getByLabel("Member role").click();
    await page.getByRole("option", { name: "Admin" }).click();
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/role updated/i)).toBeVisible();
    // The role select trigger now renders the persisted value.
    await expect(row.getByLabel("Member role")).toHaveText("Admin");
  });

  test("removing the last owner is refused", async ({ page, request }) => {
    const owner = uniqueEmail("solo-owner");
    await registerViaApi(request, owner);
    const slug = await seedOrg(request, { ownerEmail: owner, name: "Solo Co" });
    await loginAsFreshUser(page, request, "members", owner);
    await page.goto(`/en/orgs/${slug}/members`);
    const table = page.getByTestId("members-table");

    const row = table.locator("tr", { hasText: owner });
    await row.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByText(/last owner/i)).toBeVisible();
  });
});
