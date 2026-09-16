import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@repo/api-client";
import { api } from "@/lib/api";

/**
 * Mark every notification in the active context read — thin proxy to
 * `PATCH /v1/notifications/read-all`. See the GET route beside this file.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get("slug");
  try {
    const data = await api().patch<{ ok: boolean }>("/v1/notifications/read-all", undefined, {
      query: slug ? { slug } : {},
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 502 });
  }
}
