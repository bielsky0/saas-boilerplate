/**
 * RBAC feature module (spec 4 — role-based access control).
 *
 * The centralized role → permissions map (spec 4.1): the SINGLE source of truth
 * for what each predefined role may do, so authorization is never scattered
 * across components. Enforcement is on the backend (spec 4.2) — see
 * `requireOrgPermission` in `features/organizations/context.ts`, which reads this
 * map and calls Next's `forbidden()` (403) when a permission is missing. UI
 * hiding/disabling uses `hasPermission` cosmetically only.
 *
 * Predefined roles only for this phase; custom per-org roles (§4.3) are a future
 * extension that would layer a DB-backed role→permission map over this same shape.
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
  | "storage.delete";

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
  ],
  admin: [
    "members.invite",
    "members.remove",
    "members.update_role",
    "invitations.revoke",
    "organization.update",
    "organization.leave",
    "storage.upload",
    "storage.delete",
  ],
  // Members may upload content, but not delete other people's files.
  member: ["organization.leave", "storage.upload"],
};

/** True if `role` grants `permission`. Pure — safe for both UI and backend use. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Narrow an arbitrary string (e.g. a DB `role` column) to a known `Role`. */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
