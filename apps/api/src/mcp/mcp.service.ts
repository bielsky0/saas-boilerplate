import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";

import { isRole, type Role } from "@repo/contracts";
import { membership, organization, user, type Db } from "@repo/db";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { getMembership, getOrCreatePersonalAccount, getOrgBySlug } from "../tenancy/access";
import type { NotificationOwner } from "../tenancy/owner";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * MCP data service (spec 26, faza 2.7) — the Nest twin of the web app's
 * `features/mcp/context.ts` + `features/mcp/tools.ts` data layer.
 *
 * Every read follows one shape, and the shape IS the security model:
 *   1. the acting user arrives as a `userId` (verified OAuth token upstream,
 *      plain lookup in the dev seam) — never a tool argument;
 *   2. tenant + membership resolve through the SAME `tenancy/access`
 *      primitives the UI-backed flows use (`getOrgBySlug`, `getMembership`);
 *   3. a `null` from a resolver becomes a denial — the agent gets no data it
 *      could not see in the normal app, and cannot tell "no such org" from
 *      "not yours" (§26.2).
 *
 * Reads scoped to the caller's own memberships/bell need membership only,
 * not a named permission — the same rule `resolveNotificationOwner` follows.
 */

export interface McpOrgAccess {
  org: { id: string; name: string; slug: string };
  role: Role;
}

export interface McpOwner {
  owner: NotificationOwner;
  tenant: { kind: string; ref: string };
}

@Injectable()
export class McpService {
  private readonly log = new Logger("McpService");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly notifications: NotificationsService,
  ) {}

  private orgsEnabled(): boolean {
    return this.config.MULTI_TENANCY_MODE !== "disabled";
  }

  /** The orgs a user actively belongs to (for `list_organizations`). */
  async listOrganizations(
    userId: string,
  ): Promise<{ id: string; name: string; slug: string; role: string }[]> {
    if (!this.orgsEnabled()) return [];
    return this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
      })
      .from(membership)
      .innerJoin(organization, eq(membership.organizationId, organization.id))
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.status, "active"),
          isNull(organization.deletedAt),
        ),
      )
      .orderBy(organization.name);
  }

  /** Active membership in the org at `slug`, or `null` — never another tenant's data. */
  async resolveMcpOrg(userId: string, slug: string): Promise<McpOrgAccess | null> {
    if (!this.orgsEnabled()) return null;
    const org = await getOrgBySlug(this.db, slug);
    if (!org) return null;
    const member = await getMembership(this.db, org.id, userId);
    if (!member || member.status !== "active" || !isRole(member.role)) return null;
    return { org: { id: org.id, name: org.name, slug: org.slug }, role: member.role };
  }

  /** The tenant a notification tool acts as: org when `slug` is given, else personal. */
  async resolveMcpOwner(userId: string, slug: string | null): Promise<McpOwner | null> {
    if (slug) {
      const access = await this.resolveMcpOrg(userId, slug);
      if (!access) return null;
      return {
        owner: { kind: "organization", organizationId: access.org.id },
        tenant: { kind: "organization", ref: access.org.slug },
      };
    }

    const account = await getOrCreatePersonalAccount(this.db, userId);
    return {
      owner: { kind: "personal", accountId: account.id },
      tenant: { kind: "personal", ref: account.id },
    };
  }

  /** Members of an org with their user identity, newest first. */
  async listMembers(organizationId: string): Promise<
    {
      id: string;
      userId: string;
      email: string;
      name: string | null;
      role: string;
      status: string;
      createdAt: string;
    }[]
  > {
    const rows = await this.db
      .select({
        membershipId: membership.id,
        userId: membership.userId,
        email: user.email,
        name: user.name,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
      })
      .from(membership)
      .innerJoin(user, eq(membership.userId, user.id))
      .where(eq(membership.organizationId, organizationId))
      .orderBy(desc(membership.createdAt));
    return rows.map((m) => ({
      id: m.membershipId,
      userId: m.userId,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async countUnread(userId: string, owner: NotificationOwner): Promise<number> {
    return this.notifications.countUnread(userId, owner);
  }

  async listRecent(userId: string, owner: NotificationOwner, limit = 20) {
    return this.notifications.listForUser(userId, owner, limit);
  }
}
