import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@repo/api-client";
import { api } from "@/lib/api";

/**
 * Mark one notification read — thin proxy to `PATCH /v1/notifications/:id/read`.
 * Fire-and-forget from the bell: Nest answers `{ ok: true }` (idempotent —
 * an already-read or foreign id still answers ok, same as the server action
 * this route replaces, which returned void silently).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const slug = request.nextUrl.searchParams.get("slug");
  try {
    const data = await api().patch<{ ok: boolean }>(
      `/v1/notifications/${encodeURIComponent(id)}/read`,
      undefined,
      { query: slug ? { slug } : {} },
    );
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 502 });
  }
}
