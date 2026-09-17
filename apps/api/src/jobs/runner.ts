import { Logger } from "@nestjs/common";

/**
 * Post-enqueue drain kick (spec 12) — the LATENCY optimization, not the
 * guarantee. `/v1/cron/jobs` is the guarantee.
 *
 * The enqueue has already committed; this pulls it into the present so mail
 * does not wait for the next cron tick. Best-effort: a failed kick only delays
 * work (cron covers it), never loses it. Collapses N enqueues in one tick into
 * a single drain via the `draining` flag.
 *
 * A plain module function (not a service) on purpose: the auth engine's hooks
 * run outside Nest DI on the engine's own connection, exactly like web's
 * `after()`-outside-request-scope case — they can import this, they cannot
 * inject a service. The drain hook is registered by `JobsService` on init.
 */

const log = new Logger("JobsDrainKick");

let draining = false;
let drainHook: (() => Promise<unknown>) | null = null;

/** Registered once by `JobsService.onModuleInit`. */
export function setDrainHook(fn: () => Promise<unknown>): void {
  drainHook = fn;
}

export function kickDrain(): void {
  if (!drainHook || draining) return;
  draining = true;
  // `setImmediate`, not `await`: the caller is a request/hook handler that must
  // answer now; the drain runs after the response, like web's `after()` kick.
  setImmediate(async () => {
    try {
      await drainHook!();
    } catch (error) {
      log.warn(`post-enqueue drain failed, cron covers it: ${String(error)}`);
    } finally {
      draining = false;
    }
  });
}
