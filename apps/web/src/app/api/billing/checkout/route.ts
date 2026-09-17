import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@repo/api-client";
import { api } from "@/lib/api";
import { invalidJson } from "@/lib/validation/http";

/**
 * Hosted checkout (spec 5.3) — thin reverse proxy since the money path moved
 * to Nest (`POST /v1/billing/checkout`, faza 2.5).
 *
 * Shape and status codes pass through untouched, so the buttons and the E2E
 * suite see no difference: the provider URL as JSON (the client navigates via
 * `window.location.assign`), 404 for unpurchasable/unconfigured, 422 for
 * malformed input, 502 when the provider is down. Session-protected by the
 * proxy (anonymous requests 307 to login before ever reaching here); the
 * session cookie is forwarded by `@/lib/api`, Nest re-checks `billing.manage`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!body) return invalidJson();

  try {
    const data = await api().post<{ url: string }>("/v1/billing/checkout", body);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        error.issues !== undefined
          ? { error: error.code, issues: error.issues }
          : { error: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "Payment provider is unavailable" }, { status: 502 });
  }
}
