import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  drainJobs,
  failNextEmails,
  getEmails,
  getJob,
  getJobs,
  registerViaApi,
  uniqueEmail,
  waitForEmail,
  waitForJobSettled,
} from "./helpers";

/**
 * A failed send is retried automatically (spec 12.2).
 *
 * The outage is simulated per-ADDRESS, not with a global switch: playwright boots
 * ONE server for the whole suite, so a global failure flag would break every
 * concurrently-running test. Each test mints a unique address, so the blast radius
 * is exactly one test.
 *
 * These assert on the JOB ROW, not merely on eventual delivery. "The email arrived
 * in the end" would also be true of a system with no retry at all if you squint;
 * `attempts`, `lastError` and a future `runAt` are what actually prove backoff.
 */

/**
 * The verification email is deliberately KEYLESS (every request must send a fresh
 * mail), so it cannot be found by dedupe key. It is found by recipient instead,
 * FILTERED SERVER-SIDE: the suite is parallel and the listing is capped, so
 * scanning for it client-side loses it behind other specs' traffic.
 */
async function findSendJob(request: APIRequestContext, email: string) {
  const jobs = await getJobs(request, { to: email });
  return jobs.find((j) => j.name === "email.send");
}

test("a transient provider failure is retried with backoff, then delivered", async ({
  request,
}) => {
  const email = uniqueEmail("retry");
  await failNextEmails(request, email, 1);
  await registerViaApi(request, email);

  // First attempt: the provider throws, so nothing is delivered.
  await drainJobs(request);
  expect(await getEmails(request, email)).toHaveLength(0);

  const failed = await findSendJob(request, email);
  expect(failed, "a failed send must stay queued, not vanish").toBeTruthy();
  expect(failed!.status).toBe("pending");
  expect(failed!.attempts).toBe(1);
  expect(failed!.lastError).toContain("simulated provider failure");
  // BACKOFF, not just retry: it is scheduled into the future.
  expect(new Date(failed!.runAt).getTime()).toBeGreaterThan(Date.now());

  // Which means an immediate re-drain must not pick it up — proving the delay is
  // real rather than the job simply being retried in a tight loop.
  await drainJobs(request);
  expect(await getEmails(request, email)).toHaveLength(0);

  // Past the backoff, the retry succeeds on its own with no new trigger.
  await drainJobs(request, { jobIds: [failed!.id], fastForward: true });
  const mail = await waitForEmail(request, email, "verify-email");
  expect(mail.url).toBeTruthy();

  const done = await waitForJobSettled(request, failed!.id);
  expect(done.status).toBe("done");
  expect(done.attempts).toBe(2);
});

test("a permanently failing send dead-letters instead of looping forever", async ({ request }) => {
  const email = uniqueEmail("deadletter");
  // Far more failures than maxAttempts (5), so it can never succeed.
  await failNextEmails(request, email, 99);
  await registerViaApi(request, email);

  await drainJobs(request);
  const first = await findSendJob(request, email);
  expect(first).toBeTruthy();

  // Drive it to exhaustion, fast-forwarding past each backoff. Bounded and
  // re-checked rather than a fixed four passes: a drain is global, so a parallel
  // spec's drain may already be running this job — in which case our fast-forward
  // no-ops (it only moves PENDING rows) and that pass makes no progress. The cap
  // is generous slack over the five attempts actually needed.
  for (let i = 0; i < 12; i += 1) {
    const current = await getJob(request, first!.id);
    if (current.status === "failed") break;
    await drainJobs(request, { jobIds: [current.id], fastForward: true });
  }

  const dead = await waitForJobSettled(request, first!.id);
  expect(dead.status).toBe("failed");
  expect(dead.attempts).toBe(dead.maxAttempts);
  expect(dead.lastError).toContain("simulated provider failure");
  expect(await getEmails(request, email)).toHaveLength(0);

  // Terminal means terminal: a dead letter is never picked up again, so a wedging
  // job cannot burn the queue forever.
  await drainJobs(request, { jobIds: [dead.id], fastForward: true });
  const after = await getJob(request, dead.id);
  expect(after.status).toBe("failed");
  expect(after.attempts).toBe(dead.attempts);
});
