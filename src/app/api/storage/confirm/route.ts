import { NextResponse, type NextRequest } from "next/server";

import { resolveStorageOwner } from "@/features/storage/context";
import { confirmUpload } from "@/features/storage/presign";
import { confirmInputSchema } from "@/features/storage/schema";
import { apiError, invalidJson, validationFailed } from "@/lib/validation/http";

/**
 * Upload confirmation (spec 21.2, step 5). Flips the pending row created at
 * presign time to `ready` once the client reports the bucket upload landed.
 * Owner-scoped: confirming a file that isn't the caller's tenant's is a 404.
 *
 * Body: { slug?, fileId }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!body) return invalidJson();

  const parsed = confirmInputSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { owner } = await resolveStorageOwner(parsed.data.slug ?? null, "storage.upload");
  const ok = await confirmUpload(owner, parsed.data.fileId);
  if (!ok) return apiError("Not found", 404);

  return NextResponse.json({ ok: true });
}
