import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "./rate-limit-fixtures";
import { clientSessionOf, issueAndReadCode, verifyCode } from "./client-auth-fixtures";
import { APEX_ORIGIN, tenantUrl, uniqueSubdomain } from "./host-fixtures";
import { ORG_SUBDOMAIN_HEADER } from "../src/lib/tenant-host";
import { registerViaApi, seedOrgFull, uniqueEmail } from "./helpers";
import { uniqueId } from "./billing-fixtures";

/**
 * Host-based tenant routing (langlion §2.27, plan F4.5).
 *
 * Academies live at `{subdomain}.langlion.pl`; the suite reaches them at
 * `{subdomain}.localtest.me:3000`, which resolves to 127.0.0.1 through real
 * public DNS. That is what makes these assertions mean something: the browser
 * sees genuinely different origins, so cookie scoping is exercised rather than
 * assumed. See e2e/host-fixtures.ts.
 *
 * ⚠️ `test` COMES FROM ./rate-limit-fixtures — same reason as every other spec
 * that touches the OTP endpoints. It also supplies `sharedRequest`, without
 * which the isolation tests at the bottom would pass for the wrong reason.
 */

async function seedAcademy(request: APIRequestContext, prefix: string): Promise<string> {
  const ownerEmail = uniqueEmail(`${prefix}-owner`);
  await registerViaApi(request, ownerEmail);
  const { subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: `${prefix} Academy`,
    slug: uniqueId(prefix),
    subdomain: uniqueSubdomain(prefix),
  });
  return subdomain;
}

/* ─── Host recognition ──────────────────────────────────────────────────── */

test("an unreserved path on an academy host reaches the CMS branch, not the auth guard", async ({
  request,
}) => {
  const subdomain = await seedAcademy(request, "cms-branch");

  const res = await request.get(tenantUrl(subdomain, "/en/o-nas"), { maxRedirects: 0 });

  // 404 from the CMS seam — Payload is not installed yet, and that is the
  // intended answer for this phase (see the route's header).
  expect(res.status()).toBe(404);
  // The assertion that carries the weight: NOT a redirect to /login. Without the
  // tenant branch this path would fall through to default-deny and answer 307.
  expect(res.headers()["location"], "must not fall through to the auth guard").toBeUndefined();
});

test("the bare apex serves marketing, the bare academy host does not", async ({ request }) => {
  const subdomain = await seedAcademy(request, "bare-host");

  const apex = await request.get(`${APEX_ORIGIN}/en`, { maxRedirects: 0 });
  expect(apex.status(), "the platform landing page is unchanged").toBe(200);

  // THIS PAIR PROVES THE ORDERING against `isPublicBarePage`. `/` is a public
  // page in PUBLIC_PAGE_ROUTES, so if the tenant branch ran after it, every
  // academy's bare subdomain would render langlion's marketing site.
  const tenant = await request.get(tenantUrl(subdomain, "/en"), { maxRedirects: 0 });
  expect(tenant.status(), "an academy's home page is its own, not ours").toBe(404);
});

test("an unknown academy 404s and never redirects to the apex", async ({ request }) => {
  const res = await request.get(tenantUrl("no-such-academy-here", "/en/cokolwiek"), {
    maxRedirects: 0,
  });

  // D57: a redirect would turn any label under our wildcard DNS into a link that
  // lands on our marketing site, and would show a parent following a stale flyer
  // a product pitch instead of an answer.
  expect(res.status()).toBe(404);
  expect(res.headers()["location"], "not a redirect of any kind").toBeUndefined();
});

