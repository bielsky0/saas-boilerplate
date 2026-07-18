import { withMcpAuth } from "better-auth/plugins";
import { createMcpHandler } from "mcp-handler";

import { auth } from "@/lib/adapters/auth";
import { runWithMcpActor } from "@/features/mcp/actor";
import { registerMcpTools } from "@/features/mcp/tools";

/**
 * MCP endpoint (spec 26 — AI Agent), read-only first increment.
 *
 * Three layers, each doing one job:
 *   - `withMcpAuth(auth, …)` is the boundary: it resolves the OAuth 2.0 bearer
 *     token to a real user, or answers 401 with the `WWW-Authenticate` that starts
 *     the flow. The agent gets in only as a specific, verified user (§26.1).
 *   - `runWithMcpActor(userId, …)` seeds that user id for the duration of the
 *     request so tools read identity from the token, never from a tool argument.
 *   - `createMcpHandler` speaks Streamable HTTP and dispatches to the tools, which
 *     funnel every read through the same RBAC/tenant primitives as the UI.
 *
 * `basePath: "/api"` makes the transport's endpoint `/api/mcp`, matching this
 * route. SSE is disabled: the current MCP spec uses Streamable HTTP, and a single
 * request/response path needs no long-lived connection (§23.4 note — do not build
 * ahead of need). Node runtime: AsyncLocalStorage and the pg driver are not
 * edge-compatible.
 */
export const runtime = "nodejs";

const baseHandler = createMcpHandler(
  (server) => {
    registerMcpTools(server);
  },
  { serverInfo: { name: "saas-boilerplate", version: "1.0.0" } },
  { basePath: "/api", disableSse: true },
);

const handler = withMcpAuth(auth, (req, session) =>
  runWithMcpActor(session.userId, () => baseHandler(req)),
);

export { handler as GET, handler as POST };
