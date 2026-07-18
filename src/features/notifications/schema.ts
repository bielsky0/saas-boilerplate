import { z } from "zod";

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
export const notificationJobSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().nullable(),
  accountId: z.string().nullable(),
  type: z.string().refine((t): t is keyof typeof NOTIFICATION_META => t in NOTIFICATION_META, {
    message: "Unknown notification type",
  }),
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  link: z.string().optional(),
});
