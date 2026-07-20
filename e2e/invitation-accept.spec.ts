import { expect, test } from "./rate-limit-fixtures";
import { tenantUrl } from "./host-fixtures";

import {
  getInvitationLink,
  loginToAcademy,
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
  subdomain: string,
  inviteeEmail: string,
) {
  await page.goto(tenantUrl(subdomain, "/dashboard/members"));
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
  const { subdomain } = await seedOrg(request, { ownerEmail: owner, name: "Invite Co" });

  // The owner signs in ON THE ACADEMY'S HOST — the members page lives there
  // since F4.6, and an apex session is not sent to it (§2.19 exception #5).
  await loginToAcademy(page, subdomain, owner, TEST_PASSWORD);
  await inviteFromMembers(page, subdomain, invitee);
  const link = await getInvitationLink(request, invitee);
  await signOut(page);

  /*
   * The invitee signs in on the APEX. Invitation links are apex-staged and
   * cross-org by nature — the invitee may not be in this academy yet, so there is
   * no academy session to send them to.
   */
  await page.goto("/login");
  await loginViaUi(page, invitee, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
  await page.goto(link);
  await page.getByRole("button", { name: /accept invitation/i }).click();

  // Accepting lands on the APEX dashboard, not inside the academy (F4.6): the
  // new member's session does not exist on that host yet. The directory listing
  // is the confirmation that they joined.
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("link", { name: "Invite Co" })).toBeVisible();

  // Entering is a separate sign-in, and the role is visible once inside.
  await loginToAcademy(page, subdomain, invitee, TEST_PASSWORD);
  await expect(page.getByText(/your role:/i)).toContainText(/member/i);
});

test("new user registers and accepts an invitation", async ({ page, request }) => {
  const owner = uniqueEmail("owner");
  const invitee = uniqueEmail("newcomer");
  await registerViaApi(request, owner);
  const { subdomain } = await seedOrg(request, { ownerEmail: owner, name: "Invite Co 2" });

  await loginToAcademy(page, subdomain, owner, TEST_PASSWORD);
  await inviteFromMembers(page, subdomain, invitee);
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

  // Back on the invitation page with a session → accept → join as member, and
  // land on the apex directory (see the note in the sibling test).
  await page.getByRole("button", { name: /accept invitation/i }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("link", { name: "Invite Co 2" })).toBeVisible();

  await loginToAcademy(page, subdomain, invitee, TEST_PASSWORD);
  await expect(page.getByText(/your role:/i)).toContainText(/member/i);
});
