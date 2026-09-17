import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@repo/api-client";
import { api } from "@/lib/api";
import { invalidJson } from "@/lib/validation/http";

/**
 * Customer portal (spec 5.5) — thin reverse proxy since the money path moved
 * to Nest (`POST /v1/billing/portal`, faza 2.5).
 *
 * Same shape as the checkout route: the provider URL as JSON for the client to
 * navigate to, 404 when the tenant never checked out (or billing is
 * unconfigured), 422 for malformed input. Changes made in the portal come back
 * as webhooks; nothing here writes subscription state.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!body) return invalidJson();

  try {
    const data = await api().post<{ url: string }>("/v1/billing/portal", body);
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
