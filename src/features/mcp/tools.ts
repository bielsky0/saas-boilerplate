import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { requestLogger } from "@/lib/logger";
import { listMembers, listUserOrgs } from "@/features/organizations/data";
import { countUnread, listNotificationsForUser } from "@/features/notifications/data";
import { getMcpActor } from "./actor";
import { resolveMcpOrg, resolveMcpOwner } from "./context";

/**
 * The MCP tool surface (spec 26) — READ-ONLY, first increment.
 *
 * Every tool follows one shape, and the shape IS the security model:
 *   1. take the acting user from the verified token (`getMcpActor`), never an arg;
 *   2. resolve tenant + membership through `./context` (same primitives as the UI);
 *   3. a `null` from the resolver becomes a denial — the agent gets no data it
 *      could not see in the normal app, and cannot tell "no such org" from "not
 *      yours" (§26.2);
 *   4. emit ONE structured log line, request-id-correlated like any user call
 *      (§15.3), so an agent action is as visible as a person's (§26 acceptance).
 *
 * Reads scoped to the caller's own memberships/bell need membership only, not a
 * named permission — the same rule `resolveNotificationOwner` follows. Write tools
 * (a later increment) would gate on `resolveMcpOrgPermission` instead.
 */

const DENIED = "You do not have access to that, or it does not exist in your current context.";

function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function denied(): CallToolResult {
  return { content: [{ type: "text", text: DENIED }], isError: true };
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool(
    "list_organizations",
    {
      title: "List organizations",
      description:
        "List the organizations the current user is an active member of, with their role in each.",
    },
    async () => {
      const { userId } = getMcpActor();
      const orgs = await listUserOrgs(userId);
      const log = await requestLogger("mcp");
      log.info("tool", { tool: "list_organizations", userId, resultCount: orgs.length });
      return json(orgs);
    },
  );

  server.registerTool(
    "list_members",
    {
      title: "List organization members",
      description:
        "List the members of an organization the current user belongs to, identified by its slug.",
      inputSchema: { slug: z.string() },
    },
    async ({ slug }) => {
      const { userId } = getMcpActor();
      const log = await requestLogger("mcp");
      const access = await resolveMcpOrg(userId, slug);
      if (!access) {
        log.info("tool", { tool: "list_members", userId, slug, outcome: "denied" });
        return denied();
      }
      const members = await listMembers(access.org.id);
      log.info("tool", {
        tool: "list_members",
        userId,
        tenant: { kind: "organization", ref: access.org.slug },
        resultCount: members.length,
      });
      return json({ organization: access.org, memberCount: members.length, members });
    },
  );

  server.registerTool(
    "count_unread_notifications",
    {
      title: "Count unread notifications",
      description:
        "Count the current user's unread notifications. Pass an organization slug to scope to that team; omit it for the personal account.",
      inputSchema: { slug: z.string().optional() },
    },
    async ({ slug }) => {
      const { userId } = getMcpActor();
      const log = await requestLogger("mcp");
      const resolved = await resolveMcpOwner(userId, slug ?? null);
      if (!resolved) {
        log.info("tool", { tool: "count_unread_notifications", userId, slug, outcome: "denied" });
        return denied();
      }
      const unread = await countUnread(userId, resolved.owner);
      log.info("tool", {
        tool: "count_unread_notifications",
        userId,
        tenant: resolved.tenant,
        resultCount: unread,
      });
      return json({ unread });
    },
  );

  server.registerTool(
    "list_recent_notifications",
    {
      title: "List recent notifications",
      description:
        "List the current user's most recent notifications, newest first. Pass an organization slug to scope to that team; omit it for the personal account.",
      inputSchema: {
        slug: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ slug, limit }) => {
      const { userId } = getMcpActor();
      const log = await requestLogger("mcp");
      const resolved = await resolveMcpOwner(userId, slug ?? null);
      if (!resolved) {
        log.info("tool", { tool: "list_recent_notifications", userId, slug, outcome: "denied" });
        return denied();
      }
      const notifications = await listNotificationsForUser(userId, resolved.owner, limit);
      log.info("tool", {
        tool: "list_recent_notifications",
        userId,
        tenant: resolved.tenant,
        resultCount: notifications.length,
      });
      return json({ notifications });
    },
  );
}
