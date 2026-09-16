import {
  jobs,
  type EnqueueOptions,
  type JobName,
  type JobPayloads,
  type JobWriter,
} from "@/lib/adapters/jobs";
import { kickDrain } from "./runner";

/**
 * The enqueue entry point for feature code (spec 12).
 *
 * Wraps the adapter so that no caller has to remember `kickDrain()`. Everything
 * else about the adapter's contract still applies — in particular, pass a `tx` as
 * `writer` when the job should be atomic with a business write.
 */
export async function enqueueJob<N extends JobName>(
  writer: JobWriter,
  name: N,
  payload: JobPayloads[N],
  options?: EnqueueOptions,
): Promise<void> {
  await jobs.enqueue(writer, name, payload, options);
  // Kicked even when `writer` is a transaction that has not committed yet: the
  // drain runs after the response, by which point the tx has resolved one way or
  // the other. If it rolled back, the job row rolled back with it and the drain
  // simply finds nothing — which is the whole point of the outbox.
  kickDrain();
}
