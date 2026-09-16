import { and, eq, isNull, lt, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { file } from "@/lib/db/schema";

/**
 * Storage data-access layer (spec 21.3 / 11.2 — tenant-scoped queries).
 *
 * Every read/write here is scoped by the file's tenant owner, so isolation is
 * enforced in the data layer, not the UI (the same invariant as
 * `features/organizations/data.ts`). A caller resolves WHICH owner it is acting
 * as — an org from a slug, or a personal account from the session — and passes it
 * as a `FileOwner`; nothing here trusts an id off the request without that owner.
 *
 * Reads filter `isNull(file.deletedAt)` so a soft-deleted file is invisible the
 * instant it is deleted (spec 21.4), long before the retention purge removes it.
 */

/** The tenant a storage operation acts as. Exactly one owner, mirroring the XOR. */
export type FileOwner =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

/** The owner predicate — an org file is matched by org id, a personal file by account id. */
function ownerWhere(owner: FileOwner): SQL {
  return owner.kind === "organization"
    ? eq(file.organizationId, owner.organizationId)
    : eq(file.accountId, owner.accountId);
}

/** Columns to persist on the owner, spread into an insert. */
function ownerColumns(owner: FileOwner): { organizationId?: string; accountId?: string } {
  return owner.kind === "organization"
    ? { organizationId: owner.organizationId }
    : { accountId: owner.accountId };
}

export type NewFile = {
  owner: FileOwner;
  uploadedByUserId: string;
  key: string;
  originalName: string;
  contentType: string;
  size: number;
  visibility: "public" | "private";
};

/** Insert a pending file row (created at presign time). Returns the new id. */
export async function createFileRecord(input: NewFile): Promise<string> {
  const [row] = await db
    .insert(file)
    .values({
      ...ownerColumns(input.owner),
      uploadedByUserId: input.uploadedByUserId,
      key: input.key,
      originalName: input.originalName,
      contentType: input.contentType,
      size: input.size,
      visibility: input.visibility,
      status: "pending",
    })
    .returning({ id: file.id });
  return row!.id;
}

/** Flip a pending row to ready once the client confirms the upload (owner-scoped). */
export async function markFileReady(owner: FileOwner, fileId: string): Promise<boolean> {
  const rows = await db
    .update(file)
    .set({ status: "ready", updatedAt: new Date() })
    .where(and(eq(file.id, fileId), ownerWhere(owner), isNull(file.deletedAt)))
    .returning({ id: file.id });
  return rows.length > 0;
}

/**
 * A single file, ONLY if it belongs to `owner` and is not deleted. Returns null
 * for a file owned by a different tenant — this is the tenant-isolation
 * chokepoint the read route relies on to answer 404 (spec 21.3).
 */
export async function getFileForOwner(owner: FileOwner, fileId: string) {
  const [row] = await db
    .select()
    .from(file)
    .where(and(eq(file.id, fileId), ownerWhere(owner), isNull(file.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** All non-deleted files for an owner, newest first. */
export async function listFilesForOwner(owner: FileOwner) {
  return db
    .select()
    .from(file)
    .where(and(ownerWhere(owner), isNull(file.deletedAt)))
    .orderBy(file.createdAt);
}

/** Soft-delete a file (owner-scoped). Returns false if it wasn't the owner's. */
export async function softDeleteFile(owner: FileOwner, fileId: string): Promise<boolean> {
  const rows = await db
    .update(file)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(file.id, fileId), ownerWhere(owner), isNull(file.deletedAt)))
    .returning({ id: file.id });
  return rows.length > 0;
}

/**
 * Files soft-deleted before `cutoff` — the retention purge's work list (spec
 * 21.4). NOT owner-scoped on purpose: this runs from cron, belongs to no tenant,
 * and is the one query type allowed to cross owners (the same carve-out billing's
 * webhook resolution uses).
 */
export async function listPurgeableFiles(cutoff: Date, limit = 100) {
  return (
    db
      // The owner columns are selected for the AUDIT entry (spec 6.4), not for the
      // deletion — the purge itself only needs the id and the key. An org's files
      // vanishing with nothing in its trail to explain why is precisely the kind of
      // silent system action §6.4 exists to surface.
      .select({
        id: file.id,
        key: file.key,
        organizationId: file.organizationId,
        accountId: file.accountId,
      })
      .from(file)
      .where(and(lt(file.deletedAt, cutoff)))
      .limit(limit)
  );
}

/** Hard-delete a row after its object has been removed from the bucket. */
export async function hardDeleteFile(fileId: string): Promise<void> {
  await db.delete(file).where(eq(file.id, fileId));
}
