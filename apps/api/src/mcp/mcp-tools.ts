import { Logger } from "@nestjs/common";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { getMcpActor } from "./mcp-actor";
import type { McpService } from "./mcp.service";

/**
 * The MCP tool surface (spec 26, faza 2.7) — READ-ONLY, first increment.
 * Port 1:1 of the web app's `features/mcp/tools.ts`: same four tools, same
 * titles, same descriptions, same denial text, same one-log-line-per-call.
 *
 * Identity comes from the verified token (`getMcpActor`), never an arg; a
 * `null` from the service's resolvers becomes a denial, so the agent gets no
 * data it could not see in the normal app and cannot tell "no such org" from
 * "not yours" (§26.2).
 */

const log = new Logger("McpService");

const DENIED = "You do not have access to that, or it does not exist in your current context.";

function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function denied(): CallToolResult {
  return { content: [{ type: "text", text: DENIED }], isError: true };
}

export function registerMcpTools(server: McpServer, mcp: McpService): void {
  server.registerTool(
    "list_organizations",
    {
      title: "List organizations",
      description:
        "List the organizations the current user is an active member of, with their role in each.",
    },
    async () => {
      const { userId } = getMcpActor();
      const orgs = await mcp.listOrganizations(userId);
      log.log(`tool=list_organizations userId=${userId} resultCount=${orgs.length}`);
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
      const access = await mcp.resolveMcpOrg(userId, slug);
      if (!access) {
        log.log(`tool=list_members userId=${userId} slug=${slug} outcome=denied`);
        return denied();
      }
      const members = await mcp.listMembers(access.org.id);
      log.log(
        `tool=list_members userId=${userId} tenant=organization:${access.org.slug} resultCount=${members.length}`,
      );
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
      const resolved = await mcp.resolveMcpOwner(userId, slug ?? null);
      if (!resolved) {
        log.log(`tool=count_unread_notifications userId=${userId} slug=${slug} outcome=denied`);
        return denied();
      }
      const unread = await mcp.countUnread(userId, resolved.owner);
      log.log(
        `tool=count_unread_notifications userId=${userId} tenant=${resolved.tenant.kind}:${resolved.tenant.ref} resultCount=${unread}`,
      );
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
      const resolved = await mcp.resolveMcpOwner(userId, slug ?? null);
      if (!resolved) {
        log.log(`tool=list_recent_notifications userId=${userId} slug=${slug} outcome=denied`);
        return denied();
      }
      const notifications = await mcp.listRecent(userId, resolved.owner, limit ?? 20);
      log.log(
        `tool=list_recent_notifications userId=${userId} tenant=${resolved.tenant.kind}:${resolved.tenant.ref} resultCount=${notifications.length}`,
      );
      return json({ notifications });
    },
  );
}
