import { expect, test } from "./rate-limit-fixtures";
import type { APIRequestContext } from "@playwright/test";

import {
  clientLogout,
  clientSessionOf,
  expireCodes,
  issueAndReadCode,
  otpState,
  readOtpCode,
  requestCode,
  verifyCode,
} from "./client-auth-fixtures";
import { registerViaApi, seedOrgFull, uniqueEmail } from "./helpers";
import { uniqueId } from "./billing-fixtures";

/**
 * Parent identity: the `client` entity, its OTP, and its session (plan Faza 3).
 *
 * This is the fourth deliberate departure from the boilerplate (langlion §2.19,
 * rewizja 14.1) under test: parents are NOT Better Auth users, and Academy A and
 * Academy B are unrelated businesses from a parent's point of view. Most of what
 * follows is about that second claim being true in the database rather than in a
 * filter someone remembered to write.
 *
 * ⚠️ `test` COMES FROM ./rate-limit-fixtures, not from @playwright/test. Both
 * OTP endpoints are rate-limited per address AND per IP, the suite is
 * fullyParallel against one origin with no X-Forwarded-For, and without the
 * per-test bucket every spec here would spend the same IP allowance and fail each
 * other in ways that look nothing like the cause.
 *
 * No UI is exercised because none exists yet: the sign-in screen and the
 * registration form arrive in F5 with the subdomain middleware. The backend under
 * test is complete and production-shaped, which is why these drive the real
 * `/api/client-auth/*` routes and not a fixture.
 */

/** An academy with a subdomain no parallel worker can collide with. */
async function seedAcademy(
  request: APIRequestContext,
  prefix: string,
): Promise<{ subdomain: string; orgId: string }> {
  const ownerEmail = uniqueEmail(`${prefix}-owner`);
  await registerViaApi(request, ownerEmail);
  const { subdomain, orgId } = await seedOrgFull(request, {
    ownerEmail,
    name: `${prefix} Academy`,
    slug: uniqueId(prefix),
  });
  return { subdomain, orgId };
}

test("a new address gets a code, and redeeming it creates a verified client with a session", async ({
  request,
}) => {
  const { subdomain } = await seedAcademy(request, "otp-happy");
  const email = uniqueEmail("parent");

  const before = await otpState(request, subdomain, email);
  expect(before.clientId, "no parent exists before the first request").toBeNull();

  const code = await issueAndReadCode(request, subdomain, email);

  // US-4.1: the upsert creates the parent BEFORE verification — this is the
  // production behaviour the registration form relies on, not a test artefact.
  const issued = await otpState(request, subdomain, email);
  expect(issued.clientId).not.toBeNull();
  expect(issued.isVerified, "unverified until the code is redeemed").toBe(false);
  expect(issued.liveSessions).toBe(0);

  const res = await verifyCode(request, { subdomain, email, code });
  expect(res.ok(), await res.text()).toBe(true);

  // US-4.5/AC1: the flip that US-4.2/AC1 later gates the shortened signup on.
  const verified = await otpState(request, subdomain, email);
  expect(verified.isVerified).toBe(true);
  expect(verified.liveSessions).toBe(1);

  const principal = await clientSessionOf(request, subdomain);
  expect(principal?.email).toBe(email);
  expect(principal?.isVerified).toBe(true);
});

test("the same address at two academies is two unrelated parents, and neither code or session crosses over", async ({
  request,
}) => {
  const a = await seedAcademy(request, "iso-a");
  const b = await seedAcademy(request, "iso-b");
  // ONE address, deliberately: the whole point of rewizja 14.1 is that this is
  // two people, not one person with two memberships.
  const email = uniqueEmail("shared-parent");

  const codeA = await issueAndReadCode(request, a.subdomain, email);

  const stateA = await otpState(request, a.subdomain, email);
  const stateB = await otpState(request, b.subdomain, email);
  expect(stateA.clientId).not.toBeNull();
  expect(stateB.clientId, "asking academy A for a code creates nothing at B").toBeNull();

  // A code minted at A is not merely wrong at B — the row is invisible to B's
  // tenant-scoped query, which is what `withTenant` + RLS buy here.
  const crossed = await verifyCode(request, { subdomain: b.subdomain, email, code: codeA });
  expect(crossed.status()).toBe(401);

  const okAtA = await verifyCode(request, { subdomain: a.subdomain, email, code: codeA });
  expect(okAtA.ok(), "the same code still works where it was issued").toBe(true);

  // One browser, one cookie: signed in at A, a stranger at B.
  expect((await clientSessionOf(request, a.subdomain))?.email).toBe(email);
  expect(await clientSessionOf(request, b.subdomain)).toBeNull();

  // And B's records are still untouched by everything that happened at A.
  const afterB = await otpState(request, b.subdomain, email);
  expect(afterB.clientId).toBeNull();
  expect(afterB.liveSessions).toBe(0);
});

test("a code is single-use", async ({ request }) => {
  const { subdomain } = await seedAcademy(request, "otp-once");
  const email = uniqueEmail("parent");

  const code = await issueAndReadCode(request, subdomain, email);

  expect((await verifyCode(request, { subdomain, email, code })).ok()).toBe(true);

  const second = await verifyCode(request, { subdomain, email, code });
  expect(second.status(), "a redeemed code is dead").toBe(401);

  // The refusal is a refusal, not a second session issued alongside the first.
  expect((await otpState(request, subdomain, email)).liveSessions).toBe(1);
});

