import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * Read / delete one file (spec 21.3 / 21.4) — thin reverse proxy since files
 * moved to Nest (`GET/DELETE /v1/storage/files/:id`, faza 2.4). The session
 * cookie rides along untouched; Nest resolves the owner from `?slug=` (org)
 * or the session (personal) and answers through its owner-scoped data layer,
 * so another tenant's file is a 404, relayed as-is.
 *
 * GET returns a usable URL (stable public URL, or a short-lived presigned
 * GET for private files). DELETE soft-deletes and needs `storage.delete` in
 * an org context.
 */
function target(request: NextRequest, id: string): URL {
  const upstream = new URL(
    `/v1/storage/files/${encodeURIComponent(id)}`,
    env.API_BASE_URL.replace(/\/+$/, ""),
  );
  upstream.search = request.nextUrl.search;
  return upstream;
}

function forwardHeaders(request: NextRequest): HeadersInit {
  const cookie = request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(target(request, id), {
      headers: forwardHeaders(request),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(target(request, id), {
      method: "DELETE",
      headers: forwardHeaders(request),
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
