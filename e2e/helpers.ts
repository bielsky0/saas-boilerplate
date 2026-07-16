import { expect, type APIRequestContext, type Page } from "@playwright/test";

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

export interface CapturedEmail {
  template: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  url?: string;
  headers?: Record<string, string>;
  sentAt: string;
}

/** Every email captured for `email`, newest first. */
export async function getEmails(
  request: APIRequestContext,
  email: string,
): Promise<CapturedEmail[]> {
  const res = await request.get(`/api/dev/emails?to=${encodeURIComponent(email)}`);
  const body = (await res.json()) as { emails: CapturedEmail[] };
  return body.emails;
}

/**
 * Wait for an email of `template` to reach the outbox.
 *
 * POLLING IS NOT OPTIONAL HERE. Every email now goes through the job queue, and
 * the drain runs in an `after()` callback — i.e. AFTER the response the test just
 * awaited. A single immediate read is therefore a race, and it loses more often on
 * CI (one worker, slower box) than locally, which is the worst way for it to fail.
 */
export async function waitForEmail(
  request: APIRequestContext,
  email: string,
  template: string,
  timeout = 15_000,
): Promise<CapturedEmail> {
  await expect
    .poll(async () => (await getEmails(request, email)).some((m) => m.template === template), {
      timeout,
      message: `Waiting for "${template}" email to ${email}`,
    })
    .toBe(true);
  const found = (await getEmails(request, email)).find((m) => m.template === template);
  return found!;
}

/** Read the newest verification link captured by the dev/log email adapter. */
export async function getVerificationLink(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const mail = await waitForEmail(request, email, "verify-email");
  if (!mail.url) throw new Error(`Verification email for ${email} carried no link`);
  return mail.url;
}

/** Read the newest invitation link captured for `email`. */
export async function getInvitationLink(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const mail = await waitForEmail(request, email, "invitation");
  if (!mail.url) throw new Error(`Invitation email for ${email} carried no link`);
  return mail.url;
}

// --- Job queue (spec 12) ----------------------------------------------------

export interface JobView {
  id: string;
  name: string;
  status: string;
  dedupeKey: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

/**
 * Drain the queue synchronously.
 *
 * `fastForward` pulls scheduled jobs into the present, so the day-3/day-7 steps of
 * the onboarding sequence are testable in seconds. It REQUIRES a scope — either
 * `dedupeKeyPrefix` or `jobIds`: the suite is fullyParallel against one shared
 * database, so an unscoped fast-forward would drag other specs' jobs into the
 * present and fail them. Use `jobIds` for keyless sends (verification, reset),
 * which no prefix can match.
 *
 * The DRAIN itself is always global — it runs whatever is due, including other
 * specs' jobs. Only the fast-forward is scoped. That is why terminal state must be
 * awaited via `waitForJobSettled` rather than asserted straight after this returns.
 */
export async function drainJobs(
  request: APIRequestContext,
  opts?: { dedupeKeyPrefix?: string; jobIds?: string[]; fastForward?: boolean },
): Promise<{
  fastForwarded: number;
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
}> {
  const res = await request.post("/api/dev/jobs/run", { data: opts ?? {} });
  if (!res.ok()) {
    throw new Error(`drainJobs failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Inspect queued jobs — the only way to assert a RETRY rather than a delivery.
 *
 * FILTER, don't scan: the response is capped, and the suite runs in parallel, so
 * an unfiltered read can easily miss this test's own job behind other specs'
 * traffic. `to` is the filter for keyless sends (verification, reset).
 */
export async function getJobs(
  request: APIRequestContext,
  opts?: { dedupeKeyPrefix?: string; to?: string; id?: string },
): Promise<JobView[]> {
  const qs = new URLSearchParams();
  if (opts?.dedupeKeyPrefix) qs.set("dedupeKeyPrefix", opts.dedupeKeyPrefix);
  if (opts?.to) qs.set("to", opts.to);
  if (opts?.id) qs.set("id", opts.id);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await request.get(`/api/dev/jobs${suffix}`);
  const body = (await res.json()) as { jobs: JobView[] };
  return body.jobs;
}

/** One job by id — works after the success-path payload scrub, unlike `to`. */
export async function getJob(request: APIRequestContext, id: string): Promise<JobView> {
  const [row] = await getJobs(request, { id });
  if (!row) throw new Error(`No job found with id ${id}`);
  return row;
}

/**
 * Wait until one job reaches a terminal state (done or failed).
 *
 * Same reason as `waitForJobsSettled`: a drain is global, so a parallel spec's
 * `/api/dev/jobs/run` can claim this job and still be running it when we look —
 * `status: "running"` is a legitimate intermediate state, not a failure.
 */
export async function waitForJobSettled(
  request: APIRequestContext,
  id: string,
  timeout = 15_000,
): Promise<JobView> {
  await expect
    .poll(async () => (await getJob(request, id)).status, {
      timeout,
      message: `Waiting for job ${id} to settle`,
    })
    .toMatch(/^(done|failed)$/);
  return getJob(request, id);
}

/**
 * Wait until every job under `dedupeKeyPrefix` reaches a terminal state.
 *
 * Polls rather than reading once, because a drain is GLOBAL: another spec's
 * `/api/dev/jobs/run` can claim this test's jobs and still be executing them when
 * we look. They will finish — but "done by the time my own drain returned" is not
 * something the queue promises, and asserting it directly is a flake.
 */
export async function waitForJobsSettled(
  request: APIRequestContext,
  dedupeKeyPrefix: string,
  timeout = 15_000,
): Promise<JobView[]> {
  await expect
    .poll(
      async () => {
        const jobs = await getJobs(request, { dedupeKeyPrefix });
        return jobs.length > 0 && jobs.every((j) => j.status === "done" || j.status === "failed");
      },
      { timeout, message: `Waiting for jobs "${dedupeKeyPrefix}*" to settle` },
    )
    .toBe(true);
  return getJobs(request, { dedupeKeyPrefix });
}

/** Simulate a provider outage for one address (spec 14.1). */
export async function failNextEmails(
  request: APIRequestContext,
  email: string,
  times: number,
): Promise<void> {
  const res = await request.post("/api/dev/emails/fail-next", { data: { to: email, times } });
  if (!res.ok()) {
    throw new Error(`failNextEmails failed (${res.status()}): ${await res.text()}`);
  }
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

/**
 * Promote an existing seeded user to super admin (spec 6.1) via the test-only
 * route. Bootstrapping cannot go through `setSuperAdminAction` — that requires an
 * existing super admin — so this mirrors the documented production SQL.
 */
export async function seedSuperAdmin(request: APIRequestContext, email: string): Promise<void> {
  const res = await request.post("/api/dev/seed-super-admin", { data: { email } });
  if (!res.ok()) {
    throw new Error(`seedSuperAdmin failed (${res.status()}): ${await res.text()}`);
  }
}

/** Look up a seeded user's id — needed to scope onboarding job keys per test. */
export async function getUserId(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.get(`/api/dev/user?email=${encodeURIComponent(email)}`);
  if (!res.ok()) throw new Error(`getUserId failed for ${email} (${res.status()})`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** Register + verify, returning the user id. The common setup for §10.3 tests. */
export async function registerAndVerify(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  await registerViaApi(request, email);
  const link = await getVerificationLink(request, email);
  await request.get(link);
  return getUserId(request, email);
}

/** Fill and submit the login form. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
}
