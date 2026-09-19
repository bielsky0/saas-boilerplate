import { All, Controller, Get, Inject, Req, Res } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createMcpHandler } from "mcp-handler";
import {
  oAuthDiscoveryMetadata,
  oAuthProtectedResourceMetadata,
  withMcpAuth,
} from "better-auth/plugins";

import { AUTH_ENGINE, type AuthEngine } from "../auth/auth-engine";
import { runWithMcpActor } from "./mcp-actor";
import { registerMcpTools } from "./mcp-tools";
import { McpService } from "./mcp.service";

/**
 * MCP endpoint + OAuth discovery (spec 26 — AI Agent, faza 2.7).
 *
 * Three layers on `/api/mcp`, each doing one job (same as the web route did
 * before the port):
 *   - `withMcpAuth(engine, …)` is the boundary: it resolves the OAuth 2.0
 *     bearer token to a real user, or answers 401 with the `WWW-Authenticate`
 *     that starts the flow. The agent gets in only as a specific, verified
 *     user (§26.1).
 *   - `runWithMcpActor(userId, …)` seeds that user id for the duration of the
 *     request so tools read identity from the token, never from a tool arg.
 *   - `createMcpHandler` speaks Streamable HTTP and dispatches to the tools,
 *     which funnel every read through the same RBAC/tenant primitives as
 *     the UI.
 *
 * `basePath: "/api"` makes the transport's endpoint `/api/mcp`, matching this
 * route. SSE is disabled: the current MCP spec uses Streamable HTTP, and a
 * single request/response path needs no long-lived connection. The two
 * `/.well-known/*` routes are the origin-root discovery documents MCP clients
 * probe directly against the API (faza 3.5 — the web serves no relay for
 * them; clients point at the API origin).
 *
 * The handlers below are Web-standard `(Request) => Response` functions from
 * `better-auth`/`mcp-handler`, so this controller bridges Express req/res
 * across that boundary (status + headers + bytes, relayed untouched).
 */

function toWebRequest(req: ExpressRequest): Request {
  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string" && value !== "") headers.set(name, value);
    else if (Array.isArray(value) && value.length > 0) headers.set(name, value.join(", "));
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { method: req.method, headers });
  }
  // `rawBody: true` in bootstrap preserves the exact bytes (the billing
  // webhook relies on the same); fall back to re-serializing the parsed body
  // when the buffer is absent (e.g. a test harness without the raw capture).
  const raw = (req as unknown as { rawBody?: unknown }).rawBody;
  const body = Buffer.isBuffer(raw) ? raw : Buffer.from(JSON.stringify(req.body ?? {}));
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(url, { method: req.method, headers, body });
}

async function sendWebResponse(res: ExpressResponse, webRes: Response): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    // `Set-Cookie` rides separately below: one header per cookie, or all but
    // one vanish when merged.
    if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
  });
  const setCookies =
    typeof webRes.headers.getSetCookie === "function" ? webRes.headers.getSetCookie() : [];
  for (const cookie of setCookies) res.append("set-cookie", cookie);
  res.send(Buffer.from(await webRes.arrayBuffer()));
}

@Controller()
export class McpController {
  private readonly handleMcp: (req: Request) => Promise<Response>;
  private readonly handleDiscovery: (req: Request) => Promise<Response>;
  private readonly handleProtected: (req: Request) => Promise<Response>;

  constructor(@Inject(AUTH_ENGINE) engine: AuthEngine, mcp: McpService) {
    const baseHandler = createMcpHandler(
      (server) => {
        registerMcpTools(server, mcp);
      },
      { serverInfo: { name: "saas-boilerplate", version: "1.0.0" } },
      { basePath: "/api", disableSse: true },
    );
    this.handleMcp = withMcpAuth(engine, (req, session) =>
      runWithMcpActor(session.userId, () => baseHandler(req)),
    );
    this.handleDiscovery = oAuthDiscoveryMetadata(engine);
    this.handleProtected = oAuthProtectedResourceMetadata(engine);
  }

  @All("api/mcp")
  async mcp(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    await sendWebResponse(res, await this.handleMcp(toWebRequest(req)));
  }

  @Get(".well-known/oauth-authorization-server")
  async discovery(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    await sendWebResponse(res, await this.handleDiscovery(toWebRequest(req)));
  }

  @Get(".well-known/oauth-protected-resource")
  async protectedResource(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    await sendWebResponse(res, await this.handleProtected(toWebRequest(req)));
  }
}
