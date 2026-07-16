import { expect, test } from "@playwright/test";

import {
  getInvitationLink,
  loginViaUi,
  registerViaApi,
  seedOrg,
  TEST_PASSWORD,
  uniqueEmail,
} from "./helpers";

/**
 * Spec §3.3 — both invitation-acceptance scenarios. An Owner invites by email;
 * the invitee opens the emailed link and joins the org with the assigned role,
 * whether they already had an account or register on the spot.
 */

async function inviteFromMembers(
  page: import("@playwright/test").Page,
  slug: string,
  inviteeEmail: string,
) {
  await page.goto(`/orgs/${slug}/members`);
  await page.getByLabel("Email").fill(inviteeEmail);
  // The invite role control is a Radix Select; `exact` avoids also matching the
  // per-member "Member role" selects in the team table.
  await page.getByLabel("Role", { exact: true }).click();
  await page.getByRole("option", { name: "Member" }).click();
  await page.getByRole("button", { name: /send invite/i }).click();
  // Success is surfaced as a toast.
  await expect(page.getByText(/invitation sent to/i)).toBeVisible();
}

async function signOut(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/login");
}

test("existing user accepts an invitation", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  const invitee = uniqueEmail("existing");
  await registerViaApi(request, owner);
  await registerViaApi(request, invitee);
  const slug = await seedOrg(request, { ownerEmail: owner, name: "Invite Co" });

  // Owner signs in and invites the (already-registered) user.
  await page.goto("/login");
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
  await inviteFromMembers(page, slug, invitee);
  const link = await getInvitationLink(request, invitee);
  await signOut(page);

  // Invitee signs in, opens the link, and accepts → lands in the org as member.
  await loginViaUi(page, invitee, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
  await page.goto(link);
  await page.getByRole("button", { name: /accept invitation/i }).click();
  await page.waitForURL(`**/orgs/${slug}`);
  await expect(page.getByText(/your role:/i)).toContainText(/member/i);
});

test("new user registers and accepts an invitation", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  const invitee = uniqueEmail("newcomer");
  await registerViaApi(request, owner);
  const slug = await seedOrg(request, { ownerEmail: owner, name: "Invite Co 2" });

  await page.goto("/login");
  await loginViaUi(page, owner, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
  await inviteFromMembers(page, slug, invitee);
  const link = await getInvitationLink(request, invitee);
  await signOut(page);

  // Anonymous visitor opens the link → offered sign-in/sign-up (no leak).
  await page.goto(link);
  await expect(page.getByText(/sign in or create an account/i)).toBeVisible();
  await page.getByRole("link", { name: /create account/i }).click();
  await page.waitForURL("**/signup**");

  // Register the invited email; autoSignIn gives a session, then Continue back.
  await page.getByLabel("Name (optional)").fill("Newcomer");
  await page.getByLabel("Email").fill(invitee);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/verify-email**");
  await page.getByRole("link", { name: /continue/i }).click();

  // Back on the invitation page with a session → accept → join as member.
  await page.getByRole("button", { name: /accept invitation/i }).click();
  await page.waitForURL(`**/orgs/${slug}`);
  await expect(page.getByText(/your role:/i)).toContainText(/member/i);
});
