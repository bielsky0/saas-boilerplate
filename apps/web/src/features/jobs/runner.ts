import { after } from "next/server";

import { env } from "@/lib/env/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs");

/**
 * Job runner trigger (spec 12) — faza 2.3: the drain lives in Nest.
 *
 * TWO WAYS THE QUEUE DRAINS, and only one of them is a guarantee:
 *   - `kickDrain()` here, after the response — the LATENCY OPTIMIZATION. It
 *     fire-and-forget pings Nest's drain endpoint (`GET /v1/cron/jobs`), so
 *     work enqueued by web (the billing webhook, until faza 2.5) does not
 *     wait for the next cron tick.
 *   - The cron pinger against `/api/cron/jobs` (proxied to Nest) — the
 *     GUARANTEE. Retries and scheduled work exist only because of it.
 *
 * Called from `enqueueJob` (wrapping web-side enqueues) rather than from each
 * trigger site, so no caller has to remember it. Best-effort: a failed kick
 * only delays work, never loses it. Unset CRON_SECRET = no kick; cron covers.
 */

/** Collapses N enqueues in one request into a single kick. */
let kicking = false;

export function kickDrain(): void {
  try {
    after(async () => {
      if (kicking) return;
      if (!env.CRON_SECRET) return;
      kicking = true;
      try {
        await fetch(`${env.API_BASE_URL.replace(/\/+$/, "")}/v1/cron/jobs`, {
          headers: { authorization: `Bearer ${env.CRON_SECRET}` },
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        // A kick failure must never surface to the user: their request already
        // succeeded, and the work is durably queued. Cron will drain it.
        log.error("post-response drain kick failed", { err: error });
      } finally {
        kicking = false;
      }
    });
  } catch {
    // `after()` throws outside a request scope — a background task, or a call
    // path with no response to run after. Cron will drain.
  }
}
