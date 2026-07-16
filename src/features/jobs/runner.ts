import { after } from "next/server";

import { jobs } from "@/lib/adapters/jobs";

/**
 * Job runner triggers (spec 12).
 *
 * TWO WAYS THE QUEUE DRAINS, and only one of them is a guarantee:
 *   - `kickDrain()` here, after the response — the LATENCY OPTIMIZATION. The
 *     enqueue has already committed; if the process dies before or during it,
 *     nothing is lost, only delayed.
 *   - `/api/cron/jobs` — the GUARANTEE. Retries and scheduled work (the §10.3
 *     sequence, pruning) exist only because of it.
 *
 * Say it that way round when reasoning about failures: an unset CRON_SECRET does
 * not break the happy path, which is exactly why it is dangerous — everything
 * looks fine while retries silently never run.
 */

/** Collapses N enqueues in one request into a single drain. */
let draining = false;

/**
 * Kick a post-response drain. Best-effort by design.
 *
 * Called from `enqueueJob`/`enqueueEmail` rather than from each of the trigger
 * sites, so no caller has to remember it, and never from the adapter (which must
 * not import `next/server`).
 */
export function kickDrain(): void {
  try {
    after(async () => {
      if (draining) return;
      draining = true;
      try {
        // Imported lazily, and not only to be tidy: the static graph
        // `send.ts → runner → registry → onboarding/handler → send.ts` is a
        // cycle, and a cycle resolved at module-init time yields `undefined` at
        // one of those edges depending on which module is entered first. Deferring
        // to drain time — when the whole graph is loaded — sidesteps it, and keeps
        // a plain enqueue from pulling every handler into its bundle.
        const { registry } = await import("./registry");
        await jobs.drain(registry, { budgetMs: 10_000 });
      } catch (error) {
        // A drain failure must never surface to the user: their request already
        // succeeded, and the work is durably queued. Cron will retry it.
        console.error("[jobs] post-response drain failed", error);
      } finally {
        draining = false;
      }
    });
  } catch {
    // `after()` throws outside a request scope — a background job, or an
    // auth-engine hook running on its own connection. The same reason
    // features/admin/audit.ts wraps `headers()`. Cron will drain.
  }
}