test("an unknown academy does not serve the marketing site at its ROOT", async ({ request }) => {
  /*
   * The gap the seeded-academy test above could not see, found by driving
   * `pnpm dev` by hand. `/` is the one path the proxy cannot separate (a
   * catch-all does not match the empty path), so `[locale]/page.tsx` gates it —
   * and gating on "does this academy exist" instead of "was a tenant addressed"
   * would render langlion's landing page under EVERY non-existent
   * `*.langlion.pl`. That is precisely the supply of plausible links on our own
   * domain that D57 refuses for other paths.
   */
  const res = await request.get(tenantUrl("definitely-not-an-academy", "/en"), {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(404);
});

test("an unknown academy 404s on the API surface too", async ({ request }) => {
  const known = await seedAcademy(request, "api-known");

  const unknown = await request.get(tenantUrl("nobody-lives-here", "/api/client-auth/session"));
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error).toBe("unknown_organization");

  const found = await request.get(tenantUrl(known, "/api/client-auth/session"));
  expect(found.status()).toBe(200);
});

/* ─── Anti-spoofing (D56) ───────────────────────────────────────────────── */

test("a client-supplied tenant header cannot select an academy", async ({ request }) => {
  const subdomain = await seedAcademy(request, "spoof-apex");

  // Sent to the APEX, claiming to be an academy. `forward()` deletes the header
  // unconditionally before setting its own value; without that delete this
  // returns 200 and the caller has selected a tenant by asking.
  const res = await request.get(`${APEX_ORIGIN}/api/client-auth/session`, {
    headers: { [ORG_SUBDOMAIN_HEADER]: subdomain },
  });

  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe("unknown_organization");
});

test("a client-supplied tenant header cannot override the academy actually addressed", async ({
  request,
}) => {
  const a = await seedAcademy(request, "spoof-a");
  const b = await seedAcademy(request, "spoof-b");
  const email = uniqueEmail("spoof-parent");

  // Sign in at A, then ask A's host who we are while claiming to be B.
  const code = await issueAndReadCode(request, a, email);
  expect((await verifyCode(request, a, { email, code })).ok()).toBe(true);

  const res = await request.get(tenantUrl(a, "/api/client-auth/session"), {
    headers: { [ORG_SUBDOMAIN_HEADER]: b },
  });

  expect(res.status()).toBe(200);
  expect((await res.json()).client?.email, "the HOST decides, not the header").toBe(email);
});

/* ─── Reserved prefixes vs CMS (D60) ───────────────────────────────────── */

test("an apex-only route on an academy host hops to the apex, not into a login loop", async ({
  request,
}) => {
  const subdomain = await seedAcademy(request, "stage-apex");

  /*
   * `/orgs/new` rather than `/dashboard` (updated in F4.6). The panel became
   * `stage: "both"` and is now legitimately served on academy hosts, so it is no
   * longer an example of this rule. `/orgs/new` still is, and for a reason worth
   * keeping a test on: creating an academy cannot happen on that academy's own
   * host, because the tenant does not exist yet.
   */
  const res = await request.get(tenantUrl(subdomain, "/en/orgs/new"), { maxRedirects: 0 });

  expect(res.status()).toBe(307);
  const location = res.headers()["location"] ?? "";
  // Assert the HOST, not just the path. A redirect to `/en/login` on the tenant
  // host would also be a 307 — and would be the login loop this hop exists to
  // prevent, since the staff cookie is scoped per host.
  expect(new URL(location).host).toBe(new URL(APEX_ORIGIN).host);
  expect(new URL(location).pathname).toBe("/en/orgs/new");
});

test("a tenant-stage prefix is not served on the apex", async ({ request }) => {
  const res = await request.get(`${APEX_ORIGIN}/en/zapisy/anything`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test("a guarded staff route on the apex still meets default-deny", async ({ request }) => {
  /*
   * THE REGRESSION GUARD FOR THE `stage` TABLE, and the reason `PathStage` has a
   * third value instead of two (F4.6).
   *
   * The apex branch in src/proxy.ts returns `forward()` EARLY for a "tenant"-stage
   * prefix, which skips `isPublicBarePage` AND default-deny below it. That early
   * return is harmless while the only page-routing "tenant" prefix is `zapisy`,
   * because no such route exists and the app router answers 404 (the test above).
   *
   * Marking `dashboard` as "tenant" — literally what the old comments in
   * reserved-slugs.ts and proxy.ts proposed for this phase — changes that: the
   * route DOES exist, so the request is forwarded into the page.
   *
   * MEASURED, so the assertion below is the sharp one rather than the dramatic
   * one: the page's own `requireSession` still refuses (§4.2 holds), but it
   * answers `/login?callbackUrl=%2Fdashboard` — WITHOUT the locale. The proxy
   * answers `/en/login?callbackUrl=%2Fen%2Fdashboard`. So what the mutation
   * actually costs is the edge guard as a first line plus locale preservation,
   * and it is the PATHNAME check below that catches it, not the status.
   *
   * Mutation-checked: setting `dashboard` to "tenant" in RESERVED_PATH_PREFIXES
   * fails this test on the pathname line. The sibling test above does NOT fail
   * under that mutation, because it probes `/zapisy` — which is exactly why the
   * naive flip would otherwise have shipped silently.
   */
  const res = await request.get(`${APEX_ORIGIN}/en/dashboard`, { maxRedirects: 0 });

  expect(res.status(), "an anonymous request must never reach the panel").toBe(307);
  // `Location` is relative, so it needs a base to parse against. The LOCALE in
  // the path is the load-bearing part: it is what distinguishes the proxy's
  // refusal from the page's, and therefore what proves the edge guard ran.
  const location = new URL(res.headers()["location"] ?? "", APEX_ORIGIN);
  expect(location.pathname, "the proxy must refuse, not the page").toBe("/en/login");
  expect(location.searchParams.get("callbackUrl")).toBe("/en/dashboard");
});

/* ─── D39 closed: the academy is no longer a request field ─────────────── */

test("the full OTP flow works with no subdomain anywhere in the request", async ({ request }) => {
  const subdomain = await seedAcademy(request, "d39-clean");
  const email = uniqueEmail("d39-parent");

  // `issueAndReadCode`/`verifyCode` now address the academy's HOST and send only
  // `{ email }` / `{ email, code }`.
  const code = await issueAndReadCode(request, subdomain, email);
  expect((await verifyCode(request, subdomain, { email, code })).ok()).toBe(true);

  expect((await clientSessionOf(request, subdomain))?.email).toBe(email);
});

test("a subdomain in the body is ignored, not honoured", async ({ request }) => {
  const a = await seedAcademy(request, "d39-a");
  const b = await seedAcademy(request, "d39-b");
  const email = uniqueEmail("d39-ignored");

  // Addressed to A, claiming B in the payload. If the field were still read — or
  // kept as a fallback — the parent would be created at B.
  const res = await request.post(tenantUrl(a, "/api/client-auth/request-code"), {
    data: { email, subdomain: b },
  });
  expect(res.ok()).toBe(true);

  const code = await issueAndReadCode(request, a, uniqueEmail("d39-warm"));
  expect(code, "sanity: the outbox is reachable").toMatch(/^\d{6}$/);

  // The parent exists at A and nowhere else.
  const stateA = await request.get(
    `${APEX_ORIGIN}/api/dev/client-auth?subdomain=${a}&email=${encodeURIComponent(email)}`,
  );
  const stateB = await request.get(
    `${APEX_ORIGIN}/api/dev/client-auth?subdomain=${b}&email=${encodeURIComponent(email)}`,
  );
  expect((await stateA.json()).clientId, "created at the addressed academy").not.toBeNull();
  expect((await stateB.json()).clientId, "not at the one named in the body").toBeNull();
});

test("logout takes no body at all", async ({ request }) => {
  const subdomain = await seedAcademy(request, "d39-logout");
  const email = uniqueEmail("d39-logout-parent");

  const code = await issueAndReadCode(request, subdomain, email);
  expect((await verifyCode(request, subdomain, { email, code })).ok()).toBe(true);

  // A plain POST with no payload — the natural way to call it, and the one an
  // empty zod schema would have rejected.
  const res = await request.post(tenantUrl(subdomain, "/api/client-auth/logout"));
  expect(res.ok()).toBe(true);
  expect(await clientSessionOf(request, subdomain)).toBeNull();
});

/* ─── Per-host isolation: stronger than F3 could assert (D40) ──────────── */

test("one browser now holds sessions at two academies at once", async ({ sharedRequest }) => {
  const a = await seedAcademy(sharedRequest, "iso-a");
  const b = await seedAcademy(sharedRequest, "iso-b");
  const emailA = uniqueEmail("iso-parent-a");
  const emailB = uniqueEmail("iso-parent-b");

  const codeA = await issueAndReadCode(sharedRequest, a, emailA);
  expect((await verifyCode(sharedRequest, a, { email: emailA, code: codeA })).ok()).toBe(true);

  const codeB = await issueAndReadCode(sharedRequest, b, emailB);
  expect((await verifyCode(sharedRequest, b, { email: emailB, code: codeB })).ok()).toBe(true);

  // BEFORE F4.5 THIS WAS FALSE. One host meant one cookie name meant academy B
  // overwrote academy A — a wrinkle F3 accepted explicitly (D40) and F4.5 closes
  // by putting the academies on different hosts.
  expect((await clientSessionOf(sharedRequest, a))?.email, "A survived signing in at B").toBe(
    emailA,
  );
  expect((await clientSessionOf(sharedRequest, b))?.email).toBe(emailB);
});

test("a session at one academy is invisible at another", async ({ sharedRequest }) => {
  const a = await seedAcademy(sharedRequest, "iso-cross-a");
  const b = await seedAcademy(sharedRequest, "iso-cross-b");
  const email = uniqueEmail("iso-cross-parent");

  const code = await issueAndReadCode(sharedRequest, a, email);
  expect((await verifyCode(sharedRequest, a, { email, code })).ok()).toBe(true);

  // Null because the cookie was never SENT to B's host — not because a filter
  // rejected it. `sharedRequest` shares the browser jar, so this exercises real
  // host scoping; an isolated APIRequestContext would pass this trivially.
  expect(await clientSessionOf(sharedRequest, b)).toBeNull();
  expect((await clientSessionOf(sharedRequest, a))?.email, "and A is untouched").toBe(email);
});

/* ─── Rate limiting is keyed by client, not by host (D61) ──────────────── */

/**
 * D61 is about `rateLimitKey` in src/lib/security/rate-limit.ts — the PROXY
 * limiter, which keys on session → bearer → IP and deliberately not on host.
 *
 * ⚠️ NOT the OTP limiter, and the difference matters twice over. Its per-address
 * bucket is keyed on `(organizationId, email)` ON PURPOSE, so that one parent's
 * activity at Academy A cannot throttle a different person sharing that address
 * at Academy B — exactly the coupling rewizja 14.1 removed. Asserting against it
 * would be asserting the opposite of the design.
 *
 * `/api/client-auth/logout` is the probe because it is on the `write` tier
 * (30/min) and costs nothing per call: no email, no job, and no work at all
 * without a session cookie. An earlier version of this test swept the OTP
 * endpoint instead and enqueued 21 emails, which starved the shared job queue
 * and made unrelated specs (emails-retry, langlion-schedule) fail intermittently.
 */
test("rotating tenant hosts does not mint fresh rate-limit budget", async ({ sharedRequest }) => {
  const a = await seedAcademy(sharedRequest, "rl-host-a");
  const b = await seedAcademy(sharedRequest, "rl-host-b");

  // Spend the `write` allowance on A.
  for (let i = 0; i < 30; i += 1) {
    const res = await sharedRequest.post(tenantUrl(a, "/api/client-auth/logout"));
    expect(res.ok(), `request ${i + 1} should be allowed`).toBe(true);
  }

  // The same client, a different academy host. A host in the key would hand it a
  // fresh bucket — and an attacker unlimited budget, by rotating subdomains under
  // our own wildcard DNS.
  const blocked = await sharedRequest.post(tenantUrl(b, "/api/client-auth/logout"));
  expect(blocked.status(), "the limiter measures the client, not the tenant").toBe(429);
});
