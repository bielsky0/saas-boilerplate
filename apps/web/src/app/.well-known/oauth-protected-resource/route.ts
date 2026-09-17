import { NextResponse } from "next/server";

import { env } from "@/lib/env/server";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728), spec 26 — AI Agent.
 *
 * Served by Nest since faza 2.7 (`McpController`); this route proxies the
 * origin-root path MCP clients probe to the API unchanged. Pre-authentication
 * by design (it is the discovery document the 401 points at).
 */
export async function GET(): Promise<NextResponse> {
  const target = new URL(
    "/.well-known/oauth-protected-resource",
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
