/**
 * Background-jobs adapter (spec 1.2, 12 — pluggable async/scheduler backend).
 *
 * Feature code imports the singleton `jobs` and the contract types; it never
 * imports a queue backend directly. The concrete provider is chosen at startup by
 * `JOBS_PROVIDER`.
 *
 * One provider exists today, which is honest rather than a fake choice: the seam
 * is here so a hosted scheduler (Inngest and equivalents — spec 1.1) can be added
 * as a second `drain` strategy without touching a single enqueue site. Read the
 * outbox note in `./contract.ts` before adding one — the shape of `enqueue` is not
 * negotiable for a backend that wants to stay transactional.
 *
 * The postgres adapter closes over `db` and cannot throw at construction, so the
 * "the default provider must never throw at module load, or it breaks
 * `next build`" rule (docs/ARCHITECTURE.md) holds trivially here.
 */

import { env } from "@/lib/env/server";
import type { JobsAdapter } from "./contract";
import { postgresJobsAdapter } from "./postgres";

function createJobsAdapter(): JobsAdapter {
  switch (env.JOBS_PROVIDER) {
    case "postgres":
    default:
      return postgresJobsAdapter;
  }
}

export const jobs: JobsAdapter = createJobsAdapter();

export type {
  DrainResult,
  EnqueueOptions,
  JobContext,
  JobHandler,
  JobName,
  JobPayloads,
  JobRegistry,
  JobWriter,
  JobsAdapter,
} from "./contract";
