/**
 * Injection token for the job name → handler map.
 *
 * Lives in its own file (not in `jobs.module.ts`): `JobsService` injects the
 * registry while the module provides it, so defining the token in the module
 * would be a runtime import cycle resolving to `undefined`.
 */
export const JOB_REGISTRY = Symbol("JOB_REGISTRY");
