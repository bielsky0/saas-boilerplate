/**
 * RBAC role→permission map (spec 4.1).
 *
 * The SINGLE source of truth for what each predefined role may do — consumed
 * by both apps, so the two can never drift apart:
 * - web: `features/rbac/index.ts` re-exports this (UI `hasPermission` reads it
 *   cosmetically; enforcement stays backend-side per spec 4.2);
 * - api: imported from the `@repo/contracts` barrel (Nest uses
 *   `moduleResolution: node`, which does not resolve subpath exports — hence
 *   the barrel, not `@repo/contracts/rbac`; bundler consumers may use either).
 *
 * Pure and dependency-free (no imports at all), so it adds nothing to any
 * bundle and stays portable to the next backend (FastAPI, …). Enforcement
 * points read it but never extend it: add new capabilities here and grant
 * them in `ROLE_PERMISSIONS`; never inline a role check elsewhere.
 *
 * Predefined roles only; custom per-org roles (§4.3) would layer a DB-backed
 * role→permission map over this same shape.
 */

/** Predefined roles, lowest to highest privilege. */
export const ROLES = ["member", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Atomic permissions — discrete actions a role may perform. Add new capabilities
 * here and grant them in `ROLE_PERMISSIONS`; never inline a role check elsewhere.
 */
export type Permission =
  | "members.invite"
  | "members.remove"
  | "members.update_role"
  | "invitations.revoke"
  | "organization.update"
  | "organization.delete"
  | "organization.leave"
  | "storage.upload"
  | "storage.delete"
  | "audit.read"
  | "billing.manage";

/** role → permissions. Owner is a superset; Admin manages members; Member reads. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "members.invite",
    "members.remove",
    "members.update_role",
    "invitations.revoke",
    "organization.update",
    "organization.delete",
    "organization.leave",
    "storage.upload",
    "storage.delete",
    "audit.read",
    "billing.manage",
  ],
  // Admin manages people and settings, but NOT money.
  //
  // `billing.manage` is owner-only alongside `organization.delete`: it authorizes
  // spending the organization's money and changing what it owes every month,
  // which is a different kind of authority from managing colleagues. Chosen as
  // the conservative default because the spec gives no guidance (§4.1 only names
  // the permission) — widening it later is one line, while narrowing it after
  // admins rely on it is a breaking change.
  admin: [
    "members.invite",
    "members.remove",
    "members.update_role",
    "invitations.revoke",
    "organization.update",
    "organization.leave",
    "storage.upload",
    "storage.delete",
    "audit.read",
  ],
  // Members may upload content, but not delete other people's files.
  //
  // NOT granted `audit.read` (§6.4): the trail records who removed whom and whose
  // role changed, which is management information about colleagues rather than
  // content. Owner/Admin are the roles accountable for those actions and so the
  // ones with standing to review them.
  member: ["organization.leave", "storage.upload"],
};

/** True if `role` grants `permission`. Pure — safe for guards, services, and UI. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Narrow an arbitrary string (e.g. a DB `role` column) to a known `Role`. */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
