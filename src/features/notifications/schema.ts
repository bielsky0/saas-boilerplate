import { z } from "zod";

import { idParam } from "@/lib/validation";
import { NOTIFICATION_META } from "./types";

/**
 * Validation schemas (spec 22.2 — the single source of truth for input shape,
 * shared by the job handler and the server actions).
 */

/**
 * The `notification.create` job payload, re-validated on the way out of jsonb
 * (ARCHITECTURE.md — "payloads are untrusted on the way out"). `type` is narrowed
 * to a known `NotificationType`; a row written by an older deploy for a type this
 * deploy no longer knows is dropped, not retried into a dead-letter.
 */
export const notificationJobSchema = z
  .object({
    userId: z.string().min(1),
    organizationId: z.string().nullable(),
    accountId: z.string().nullable(),
    type: z.string().refine((t): t is keyof typeof NOTIFICATION_META => t in NOTIFICATION_META, {
      message: "Unknown notification type",
    }),
    params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
    link: z.string().optional(),
  })
  // Mirror the `notification_owner_ck` XOR at the edge of the job boundary, not
  // just in the database. Both fields cross jsonb as nullable strings, so a
  // malformed payload used to reach the handler and fail late — as a CHECK
  // violation before F1a, and as a `42501` RLS refusal after it, whose message
  // points at the policy rather than at the payload that is actually wrong.
  // Enforcing it here makes the handler's `accountId!` sound rather than hopeful.
  .refine((v) => (v.organizationId === null) !== (v.accountId === null), {
    message: "exactly one of organizationId / accountId must be set",
    path: ["organizationId"],
  });

/**
 * Mark-read action arguments (spec 22.2).
 *
 * A server action is a POST endpoint with an encrypted id, not a function call —
 * Next's own docs are explicit that it "is reachable to anyone who can send the
 * same POST" and that `FormData`, query parameters and headers are untrusted.
 * TypeScript's types describe what the app's own UI sends; they constrain nobody
 * else. These schemas are what actually hold the arguments to a shape.
 *
 * The tenant used to travel here as `slug` — it selected WHICH tenant's
 * notifications the call was about, which made it the field most worth
 * validating. F4.6 removed it: the academy comes from the request host, so the
 * caller cannot name it at all. `resolveNotificationOwner` remains the
 * authorization boundary either way.
 *
 * Untranslated on purpose: these are argument shapes, and a failure means a
 * hand-built request, not a user mistake. There is no form to render them on.
 */
export const markReadSchema = z.object({
  id: idParam,
});