test("two simultaneous redemptions of one code produce exactly one session", async ({
  request,
}) => {
  const { subdomain } = await seedAcademy(request, "otp-race");
  const email = uniqueEmail("parent");

  const code = await issueAndReadCode(request, subdomain, email);

  /*
   * THE TEST FOR DECYZJA D38. Fired together, so both requests are in flight
   * before either commits — which is exactly the interleaving a transaction alone
   * does NOT protect against: under READ COMMITTED both would observe
   * `consumedAt IS NULL` and both would proceed. Only the conditional UPDATE in
   * `consumeOtp` decides a winner.
   *
   * Asserting on the count of responses rather than on which one won: the race is
   * genuine, so either request may be the winner, and a test that demanded a
   * particular one would be asserting on scheduling.
   */
  const [first, second] = await Promise.all([
    verifyCode(request, { subdomain, email, code }),
    verifyCode(request, { subdomain, email, code }),
  ]);

  const statuses = [first.status(), second.status()].sort();
  expect(statuses, "exactly one winner, exactly one refusal").toEqual([200, 401]);

  // The claim that actually matters — one credential, one session, no matter how
  // the two requests interleaved.
  expect((await otpState(request, subdomain, email)).liveSessions).toBe(1);
});

test("a code expires", async ({ request }) => {
  const { subdomain } = await seedAcademy(request, "otp-expiry");
  const email = uniqueEmail("parent");

  const code = await issueAndReadCode(request, subdomain, email);
  expect(await expireCodes(request, subdomain, email)).toBe(1);

  const res = await verifyCode(request, { subdomain, email, code });
  expect(res.status()).toBe(401);
  expect((await otpState(request, subdomain, email)).liveSessions).toBe(0);
});

test("requesting a new code kills the previous one", async ({ request }) => {
  const { subdomain } = await seedAcademy(request, "otp-supersede");
  const email = uniqueEmail("parent");

  const firstCode = await issueAndReadCode(request, subdomain, email);

  // A resend must not WIDEN the set of working codes — otherwise every resend
  // makes guessing cheaper, which is backwards.
  const resend = await requestCode(request, { subdomain, email });
  expect(resend.ok()).toBe(true);
  await expect
    .poll(async () => (await otpState(request, subdomain, email)).codes.total)
    .toBeGreaterThan(1);

  const secondCode = await readOtpCode(request, email);
  expect(secondCode).not.toBe(firstCode);
  expect((await otpState(request, subdomain, email)).codes.live, "only the newest is live").toBe(1);

  expect((await verifyCode(request, { subdomain, email, code: firstCode })).status()).toBe(401);
  expect((await verifyCode(request, { subdomain, email, code: secondCode })).ok()).toBe(true);
});

test("wrong guesses are counted on the row and burn the code at the cap", async ({ request }) => {
  const { subdomain } = await seedAcademy(request, "otp-attempts");
  const email = uniqueEmail("parent");

  const code = await issueAndReadCode(request, subdomain, email);
  const wrong = code === "000000" ? "111111" : "000000";

  // OTP_MAX_ATTEMPTS is 5. This cap lives in the UPDATE rather than in the rate
  // limiter because the limiter fails open — see features/client-auth/config.ts.
  for (let i = 0; i < 5; i++) {
    expect((await verifyCode(request, { subdomain, email, code: wrong })).status()).toBe(401);
  }

  const burned = await otpState(request, subdomain, email);
  expect(burned.codes.live, "the fifth wrong guess consumed the code").toBe(0);

  // The REAL code is now dead too. That is the intended cost of the cap: a
  // guessed-at code is spent, and the parent asks for a new one.
  expect((await verifyCode(request, { subdomain, email, code })).status()).toBe(401);
});

test("code requests are rate limited per address", async ({ request }) => {
  const { subdomain } = await seedAcademy(request, "otp-ratelimit");
  const email = uniqueEmail("parent");

  // OTP_ISSUE_EMAIL_RULE is 5 per 15 minutes, and the suite runs at production
  // values (see rate-limit-fixtures) — the isolation comes from the per-test
  // bucket, not from a relaxed limit.
  for (let i = 0; i < 5; i++) {
    expect((await requestCode(request, { subdomain, email })).ok()).toBe(true);
  }

  const blocked = await requestCode(request, { subdomain, email });
  expect(blocked.status()).toBe(429);
  // §22.3: the response must say when to retry, not merely refuse.
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
});

test("logging out revokes the session server-side, not just the cookie", async ({ request }) => {
  const { subdomain } = await seedAcademy(request, "otp-logout");
  const email = uniqueEmail("parent");

  const code = await issueAndReadCode(request, subdomain, email);
  expect((await verifyCode(request, { subdomain, email, code })).ok()).toBe(true);
  expect((await otpState(request, subdomain, email)).liveSessions).toBe(1);

  expect((await clientLogout(request, subdomain)).ok()).toBe(true);

  expect(await clientSessionOf(request, subdomain)).toBeNull();
  // The property a stateless signed cookie could not have given us: the row is
  // gone, so a copied token is dead too — not merely absent from this browser.
  expect((await otpState(request, subdomain, email)).liveSessions).toBe(0);
});

test("an unknown academy is a 404, and a malformed request a 400", async ({ request }) => {
  const { subdomain } = await seedAcademy(request, "otp-shape");
  const email = uniqueEmail("parent");

  expect((await requestCode(request, { subdomain: "no-such-academy", email })).status()).toBe(404);
  expect((await verifyCode(request, { subdomain, email, code: "12345" })).status()).toBe(400);
  expect((await verifyCode(request, { subdomain, email, code: "abcdef" })).status()).toBe(400);

  const noBody = await request.post("/api/client-auth/request-code", { data: { subdomain } });
  expect(noBody.status()).toBe(400);
});
