import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { env } from "@/lib/env/server";
import { listMembers } from "@/features/organizations/data";
import { listUserOrgs } from "@/features/organizations/cross-tenant";
import { withOwner, withTenant } from "@/lib/db/tenant";
import { countUnread, listNotificationsForUser } from "@/features/notifications/data";
import { resolveMcpOrg, resolveMcpOwner } from "@/features/mcp/context";

/**
 * Test-only MCP tool driver (spec 14.1 / 26).
 *
 * Runs a tool's tenant/RBAC resolution + read the way `features/mcp/tools.ts`
 * does, but seeded from an email instead of an OAuth token — so an E2E test can
 * assert the ISOLATION boundary (criterion §26.1: data outside the acting user's
 * context comes back as a denial, never another org's rows) without standing up a
 * full OAuth client. It calls the very same `resolveMcp*` chokepoint the real tools
 * use, so it cannot pass while the real path is broken. Disabled in production.
 *
 * Body: { email, tool, slug? }. A `null` from the resolver surfaces as
 * `{ denied: true }`, mirroring the `isError` a real tool returns.
 */
type ToolName =
  | "list_organizations"
  | "list_members"
  | "count_unread_notifications"
  | "list_recent_notifications";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { email?: string; tool?: ToolName; slug?: string };
  if (!body.email || !body.tool) {
    return NextResponse.json({ error: "email and tool are required" }, { status: 400 });
  }

  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, body.email))
    .limit(1);
  if (!u) return NextResponse.json({ error: `user ${body.email} not found` }, { status: 400 });

  const userId = u.id;
  const slug = body.slug ?? null;

  switch (body.tool) {
    case "list_organizations":
      return NextResponse.json({ data: await listUserOrgs(userId) });

    case "list_members": {
      if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
      const access = await resolveMcpOrg(userId, slug);
      if (!access) return NextResponse.json({ denied: true });
      return NextResponse.json({
        data: {
          org: access.org,
          members: await withTenant(access.org.id, (tx) => listMembers(tx, access.org.id)),
        },
      });
    }

    case "count_unread_notifications": {
      const resolved = await resolveMcpOwner(userId, slug);
      if (!resolved) return NextResponse.json({ denied: true });
      const unread = await withOwner(resolved.owner, (tx) =>
        countUnread(tx, userId, resolved.owner),
      );
      return NextResponse.json({ data: { unread } });
    }

    case "list_recent_notifications": {
      const resolved = await resolveMcpOwner(userId, slug);
      if (!resolved) return NextResponse.json({ denied: true });
      return NextResponse.json({
        data: {
          notifications: await withOwner(resolved.owner, (tx) =>
            listNotificationsForUser(tx, userId, resolved.owner),
          ),
        },
      });
    }

    default:
      return NextResponse.json({ error: `unknown tool ${String(body.tool)}` }, { status: 400 });
  }
}
