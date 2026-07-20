import { NextResponse, type NextRequest } from "next/server";

import { resolveStorageOwner } from "@/features/storage/context";
import { getReadableFile, removeFile } from "@/features/storage/presign";
import { storageErrorResponse } from "@/features/storage/http";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { owner } = await resolveStorageOwner(null);
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
  const { owner } = await resolveStorageOwner("storage.delete");
  const ok = await removeFile(owner, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
