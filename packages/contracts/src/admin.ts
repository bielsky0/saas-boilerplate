/**
 * Super-admin DTO (spec 6 — framework-free).
 *
 * The JSON shape every backend (NestJS today, FastAPI tomorrow) returns and
 * every frontend consumes for the cross-tenant panel views. Mirrors
 * `packages/contracts/openapi.yaml` (paths `/v1/admin/*`); the YAML is the
 * source of truth, this file is the typed view of it.
 *
 * Zero Drizzle/Next/Nest imports — JSON primitives only, so payloads stay
 * serializable across the HTTP boundary. Dates arrive as ISO strings; the
 * reader converts with `new Date(...)` (see the org audit page precedent).
 */

export type AdminUserStatus = "active" | "suspended" | "deleted";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
  status: AdminUserStatus;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUser {
  banReason: string | null;
  deletedAt: string | null;
  orgs: { id: string; name: string; slug: string; role: string; status: string }[];
  solelyOwnedOrgs: { id: string; name: string; slug: string }[];
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  planId: string | null;
  subscriptionStatus: string | null;
  seats: number | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface AdminOrgDetail extends AdminOrg {
  members: { userId: string; email: string; name: string; role: string; status: string }[];
  revenue: { currency: string; netMinor: number }[];
}

export interface AdminAuditRow {
  id: string;
  action: string;
  actorType: string;
  actorEmail: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminUsersResponse {
  rows: AdminUser[];
  page: number;
  hasNext: boolean;
}

export interface AdminOrgsResponse {
  rows: AdminOrg[];
  page: number;
  hasNext: boolean;
}

export interface AdminAuditResponse {
  rows: AdminAuditRow[];
  page: number;
  hasNext: boolean;
}

/** Mutation codes — distinct so the client maps each to its own message. */
export type AdminErrorCode =
  | "USER_NOT_FOUND"
  | "ORGANIZATION_NOT_FOUND"
  | "IMPERSONATION_FORBIDDEN"
  | "NOT_IMPERSONATING"
  | "TARGET_IS_ADMIN"
  | "CANNOT_ACT_ON_SELF"
  | "ALREADY_DELETED"
  | "ALREADY_ADMIN"
  | "NOT_ADMIN"
  | "LAST_ADMIN";
