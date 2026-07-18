import { z } from "zod";

import { idParam, optionalSlugParam } from "@/lib/validation";
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

/**
 * Mark-read action arguments (spec 22.2).
 *
 * A server action is a POST endpoint with an encrypted id, not a function call —
 * Next's own docs are explicit that it "is reachable to anyone who can send the
 * same POST" and that `FormData`, query parameters and headers are untrusted.
 * TypeScript's `slug: string | null` describes what the app's own UI sends; it
 * constrains nobody else. These schemas are what actually hold the arguments to
 * a shape.
 *
 * `slug` matters most: it selects WHICH tenant's notifications the call is
 * about. `resolveNotificationOwner` is still the authorization boundary and is
 * still what stops a caller reaching another tenant — this runs first so that
 * boundary is handed a well-formed slug rather than arbitrary bytes.
 *
 * Untranslated on purpose: these are argument shapes, and a failure means a
 * hand-built request, not a user mistake. There is no form to render them on.
 */
export const markReadSchema = z.object({
  slug: optionalSlugParam,
  id: idParam,
});

export const markAllReadSchema = z.object({
  slug: optionalSlugParam,
});
