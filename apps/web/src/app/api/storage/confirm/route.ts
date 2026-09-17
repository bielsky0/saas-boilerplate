import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * Upload confirmation (spec 21.2) — thin reverse proxy since confirmation
 * moved to Nest (`POST /v1/storage/confirm`, faza 2.4). The session cookie
 * rides along untouched; Nest flips the pending row to `ready` (owner-scoped,
 * another tenant's file is a 404) and answers `{ ok: true }`, relayed as-is.
 *
 * Body: { slug?, fileId }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const target = new URL("/v1/storage/confirm", env.API_BASE_URL.replace(/\/+$/, ""));
  const cookie = request.headers.get("cookie");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: Buffer.from(await request.arrayBuffer()),
      redirect: "manual",
    });
  } catch {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 502 });
  }

  return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
