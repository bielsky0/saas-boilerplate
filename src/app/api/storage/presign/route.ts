import { NextResponse, type NextRequest } from "next/server";

import { resolveStorageOwner } from "@/features/storage/context";
import { createUpload } from "@/features/storage/presign";
import { presignInputSchema } from "@/features/storage/schema";
import { storageErrorResponse } from "@/features/storage/http";

/**
 * Presigned upload endpoint (spec 21.2).
 *
 * Session-protected by the proxy (no session cookie → redirect before this runs);
 * still resolves the owner + RBAC here, because the proxy is a UX convenience, not
 * the security boundary. Validation runs BEFORE any storage/DB write: a disallowed
 * type or oversized declaration is a 422 with no row and no object created. The
 * response is a presigned POST the client uploads directly to the bucket.
 *
 * Body: { slug?, filename, contentType, size, visibility }.
 *   - `slug` present → organization context (requires `storage.upload`).
 *   - `slug` absent  → the caller's personal account.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as
    (Record<string, unknown> & { slug?: unknown }) | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : null;

  const parsed = presignInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { owner, userId } = await resolveStorageOwner(slug, "storage.upload");

  try {
    const result = await createUpload(owner, userId, parsed.data);
    return NextResponse.json({ fileId: result.fileId, upload: result.upload }, { status: 201 });
  } catch (err) {
    const mapped = storageErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
