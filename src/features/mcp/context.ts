import { hasPermission, isRole, type Permission, type Role } from "@/features/rbac";
import {
  ensurePersonalAccount,
  getMembership,
  getOrgBySlug,
  getPersonalAccountByUserId,
} from "@/features/organizations/data";
import type { NotificationOwner } from "@/features/notifications/data";

/**
 * MCP tenant + RBAC resolution (spec 26.1 → 4.2 / 11.2).
 *
 * The single chokepoint every MCP tool calls before touching data — the agent's
 * counterpart to `requireOrgAccess`/`resolveNotificationOwner`. It composes the
 * SAME primitives the web path uses (`getOrgBySlug`, `getMembership`, the central
 * `hasPermission` map, `getPersonalAccountByUserId`); it exists separately only
 * because those web guards read the session from the request COOKIE and signal
 * failure with Next control-flow (`forbidden()`/`notFound()`) meant for page
 * rendering — neither fits an OAuth-bearer handler. Here the identity is the
 * token's `userId` and failure is a plain `null` the tool turns into a denial.
 *
 * DELIBERATELY INDISTINGUISHABLE: a missing org and a non-membership both return
 * `null`, so an agent probing slugs cannot tell "no such org" from "not yours"
 * (§26.2 — physically no access to data outside the acting context).
 */

export type McpOrgAccess = {
  org: { id: string; name: string; slug: string };
  role: Role;
};

/** Active membership in the org at `slug`, or `null` — never another tenant's data. */
export async function resolveMcpOrg(userId: string, slug: string): Promise<McpOrgAccess | null> {
  const org = await getOrgBySlug(slug);
  if (!org) return null;
  const membership = await getMembership(org.id, userId);
  if (!membership || membership.status !== "active" || !isRole(membership.role)) return null;
  return { org: { id: org.id, name: org.name, slug: org.slug }, role: membership.role };
}

/**
 * Like `resolveMcpOrg`, then a specific permission from the central RBAC map. Not
 * needed by the read tools shipped here (reading one's own bell/members needs only
 * membership, mirroring `resolveNotificationOwner`) — it is the extension point for
 * the first WRITE tool, so permission-gated actions reuse the identical map the UI
 * enforces rather than re-deriving authorization.
 */
export async function resolveMcpOrgPermission(
  userId: string,
  slug: string,
  permission: Permission,
): Promise<McpOrgAccess | null> {
  const access = await resolveMcpOrg(userId, slug);
  if (!access) return null;
  return hasPermission(access.role, permission) ? access : null;
}

/** The tenant a notification tool acts as (spec 23.1): org when `slug` is given, else personal. */
export type McpOwner = { owner: NotificationOwner; tenant: { kind: string; ref: string } };

export async function resolveMcpOwner(
  userId: string,
  slug: string | null,
): Promise<McpOwner | null> {
  if (slug) {
    const access = await resolveMcpOrg(userId, slug);
    if (!access) return null;
    return {
      owner: { kind: "organization", organizationId: access.org.id },
      tenant: { kind: "organization", ref: access.org.slug },
    };
  }

  let account = await getPersonalAccountByUserId(userId);
  if (!account) {
    // Self-heal for accounts seeded before personal accounts existed (§3.1) —
    // the same backfill `resolveNotificationOwner` performs.
    await ensurePersonalAccount(userId);
    account = await getPersonalAccountByUserId(userId);
  }
  if (!account) throw new Error(`no personal account for user ${userId}`);
  return {
    owner: { kind: "personal", accountId: account.id },
    tenant: { kind: "personal", ref: account.id },
  };
}
