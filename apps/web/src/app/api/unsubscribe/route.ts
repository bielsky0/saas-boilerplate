import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * RFC 8058 one-click unsubscribe (spec 10.3) — thin reverse proxy since the
 * suppression ledger moved to Nest (`POST /v1/unsubscribe`, faza 2.3). The
 * signed query (`?e=&c=&t=`) and the one-click body ride along untouched;
 * Nest suppresses and answers 200 (`{ unsubscribed: true }`), or 400 on a
 * malformed/forged link — relayed as-is, so mail clients see Nest's answer.
 *
 * POST ONLY (a GET from a scanner means nothing); unauthenticated by design
 * (the HMAC is the auth), hence still exempted in `src/proxy.ts`. Unlike the
 * `/api/dev/*` seams this route is PUBLIC in production — real inboxes hit
 * it — so it forwards directly instead of via `proxyDev` (which 404s on prod).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const target = new URL(
    `/v1/unsubscribe${request.nextUrl.search}`,
    env.API_BASE_URL.replace(/\/+$/, ""),
  );

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/x-www-form-urlencoded",
      },
      body: Buffer.from(await request.arrayBuffer()),
      redirect: "manual",
    });
  } catch {
    return NextResponse.json({ error: "Unsubscribe unavailable" }, { status: 502 });
  }

  return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
