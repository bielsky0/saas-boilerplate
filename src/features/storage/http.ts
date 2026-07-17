import { NextResponse } from "next/server";

import { StorageError } from "@/lib/adapters/storage";

/**
 * Shared HTTP translation for the storage routes.
 *
 * `NOT_CONFIGURED` → 404: when STORAGE_PROVIDER=none the adapter throws it on
 * every call, and the route should look like it doesn't exist, exactly as
 * BILLING_PROVIDER=none makes the webhook route 404 rather than advertising an
 * endpoint the deployment can't honour. Any other storage failure is a real 502.
 *
 * Returns null for anything that isn't a StorageError, so the caller can rethrow
 * navigation errors (`forbidden()`/`notFound()`/redirects) untouched.
 */
export function storageErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof StorageError) {
    if (err.code === "NOT_CONFIGURED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Storage unavailable" }, { status: 502 });
  }
  return null;
}
