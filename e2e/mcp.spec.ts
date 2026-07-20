import { expect, test, type APIRequestContext } from "@playwright/test";

import { registerViaApi, seedOrg, uniqueEmail } from "./helpers";

/**
 * MCP / AI Agent E2E (spec 26) — the two acceptance criteria for 11a.4:
 *   1. a tool call for data OUTSIDE the acting user's context returns a denial,
 *      never another organization's rows (tenant isolation, §26.1/§26.2);
 *   2. the OAuth 2.0 boundary is in place — an unauthenticated `/api/mcp` call is
 *      rejected with the discovery pointer that starts the flow.
 *
 * The full OAuth handshake (dynamic registration → login → consent → token) is a
 * browser/agent concern; here we assert the boundary directly and drive the tool
 * logic through the `/api/dev/mcp` seam, which calls the SAME `resolveMcp*`
 * chokepoint the real tools use. Runs offline, no external services.
 */

type ToolBody = { email: string; tool: string; slug?: string };

async function callTool(request: APIRequestContext, body: ToolBody) {
  const res = await request.post("/api/dev/mcp", { data: body });
  if (!res.ok()) throw new Error(`callTool failed (${res.status()}): ${await res.text()}`);
  return res.json() as Promise<{ data?: unknown; denied?: boolean }>;
}

test.describe("MCP OAuth boundary", () => {
  test("unauthenticated /api/mcp is rejected with a resource-metadata pointer", async ({
    request,
  }) => {
    const res = await request.post("/api/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
    const wwwAuth = res.headers()["www-authenticate"] ?? "";
    expect(wwwAuth).toContain("resource_metadata");
    expect(wwwAuth).toContain("/.well-known/oauth-protected-resource");
  });

  test("protected-resource metadata is served at the origin root", async ({ request }) => {
    const res = await request.get("/.well-known/oauth-protected-resource");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      resource?: string;
      authorization_servers?: string[];
    };
    expect(body.resource).toBeTruthy();
    expect(Array.isArray(body.authorization_servers)).toBe(true);
    expect(body.authorization_servers!.length).toBeGreaterThan(0);
  });

  test("authorization-server metadata advertises the OAuth endpoints", async ({ request }) => {
    const res = await request.get("/.well-known/oauth-authorization-server");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
      registration_endpoint?: string;
    };
    expect(body.authorization_endpoint).toContain("/mcp/authorize");
    expect(body.token_endpoint).toContain("/mcp/token");
    expect(body.registration_endpoint).toContain("/mcp/register");
  });
});

test.describe("MCP tenant isolation", () => {
  test("an agent only ever sees the acting user's own tenants", async ({ request }) => {
    const alice = uniqueEmail("mcp-alice");
    const bob = uniqueEmail("mcp-bob");
    await registerViaApi(request, alice);
    await registerViaApi(request, bob);

    const { slug: aliceOrg } = await seedOrg(request, { ownerEmail: alice, name: "Alice Org" });
    const { slug: bobOrg } = await seedOrg(request, { ownerEmail: bob, name: "Bob Org" });

    // list_organizations: Alice sees hers, never Bob's.
    const orgs = (await callTool(request, { email: alice, tool: "list_organizations" }))
      .data as Array<{ slug: string }>;
    const slugs = orgs.map((o) => o.slug);
    expect(slugs).toContain(aliceOrg);
    expect(slugs).not.toContain(bobOrg);

    // list_members of her OWN org: allowed, includes her.
    const own = (await callTool(request, { email: alice, tool: "list_members", slug: aliceOrg }))
      .data as { members: Array<{ email: string }> };
    expect(own.members.map((m) => m.email)).toContain(alice);

    // list_members of Bob's org: denied — NOT Bob's data. (Criterion #1.)
    const cross = await callTool(request, { email: alice, tool: "list_members", slug: bobOrg });
    expect(cross.denied).toBe(true);
    expect(cross.data).toBeUndefined();

    // Notifications scoped to a foreign org: also denied, not silently personal.
    const crossNotif = await callTool(request, {
      email: alice,
      tool: "count_unread_notifications",
      slug: bobOrg,
    });
    expect(crossNotif.denied).toBe(true);

    // Personal context (no slug): allowed, a real count.
    const personal = (await callTool(request, { email: alice, tool: "count_unread_notifications" }))
      .data as { unread: number };
    expect(typeof personal.unread).toBe("number");
  });
});
