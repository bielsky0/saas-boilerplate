import { expect, test } from "@playwright/test";

import {
  drainJobs,
  getEmails,
  registerAndVerify,
  uniqueEmail,
  waitForEmail,
  waitForJobsSettled,
} from "./helpers";

/**
 * Unsubscribe stops subsequent emails of that type (spec 10.3).
 *
 * The acceptance criterion for suppression. Every test drives the onboarding
 * sequence, fast-forwarded so day 3 and day 7 are reachable in seconds — scoped by
 * the test's own user id, because the suite is parallel against one shared
 * database.
 */

/** The one-click URL out of the List-Unsubscribe header, as a mail client reads it. */
function unsubscribeUrlFrom(header: string | undefined): string {
  expect(header, "onboarding mail must carry a List-Unsubscribe header").toBeTruthy();
  const match = header!.match(/<([^>]+)>/);
  expect(match, `could not parse List-Unsubscribe: ${header}`).toBeTruthy();
  return match![1]!;
}

test("a GET on the unsubscribe link does NOT unsubscribe", async ({ request }) => {
  const email = uniqueEmail("prefetch");
  const userId = await registerAndVerify(request, email);
  const prefix = `onboarding:${userId}:`;

  await drainJobs(request, { dedupeKeyPrefix: prefix });
  const welcome = await waitForEmail(request, email, "welcome");
  const url = unsubscribeUrlFrom(welcome.headers?.["List-Unsubscribe"]);

  // Exactly what a mail scanner, corporate link-rewriter, or Gmail's image proxy
  // does to every URL in a message. It must change nothing — otherwise people get
  // silently unsubscribed without ever clicking, and the only symptom is a support
  // ticket asking why the emails stopped.
  const res = await request.get(url.replace("/api/unsubscribe", "/unsubscribe"));
  expect(res.ok()).toBe(true);

  // The sequence continues, because nothing was suppressed.
  await drainJobs(request, { dedupeKeyPrefix: prefix, fastForward: true });
  await waitForEmail(request, email, "onboarding-tips");
});

test("one-click unsubscribe stops the rest of the sequence", async ({ request }) => {
  const email = uniqueEmail("unsub");
  const userId = await registerAndVerify(request, email);
  const prefix = `onboarding:${userId}:`;

  await drainJobs(request, { dedupeKeyPrefix: prefix });
  const welcome = await waitForEmail(request, email, "welcome");
  expect(welcome.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  const url = unsubscribeUrlFrom(welcome.headers?.["List-Unsubscribe"]);

  // RFC 8058: a POST from the mail provider's servers is a deliberate act.
  const res = await request.post(url);
  expect(res.ok()).toBe(true);

  // Day 3 and day 7 were queued BEFORE the unsubscribe — this is the whole point
  // of checking suppression at send time rather than at enqueue time.
  await drainJobs(request, { dedupeKeyPrefix: prefix, fastForward: true });

  const templates = (await getEmails(request, email)).map((m) => m.template);
  expect(templates).not.toContain("onboarding-tips");
  expect(templates).not.toContain("onboarding-features");

  // A suppressed send is a SUCCESS, not a failure: the steps must settle as done,
  // never dead-lettered — otherwise the queue fills with red rows recording the
  // system working exactly as designed.
  const jobs = await waitForJobsSettled(request, prefix);
  expect(jobs.map((j) => j.status)).toEqual(jobs.map(() => "done"));
});

test("unsubscribing never silences transactional mail", async ({ page, request }) => {
  const email = uniqueEmail("unsub-transactional");
  const userId = await registerAndVerify(request, email);
  const prefix = `onboarding:${userId}:`;

  await drainJobs(request, { dedupeKeyPrefix: prefix });
  const welcome = await waitForEmail(request, email, "welcome");
  await request.post(unsubscribeUrlFrom(welcome.headers?.["List-Unsubscribe"]));

  // The other half of the criterion, and the one that matters most: a password
  // reset is not a preference. An opt-out that swallowed it would be a lockout.
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /send reset link/i }).click();

  const reset = await waitForEmail(request, email, "password-reset");
  expect(reset.url).toBeTruthy();
  expect(reset.headers?.["List-Unsubscribe"]).toBeUndefined();
});

test("a forged unsubscribe signature is rejected", async ({ request }) => {
  const email = uniqueEmail("forged");
  const userId = await registerAndVerify(request, email);
  const prefix = `onboarding:${userId}:`;

  await drainJobs(request, { dedupeKeyPrefix: prefix });
  const welcome = await waitForEmail(request, email, "welcome");
  const url = new URL(unsubscribeUrlFrom(welcome.headers?.["List-Unsubscribe"]));

  // Swap the address but keep the signature: without a real MAC check this would
  // let anyone unsubscribe anyone.
  url.searchParams.set("e", Buffer.from("victim@example.com").toString("base64url"));
  const res = await request.post(url.toString());
  expect(res.status()).toBe(400);
});
