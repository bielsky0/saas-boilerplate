import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * Billing webhook endpoint (spec 5.4) — thin byte relay since verification
 * moved to Nest (`POST /v1/billing/webhook`, faza 2.5). Stripe points its
 * dashboard at the API directly; this route exists so the E2E suite (and any
 * previously configured dashboard URL) keeps speaking the web origin.
 *
 * Forwards the RAW bytes, never a re-serialized object: the signature covers
 * the exact bytes Stripe sent, so parsing here would invalidate it. Shape and
 * status codes pass through untouched (`{ received, status }`, 400 on bad
 * signature, 404 unconfigured). Deliberately unauthenticated and exempted in
 * `src/proxy.ts` — the signature is the authentication, and providers do not
 * follow redirects.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const target = `${env.API_BASE_URL.replace(/\/+$/, "")}/v1/billing/webhook`;

  const headers = new Headers();
  const signature = request.headers.get("stripe-signature");
  if (signature) headers.set("stripe-signature", signature);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers,
      body: Buffer.from(await request.arrayBuffer()),
      redirect: "manual",
    });
  } catch {
    return NextResponse.json({ error: "Billing service unavailable" }, { status: 502 });
  }

  return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
