import { NextResponse, type NextRequest } from "next/server";

import { resolveStorageOwner } from "@/features/storage/context";
import { getReadableFile, removeFile } from "@/features/storage/presign";
import { storageErrorResponse } from "@/features/storage/http";

/**
 * Read / delete one file (spec 21.3 / 21.4).
 *
 * The owner comes from `?slug=` (org context) or the session (personal). Both
 * verbs go through the owner-scoped data layer, so a file belonging to another
 * tenant is indistinguishable from one that doesn't exist — a 404, never a 403
 * that would leak its existence. This is the tenant-isolation acceptance test.
 *
 * GET returns a usable URL: the stable public URL for public files, a short-lived
 * presigned GET for private ones (the bucket denies the bare object URL).
 * DELETE soft-deletes (retention purge removes the object later) and needs
 * `storage.delete` in an org context.
 */
function slugOf(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get("slug");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { owner } = await resolveStorageOwner(slugOf(request), null);
  try {
    const file = await getReadableFile(owner, id);
    if (!file) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(file);
  } catch (err) {
    const mapped = storageErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { owner } = await resolveStorageOwner(slugOf(request), "storage.delete");
  const ok = await removeFile(owner, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
