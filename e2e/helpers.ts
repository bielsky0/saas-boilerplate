import type { APIRequestContext, Page } from "@playwright/test";

/** Unique address per call so tests never collide. */
export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const TEST_PASSWORD = "Password123";

/**
 * Seed an account via the test-only in-process route (no UI, no browser
 * session). Uses the same adapter path as the sign-up server action.
 */
export async function registerViaApi(
  request: APIRequestContext,
  email: string,
  password = TEST_PASSWORD,
): Promise<void> {
  const res = await request.post("/api/dev/seed-user", {
    data: { email, password, name: "E2E User" },
  });
  if (!res.ok()) {
    throw new Error(`registerViaApi failed (${res.status()}): ${await res.text()}`);
  }
}

/** Read the newest verification link captured by the dev/log email adapter. */
export async function getVerificationLink(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const res = await request.get(`/api/dev/emails?to=${encodeURIComponent(email)}`);
  const body = (await res.json()) as { emails: Array<{ url?: string }> };
  const url = body.emails[0]?.url;
  if (!url) throw new Error(`No verification email captured for ${email}`);
  return url;
}

/** Read the newest invitation link captured for `email` (filters by template). */
export async function getInvitationLink(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const res = await request.get(`/api/dev/emails?to=${encodeURIComponent(email)}`);
  const body = (await res.json()) as {
    emails: Array<{ url?: string; template?: string }>;
  };
  const invite = body.emails.find((e) => e.template === "invitation" && e.url);
  if (!invite?.url) throw new Error(`No invitation email captured for ${email}`);
  return invite.url;
}

/**
 * Seed an organization owned by an existing seeded user, with optional members,
 * via the test-only route. Returns the (possibly de-duplicated) slug.
 */
export async function seedOrg(
  request: APIRequestContext,
  opts: {
    ownerEmail: string;
    name?: string;
    slug?: string;
    members?: Array<{ email: string; role: string }>;
  },
): Promise<string> {
  const res = await request.post("/api/dev/seed-org", { data: opts });
  if (!res.ok()) {
    throw new Error(`seedOrg failed (${res.status()}): ${await res.text()}`);
  }
  const body = (await res.json()) as { slug: string };
  return body.slug;
}

/** Fill and submit the login form. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
}
