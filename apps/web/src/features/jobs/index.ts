/**
 * Jobs feature module (spec 12 — background jobs).
 *
 * Wires the queue to the rest of the app: the handler registry, the enqueue entry
 * point every caller uses, and the drain triggers. The queue mechanics themselves
 * (claiming, backoff, dead-lettering) live behind the adapter in
 * `src/lib/adapters/jobs`, and no feature code touches the `job` table directly.
 *
 * `registry` is deliberately NOT re-exported here: it is imported lazily by
 * `./runner`, because `send.ts → runner → registry → handlers → send.ts` is a
 * cycle. Re-exporting it from the barrel would drag that cycle back into anything
 * importing this file.
 */

export { enqueueJob } from "./enqueue";
export { kickDrain } from "./runner";
export { jobPruneHandler } from "./handler";
export { JOB_RETENTION_DAYS, jobStats, listJobs, pruneTerminalJobs } from "./data";
export type { JobRow } from "./data";
