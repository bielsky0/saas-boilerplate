import { NextResponse, type NextRequest } from "next/server";

import { resolveStorageOwner } from "@/features/storage/context";
import { confirmUpload } from "@/features/storage/presign";
import { confirmInputSchema } from "@/features/storage/schema";

/**
 * Upload confirmation (spec 21.2, step 5). Flips the pending row created at
 * presign time to `ready` once the client reports the bucket upload landed.
 * Owner-scoped: confirming a file that isn't the caller's tenant's is a 404.
 *
 * Body: { slug?, fileId }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as
    (Record<string, unknown> & { slug?: unknown }) | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : null;

  const parsed = confirmInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  const { owner } = await resolveStorageOwner(slug, "storage.upload");
  const ok = await confirmUpload(owner, parsed.data.fileId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
