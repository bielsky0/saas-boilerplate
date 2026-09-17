import { NextResponse } from "next/server";

import { env } from "@/lib/env/server";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414), spec 26 — AI Agent.
 *
 * Served by Nest since faza 2.7 (`McpController`); this route proxies the
 * origin-root path MCP clients probe to the API unchanged. Reachable without
 * a session by design (it is pre-authentication discovery). It needs no proxy
 * exemption: the guard's matcher skips any path containing a dot, and
 * `.well-known` has one — so this file is served directly.
 */
export async function GET(): Promise<NextResponse> {
  const target = new URL(
    "/.well-known/oauth-authorization-server",
    env.API_BASE_URL.replace(/\/+$/, ""),
  );
  try {
    const upstream = await fetch(target, { redirect: "manual" });
    return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Agent service unavailable" }, { status: 502 });
  }
}
