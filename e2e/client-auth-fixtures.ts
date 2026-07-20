import { expect, type APIRequestContext } from "@playwright/test";

import { waitForEmail } from "./helpers";
import { tenantUrl } from "./host-fixtures";

/**
 * Fixtures for parent authentication (langlion §2.19, plan F3).
 *
 * ⚠️ THE CODE IS READ FROM THE EMAIL OUTBOX, NEVER FROM A FIXTURE ROUTE, and
 * that is a deliberate constraint rather than an inconvenience worked around. The
 * database stores only a SHA-256, so no endpoint could return the digits — and if
 * one could, every test using it would stop proving that a real parent can
 * actually receive a code. Reading the outbox exercises template rendering, job
 * enqueueing and the drain, which is most of the delivery half of US-4.5.
 *
 * ─── The academy is in the URL, not in the body (F4.5, closes D39) ──────────
 *
 * These used to post `{ subdomain, … }` to a relative path. The production
 * routes now take the academy from the `Host` header, so the fixtures address
 * the academy's host instead. `subdomain` stays a PARAMETER of each helper — it
 * moved from the payload to the URL, which is exactly the change production
 * made, so these still mirror the real contract.
 *
 * The `/api/dev/client-auth` helpers at the bottom are deliberately NOT changed:
 * see the note there.
 */

export interface OtpState {
  organizationId: string;
  clientId: string | null;
  isVerified: boolean | null;
  codes: { total: number; live: number; maxAttempts: number };
  liveSessions: number;
}

/** Ask for a code. Returns the raw response so a spec can assert 429s and 404s. */
export function requestCode(
  request: APIRequestContext,
  subdomain: string,
  data: { email: string; name?: string },
) {
  return request.post(tenantUrl(subdomain, "/api/client-auth/request-code"), { data });
}

export function verifyCode(
  request: APIRequestContext,
  subdomain: string,
  data: { email: string; code: string },
) {
  return request.post(tenantUrl(subdomain, "/api/client-auth/verify"), { data });
}

/** No body at all — the academy is the host, the parent is the cookie. */
export function clientLogout(request: APIRequestContext, subdomain: string) {
  return request.post(tenantUrl(subdomain, "/api/client-auth/logout"));
}

/** Who this request context is signed in as at `subdomain` — null when nobody. */
export async function clientSessionOf(
  request: APIRequestContext,
  subdomain: string,
): Promise<{ id: string; email: string; isVerified: boolean } | null> {
  const res = await request.get(tenantUrl(subdomain, "/api/client-auth/session"));
  expect(res.ok(), `session lookup failed: ${await res.text()}`).toBe(true);
  const body = (await res.json()) as {
    client: { id: string; email: string; isVerified: boolean } | null;
  };
  return body.client;
}

/**
 * The newest code emailed to `email`, pulled out of the dev outbox.
 *
 * Waits for the email rather than reading once: every message goes through the
 * job queue and the drain runs after the response the caller already awaited, so
 * a single immediate read is a race that loses more often on CI.
 */
export async function readOtpCode(request: APIRequestContext, email: string): Promise<string> {
  const mail = await waitForEmail(request, email, "client-otp");
  // The subject carries the code deliberately (see the template header), which
  // makes it the most stable place to read it from — the body's markup is styling.
  const match = /\b(\d{6})\b/.exec(mail.subject) ?? /\b(\d{6})\b/.exec(mail.text);
  if (!match) throw new Error(`No 6-digit code in the OTP email to ${email}: ${mail.subject}`);
  return match[1]!;
}

/** Issue a code and read it back — the two steps almost every spec starts with. */
export async function issueAndReadCode(
  request: APIRequestContext,
  subdomain: string,
  email: string,
): Promise<string> {
  const res = await requestCode(request, subdomain, { email });
  expect(res.ok(), `request-code failed: ${await res.text()}`).toBe(true);
  return readOtpCode(request, email);
}

/*
 * ─── The two helpers below stay on `?subdomain=` DELIBERATELY ───────────────
 *
 * `/api/dev/client-auth` is a CROSS-TENANT diagnostic: a fixture standing on any
 * host must be able to inspect any academy — most of all in the isolation tests,
 * where the whole question is what academy B looks like from outside. Deriving
 * its tenant from the Host would force those tests to open a context per academy
 * just to read counters, and would blind the tool to the thing it exists to
 * diagnose. An asymmetry on purpose, not an oversight.
 */

/** Row-level state the production API deliberately does not expose. */
export async function otpState(
  request: APIRequestContext,
  subdomain: string,
  email: string,
): Promise<OtpState> {
  const res = await request.get(
    `/api/dev/client-auth?subdomain=${encodeURIComponent(subdomain)}&email=${encodeURIComponent(email)}`,
  );
  expect(res.ok(), `client-auth state failed: ${await res.text()}`).toBe(true);
  return (await res.json()) as OtpState;
}

/** Move every live code for this address into the past (US-4.5 expiry). */
export async function expireCodes(
  request: APIRequestContext,
  subdomain: string,
  email: string,
): Promise<number> {
  const res = await request.post("/api/dev/client-auth", {
    data: { subdomain, email, action: "expire-codes" },
  });
  expect(res.ok(), `expire-codes failed: ${await res.text()}`).toBe(true);
  return ((await res.json()) as { expired: number }).expired;
}
