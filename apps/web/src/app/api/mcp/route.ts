import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * MCP reverse proxy (spec 26 — AI Agent, faza 2.7). The endpoint lives in
 * Nest (`apps/api`, `McpController`); this route forwards the MCP client
 * there and relays the answer — status, body, and the headers the protocol
 * needs — back untouched.
 *
 * Clients call the PUBLIC web URL, so the OAuth discovery this app serves
 * keeps working without every deployment rewiring its client config. The
 * bearer token crosses the process boundary in `authorization` (allowlisted,
 * never logged); `withMcpAuth` in Nest is the boundary that verifies it.
 *
 * `redirect: "manual"` is load-bearing: following a redirect here would
 * swallow the upstream status (notably the 401 whose `WWW-Authenticate`
 * starts the OAuth flow). This path stays in the proxy public allowlist —
 * the caller is an AI agent with a bearer token, not a browser with a
 * session, so guarding it would 307 an API client to /login.
 */

/** Inbound headers allowed across the process boundary (allowlist, not a pipe). */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "last-event-id",
  "mcp-protocol-version",
  "mcp-session-id",
  "x-e2e-rate-limit-bucket",
];

/** Response headers relayed back (status + body always). */
const RELAYED_RESPONSE_HEADERS = ["content-type", "mcp-session-id", "www-authenticate"];

async function proxy(request: NextRequest, method: string): Promise<NextResponse> {
  const target = new URL(`/api/mcp${request.nextUrl.search}`, env.API_BASE_URL.replace(/\/+$/, ""));

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json({ error: "Agent service unavailable" }, { status: 502 });
  }

  const res = new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
  });
  for (const name of RELAYED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.headers.set(name, value);
  }
  return res;
}

export function GET(request: NextRequest): Promise<Response> {
  return proxy(request, "GET");
}

export function POST(request: NextRequest): Promise<Response> {
  return proxy(request, "POST");
}
