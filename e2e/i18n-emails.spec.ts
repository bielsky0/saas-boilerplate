import { expect, test } from "@playwright/test";

import { drainJobs, registerAndVerify, registerViaApi, uniqueEmail, waitForEmail } from "./helpers";

/**
 * Email is written in the RECIPIENT's language (spec 16.1 + 10).
 *
 * This is the spec that actually proves the enqueue-time locale design. Everything
 * else about §16 can be checked by looking at a page; this cannot, because the
 * whole difficulty is that the render happens somewhere the request no longer
 * exists — a cron drain, up to a week later (§10.3). If the locale were resolved
 * at SEND time instead of enqueue time, every assertion here would still pass for
 * the day-0 mail and silently fail for day 3 and day 7.
 *
 * The registration path is `/api/dev/seed-user` with a locale COOKIE rather than
 * the signup form, and the cookie is the point: `/api/*` is exempt from locale
 * prefixing, so there is no `x-app-locale` header on that request and the cookie
 * is the only thing that can carry a preference. That is the same path a real
 * user takes when they switch language and then register.
 */

test("a user who chose Polish gets a Polish verification email", async ({ request }) => {
  const email = uniqueEmail("pl-verify");

  await registerViaApi(request, email, undefined, { locale: "pl" });

  const mail = await waitForEmail(request, email, "verify-email");
  expect(mail.subject, "the subject must be rendered in the recipient's language").toBe(
    "Potwierdź swój adres e-mail",
  );
  // The BODY too, not just the subject: a Polish subject on an English body is a
  // specific kind of broken that a subject-only assertion would happily pass.
  expect(mail.html).toContain("Potwierdź swój e-mail");
});

test("the default locale is still English", async ({ request }) => {
  const email = uniqueEmail("en-verify");

  // No locale at all — nobody told us anything, so `user.locale` stays NULL and
  // the send falls back rather than throwing. That fallback is the reason
  // `localeForUser` exists alongside `storedLocaleForUser`.
  await registerViaApi(request, email);

  const mail = await waitForEmail(request, email, "verify-email");
  expect(mail.subject).toBe("Verify your email address");
});

/**
 * THE ONE THAT MATTERS. The §10.3 sequence is scheduled on day 0 and drained days
 * later, so its language cannot come from a request — it has to have been written
 * into the job payload at enqueue. Draining with `fastForward` collapses the wait
 * without touching how the locale got there.
 */
test("a scheduled onboarding email is still Polish days later", async ({ request }) => {
  const email = uniqueEmail("pl-onboarding");
  const userId = await registerAndVerify(request, email, { locale: "pl" });
  // Scoped to THIS user's sequence: a bare fast-forward drain would drag every
  // other parallel spec's scheduled jobs into the present.
  const prefix = `onboarding:${userId}:`;

  await drainJobs(request, { dedupeKeyPrefix: prefix });
  const welcome = await waitForEmail(request, email, "welcome");
  expect(welcome.subject, "day 0's language must survive the queue").toBe("Witamy na pokładzie");

  // THE ACTUAL POINT: day 3 and day 7 were scheduled on day 0 and are rendered
  // now, with no request anywhere in sight. The only way they can be Polish is if
  // the locale was written into the payload at enqueue time.
  await drainJobs(request, { dedupeKeyPrefix: prefix, fastForward: true });
  const tips = await waitForEmail(request, email, "onboarding-tips");
  expect(tips.subject, "a day-3 job drained later must keep its enqueue-time locale").toBe(
    "Trzy rzeczy warte poznania",
  );
  const features = await waitForEmail(request, email, "onboarding-features");
  expect(features.subject).toBe("Gotowy na więcej?");
});
