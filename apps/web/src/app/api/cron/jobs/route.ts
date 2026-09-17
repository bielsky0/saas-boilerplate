import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * Job drain endpoint (spec 12) — thin reverse proxy since the drain moved to
 * Nest (`GET /v1/cron/jobs`, faza 2.3). The `Authorization` bearer is
 * forwarded untouched; Nest answers 404 (no secret) / 401 (bad token) / 200
 * (`{ claimed, succeeded, ... }`) and this route relays all three, so cron
 * pingers and the E2E guard assertions see no difference.
 *
 * Stays exempted in `src/proxy.ts`: without the exemption an unauthenticated
 * ping would 307 to /login, and a cron pinger follows redirects — a green
 * dashboard over a dead queue.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const target = new URL("/v1/cron/jobs", env.API_BASE_URL.replace(/\/+$/, ""));
  const authorization = request.headers.get("authorization");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: authorization ? { authorization } : {},
      redirect: "manual",
    });
  } catch {
    return NextResponse.json({ error: "Job service unavailable" }, { status: 502 });
  }

  return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
