import { z } from "zod";

/**
 * Admin panel validation (spec 6.2) — list filters and action payloads.
 *
 * Isomorphic: imported by the filter form and by the server pages/actions, like
 * every other feature's `schema.ts`.
 */

/** Rows per page in every admin list. */
export const PAGE_SIZE = 25;

export const USER_STATUSES = ["all", "active", "suspended", "deleted"] as const;
export type UserStatusFilter = (typeof USER_STATUSES)[number];

/**
 * A searchParams schema, so it is parsed once and every field has a safe default.
 *
 * `.catch()` on each field rather than a failing `.safeParse`: a hand-edited URL
 * (`?page=banana`) must degrade to the default view, never a 500. The whole point
 * of putting filters in the URL is that people edit and share them.
 */
export const userListQuerySchema = z.object({
  q: z.string().trim().max(200).catch(""),
  status: z.enum(USER_STATUSES).catch("all"),
  from: z.string().trim().catch(""),
  to: z.string().trim().catch(""),
  // Clamped: a huge offset is a cheap way to make Postgres sort the whole table.
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const orgListQuerySchema = z.object({
  q: z.string().trim().max(200).catch(""),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export type OrgListQuery = z.infer<typeof orgListQuerySchema>;

export const auditListQuerySchema = z.object({
  /** Matches actor email, target label, or action. */
  q: z.string().trim().max(200).catch(""),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

/** Payloads for the admin server actions. */
export const userTargetSchema = z.object({
  userId: z.string().min(1),
});

export const suspendUserSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export const orgTargetSchema = z.object({
  organizationId: z.string().min(1),
});

export const setSuperAdminSchema = z.object({
  userId: z.string().min(1),
  value: z.enum(["grant", "revoke"]),
});
