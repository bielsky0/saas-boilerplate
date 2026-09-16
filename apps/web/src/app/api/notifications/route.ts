import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@repo/api-client";
import { api } from "@/lib/api";

/**
 * Notifications polling endpoint (spec 23.2 / 23.4) — the read side of the bell.
 *
 * Thin reverse proxy since the read path moved to Nest (`GET
 * /v1/notifications`): the session cookie is forwarded by `@/lib/api`, Nest
 * resolves the owner (org `slug` → membership, absent → personal account) and
 * answers `{ unreadCount, items }`. Shape and status codes pass through
 * untouched, so the bell and the E2E suite see no difference.
 *
 * Reads only — mutations live on the PATCH routes beside this file.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get("slug");
  try {
    const data = await api().get<{ unreadCount: number; items: unknown[] }>("/v1/notifications", {
      query: slug ? { slug } : {},
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        error.issues !== undefined
          ? { error: error.code, issues: error.issues }
          : { error: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 502 });
  }
}
