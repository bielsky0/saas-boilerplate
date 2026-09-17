import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * Presigned upload endpoint (spec 21.2) — thin reverse proxy since uploads
 * moved to Nest (`POST /v1/storage/presign`, faza 2.4). The session cookie
 * rides along untouched; Nest validates, mints the presigned POST and
 * records the pending row, answering `201 { fileId, upload }`, `422` on a
 * disallowed type/oversize, or `404` when no provider is configured — all
 * relayed as-is (the 201 especially: the E2E upload flow asserts it).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const target = new URL("/v1/storage/presign", env.API_BASE_URL.replace(/\/+$/, ""));
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
