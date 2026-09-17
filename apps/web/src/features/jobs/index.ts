/**
 * Jobs feature module (spec 12 — background jobs).
 *
 * Wires the queue to the rest of the app: the enqueue entry point every
 * caller uses, and the drain triggers. The queue mechanics themselves
 * (claiming, backoff, dead-lettering) live behind the adapter in
 * `src/lib/adapters/jobs`, and no feature code touches the `job` table directly.
 *
 * The handler registry (`./registry`, faza 2.3 and before) is gone: the drain
 * lives in Nest (`apps/api/src/jobs`), so there is nothing left in this app
 * for a registry to wire. `enqueueJob` stays until the billing webhook moves
 * in faza 2.5 — it is the last web-side writer, and `kickDrain` pings Nest's
 * drain after it.
 */

export { enqueueJob } from "./enqueue";
export { kickDrain } from "./runner";
export { jobPruneHandler } from "./handler";
export { JOB_RETENTION_DAYS, jobStats, listJobs, pruneTerminalJobs } from "./data";
export type { JobRow } from "./data";
