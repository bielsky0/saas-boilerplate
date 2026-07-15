import { z } from "zod";

/**
 * Shared org validation schemas (spec 3.2–3.4). Imported by both the client forms
 * (instant feedback) and the server actions (authoritative), so rules can't be
 * bypassed by posting directly — the same pattern as `features/auth/schema.ts`.
 */

/** Slug rule: lowercase letters, digits, single hyphens; 2–48 chars. */
export const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters.")
  .max(48, "Slug must be at most 48 characters.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.");

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  // Optional: if omitted the server derives it from the name.
  slug: slugSchema.optional(),
});

/** Invitable roles — Owner is never granted via invite (ownership is transferred). */
export const invitableRole = z.enum(["admin", "member"]);
/** Assignable roles when updating an existing member (Owner promotion allowed). */
export const assignableRole = z.enum(["owner", "admin", "member"]);

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: invitableRole.default("member"),
});

export const updateRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: assignableRole,
});

export type CreateOrgValues = z.infer<typeof createOrgSchema>;
export type InviteMemberValues = z.infer<typeof inviteMemberSchema>;
