/**
 * Organizations DTO (spec 3, 4.2, 6.4 — framework-free).
 *
 * The JSON shape every backend (NestJS today, FastAPI tomorrow) returns and
 * every frontend (Next.js today, Vue/mobile tomorrow) consumes. Mirrors
 * `packages/contracts/openapi.yaml` (paths `/v1/organizations/*`); the YAML
 * is the source of truth, this file is the typed view of it.
 *
 * Zero Drizzle/Next/Nest imports — JSON primitives only, so payloads stay
 * serializable across the HTTP boundary (same rule as queue payloads in
 * `backend-contract.md`).
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationWithRole extends Organization {
  role: string;
}

export interface Member {
  /** Membership row id (path param `{memberId}`), not the user id. */
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

export interface OrgAuditRow {
  id: string;
  action: string;
  actorType: string;
  actorEmail: string;
  targetType: string;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  hasNext: boolean;
}

/** 409 codes — distinct so the client maps each to its own form message. */
export type OrgErrorCode = "LAST_OWNER" | "SLUG_TAKEN" | "INVALID_TOKEN";

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  newSlug?: string;
}

export interface CreateInvitationInput {
  email: string;
  role: "admin" | "member";
}

export interface UpdateMemberRoleInput {
  role: "owner" | "admin" | "member";
}

export interface AcceptInvitationResult {
  slug: string;
}
