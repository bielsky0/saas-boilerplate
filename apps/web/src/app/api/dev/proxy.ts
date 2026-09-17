import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * Test-only dev proxy (spec 14.1 — faza 2.1 → 2.3). The seams (`seed-user`,
 * `user`, `rate-limit`, `seed-org`, plus the delivery seams `emails`,
 * `emails/fail-next`, `jobs`, `jobs/run`, `notifications`,
 * `notification-preference`) live in Nest now; the E2E suite calls them on
 * the web origin unchanged, so these routes forward and relay. 404 in
 * production — checked here AND in Nest, so a misconfigured API cannot leak
 * a seam.
 */

const FORWARDED_HEADERS = [
  "accept-language",
  "content-type",
  "cookie",
  "user-agent",
  "x-app-locale",
  "x-e2e-rate-limit-bucket",
];

export async function proxyDev(
  request: NextRequest,
  path: string,
  method: "GET" | "POST",
): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = new URL(`${path}${request.nextUrl.search}`, env.API_BASE_URL.replace(/\/+$/, ""));

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method, headers, redirect: "manual" };
  if (method === "POST") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 502 });
  }

  return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
